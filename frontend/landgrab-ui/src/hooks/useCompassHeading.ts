import { useCallback, useEffect, useRef, useState } from 'react';

type CompassPermissionState = 'unavailable' | 'prompt' | 'granted' | 'denied';

interface DeviceOrientationEventWithPermission {
  requestPermission?: () => Promise<string>;
}

interface DeviceOrientationEventWithWebkit extends DeviceOrientationEvent {
  webkitCompassHeading?: number;
}

export interface CompassHeadingState {
  heading: number | null;
  headingRef: React.RefObject<number | null>;
  supported: boolean;
  permissionState: CompassPermissionState;
  requestPermission: () => Promise<void>;
}

const HEADING_SYNC_INTERVAL_MS = 50;
const HEADING_DEADBAND_DEGREES = 1.2;
const HEADING_QUANTIZATION_DEGREES = 1;

/** Angular-aware EMA that handles 0/360° wraparound correctly. */
function smoothAngle(prev: number, raw: number, alpha: number): number {
  let diff = raw - prev;
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;
  return ((prev + alpha * diff) % 360 + 360) % 360;
}

function angularDistance(a: number, b: number): number {
  let diff = Math.abs(a - b) % 360;
  if (diff > 180) {
    diff = 360 - diff;
  }
  return diff;
}

function quantizeHeading(heading: number, step: number): number {
  if (step <= 0) {
    return ((heading % 360) + 360) % 360;
  }

  const normalized = ((heading % 360) + 360) % 360;
  return (Math.round(normalized / step) * step) % 360;
}

function getInitialCompassState(): {
  supported: boolean;
  permissionState: CompassPermissionState;
} {
  if (typeof window === 'undefined' || !('DeviceOrientationEvent' in window)) {
    return {
      supported: false,
      permissionState: 'unavailable'
    };
  }

  const requestPermission = (window.DeviceOrientationEvent as unknown as DeviceOrientationEventWithPermission)?.requestPermission;

  return {
    supported: true,
    permissionState: typeof requestPermission === 'function' ? 'prompt' : 'granted'
  };
}

export function useCompassHeading(enabled: boolean): CompassHeadingState {
  const initialState = getInitialCompassState();
  const [heading, setHeading] = useState<number | null>(null);
  const [supported, setSupported] = useState(initialState.supported);
  const [permissionState, setPermissionState] = useState<CompassPermissionState>(
    initialState.permissionState
  );

  const headingRef = useRef<number | null>(null);
  const publishedHeadingRef = useRef<number | null>(null);
  const lastSyncRef = useRef<number>(0);
  const rafIdRef = useRef<number>(0);

  const requestPermission = useCallback(async () => {
    if (typeof window === 'undefined' || !('DeviceOrientationEvent' in window)) {
      setSupported(false);
      setPermissionState('unavailable');
      return;
    }

    const requestPermissionFn = (window.DeviceOrientationEvent as unknown as DeviceOrientationEventWithPermission)?.requestPermission;

    if (typeof requestPermissionFn !== 'function') {
      setSupported(true);
      setPermissionState('granted');
      return;
    }

    try {
      const result = await requestPermissionFn.call(window.DeviceOrientationEvent);

      if (result === 'granted') {
        setSupported(true);
        setPermissionState('granted');
        return;
      }

      setPermissionState('denied');
    } catch {
      setPermissionState('denied');
    }
  }, []);

  useEffect(() => {
    if (!enabled || !supported || permissionState !== 'granted') {
      return;
    }

    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return;
    }

    let isListening = false;

    const scheduleStateSync = () => {
      if (rafIdRef.current) {
        return;
      }
      rafIdRef.current = window.requestAnimationFrame(() => {
        rafIdRef.current = 0;
        const now = performance.now();
        if (now - lastSyncRef.current >= HEADING_SYNC_INTERVAL_MS) {
          lastSyncRef.current = now;
          const nextHeading = headingRef.current;
          if (nextHeading === null) {
            if (publishedHeadingRef.current !== null) {
              publishedHeadingRef.current = null;
              setHeading(null);
            }
            return;
          }

          const quantizedHeading = quantizeHeading(nextHeading, HEADING_QUANTIZATION_DEGREES);
          const previousHeading = publishedHeadingRef.current;

          if (
            previousHeading !== null
            && angularDistance(previousHeading, quantizedHeading) < HEADING_DEADBAND_DEGREES
          ) {
            return;
          }

          publishedHeadingRef.current = quantizedHeading;
          setHeading(quantizedHeading);
        } else {
          scheduleStateSync();
        }
      });
    };

    // Android/Chrome: `deviceorientationabsolute` always carries an absolute
    // magnetic-north heading via `alpha` (event.absolute === true guaranteed).
    const handleAbsoluteOrientation = (event: DeviceOrientationEvent) => {
      if (typeof event.alpha !== 'number') {
        return;
      }
      const rawHeading = (360 - event.alpha) % 360;
      const prev = headingRef.current;
      headingRef.current = prev === null ? rawHeading : smoothAngle(prev, rawHeading, 0.15);
      scheduleStateSync();
    };

    // iOS Safari: never fires `deviceorientationabsolute`. Instead it fires the
    // plain `deviceorientation` event and exposes the compass heading via the
    // proprietary `webkitCompassHeading` property (0–360, clockwise from north).
    // On Chrome/Android the plain event fires too but without `webkitCompassHeading`,
    // so this handler is effectively a no-op there — no double-update risk.
    const handleiOSOrientation = (event: DeviceOrientationEvent) => {
      const webkitCompassHeading = (event as DeviceOrientationEventWithWebkit).webkitCompassHeading;
      if (typeof webkitCompassHeading !== 'number' || isNaN(webkitCompassHeading)) {
        return;
      }
      const prev = headingRef.current;
      headingRef.current = prev === null ? webkitCompassHeading : smoothAngle(prev, webkitCompassHeading, 0.15);
      scheduleStateSync();
    };

    const stopListening = () => {
      if (!isListening) {
        return;
      }
      window.removeEventListener('deviceorientationabsolute', handleAbsoluteOrientation);
      window.removeEventListener('deviceorientation', handleiOSOrientation);
      isListening = false;
    };

    const startListening = () => {
      if (document.hidden || isListening) {
        return;
      }
      window.addEventListener('deviceorientationabsolute', handleAbsoluteOrientation);
      window.addEventListener('deviceorientation', handleiOSOrientation);
      isListening = true;
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopListening();
        return;
      }

      if (enabled && supported && permissionState === 'granted') {
        startListening();
      }
    };

    startListening();
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      stopListening();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (rafIdRef.current) {
        window.cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = 0;
      }
      publishedHeadingRef.current = null;
    };
  }, [enabled, permissionState, supported]);

  return {
    heading: enabled && supported && permissionState === 'granted' ? heading : null,
    headingRef,
    supported,
    permissionState,
    requestPermission
  };
}
