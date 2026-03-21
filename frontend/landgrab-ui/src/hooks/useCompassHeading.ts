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

const HEADING_SYNC_INTERVAL_MS = 150;

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
          setHeading(headingRef.current);
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
      headingRef.current = prev === null ? rawHeading : 0.7 * prev + 0.3 * rawHeading;
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
      headingRef.current = prev === null ? webkitCompassHeading : 0.7 * prev + 0.3 * webkitCompassHeading;
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
