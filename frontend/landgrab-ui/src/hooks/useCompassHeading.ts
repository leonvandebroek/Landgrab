import { useCallback, useEffect, useState } from 'react';

type CompassPermissionState = 'unavailable' | 'prompt' | 'granted' | 'denied';

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

  const requestPermission = (window.DeviceOrientationEvent as any)?.requestPermission;

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

    const requestPermissionFn = (window.DeviceOrientationEvent as any)?.requestPermission;

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
      setHeading(null);
      return;
    }

    if (typeof window === 'undefined' || typeof document === 'undefined') {
      setHeading(null);
      return;
    }

    let isListening = false;
    let hasValidatedAbsolute = false;

    const stopListening = () => {
      if (!isListening) {
        return;
      }

      window.removeEventListener('deviceorientationabsolute', handleOrientation);
      isListening = false;
    };

    const handleOrientation = (event: DeviceOrientationEvent) => {
      if (!hasValidatedAbsolute) {
        hasValidatedAbsolute = true;

        if (event.absolute !== true) {
          stopListening();
          setHeading(null);
          setSupported(false);
          return;
        }
      }

      const webkitCompassHeading = (event as any).webkitCompassHeading;
      const rawHeading =
        typeof webkitCompassHeading === 'number'
          ? webkitCompassHeading
          : (360 - (event.alpha ?? 0)) % 360;

      setHeading(previousHeading =>
        previousHeading === null ? rawHeading : 0.7 * previousHeading + 0.3 * rawHeading
      );
    };

    const startListening = () => {
      if (document.hidden || isListening) {
        return;
      }

      window.addEventListener('deviceorientationabsolute', handleOrientation);
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
    heading: enabled ? heading : null,
    supported,
    permissionState,
    requestPermission
  };
}
