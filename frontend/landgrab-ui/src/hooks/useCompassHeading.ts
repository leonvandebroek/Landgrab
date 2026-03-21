import { useCallback, useEffect, useState } from 'react';

type CompassPermissionState = 'unavailable' | 'prompt' | 'granted' | 'denied';

interface DeviceOrientationEventWithPermission {
  requestPermission?: () => Promise<string>;
}

interface DeviceOrientationEventWithWebkit extends DeviceOrientationEvent {
  webkitCompassHeading?: number;
}

interface CompassHeadingState {
  heading: number | null;
  supported: boolean;
  permissionState: CompassPermissionState;
  requestPermission: () => Promise<void>;
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

    // Android/Chrome: `deviceorientationabsolute` always carries an absolute
    // magnetic-north heading via `alpha` (event.absolute === true guaranteed).
    const handleAbsoluteOrientation = (event: DeviceOrientationEvent) => {
      if (typeof event.alpha !== 'number') {
        return;
      }
      const rawHeading = (360 - event.alpha) % 360;
      setHeading(prev => prev === null ? rawHeading : 0.7 * prev + 0.3 * rawHeading);
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
      setHeading(prev => prev === null ? webkitCompassHeading : 0.7 * prev + 0.3 * webkitCompassHeading);
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
    };
  }, [enabled, permissionState, supported]);

  return {
    heading: enabled && supported && permissionState === 'granted' ? heading : null,
    supported,
    permissionState,
    requestPermission
  };
}
