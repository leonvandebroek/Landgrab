import { useCallback, useEffect, useRef, useState } from 'react';
import { useUiStore } from '../stores/uiStore';

type DeviceMotionPermissionState = 'unavailable' | 'prompt' | 'granted' | 'denied';

interface DeviceMotionEventWithPermission {
  requestPermission?: () => Promise<string>;
}

export interface DeviceMotionState {
  pitch: number | null;
  sensorPitch: number | null;
  supported: boolean;
  permissionState: DeviceMotionPermissionState;
  requestPermission: () => Promise<void>;
}

const PITCH_SYNC_INTERVAL_MS = 100;

function getInitialMotionState(): {
  supported: boolean;
  permissionState: DeviceMotionPermissionState;
} {
  if (typeof window === 'undefined' || !('DeviceMotionEvent' in window)) {
    return {
      supported: false,
      permissionState: 'unavailable'
    };
  }

  const requestPermission = (window.DeviceMotionEvent as unknown as DeviceMotionEventWithPermission)?.requestPermission;

  return {
    supported: true,
    permissionState: typeof requestPermission === 'function' ? 'prompt' : 'granted'
  };
}

export function useDeviceMotion(enabled: boolean): DeviceMotionState {
  const initialState = getInitialMotionState();
  const [pitch, setPitch] = useState<number | null>(null);
  const [supported, setSupported] = useState(initialState.supported);
  const [permissionState, setPermissionState] = useState<DeviceMotionPermissionState>(
    initialState.permissionState
  );

  const pitchRef = useRef<number | null>(null);
  const lastSyncRef = useRef<number>(0);
  const rafIdRef = useRef<number>(0);

  const debugPitch = useUiStore((state) => state.debugPitch);

  const requestPermission = useCallback(async () => {
    if (typeof window === 'undefined' || !('DeviceMotionEvent' in window)) {
      setSupported(false);
      setPermissionState('unavailable');
      return;
    }

    const requestPermissionFn = (window.DeviceMotionEvent as unknown as DeviceMotionEventWithPermission)?.requestPermission;

    if (typeof requestPermissionFn !== 'function') {
      setSupported(true);
      setPermissionState('granted');
      return;
    }

    try {
      const result = await requestPermissionFn.call(window.DeviceMotionEvent);

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
        if (now - lastSyncRef.current >= PITCH_SYNC_INTERVAL_MS) {
          lastSyncRef.current = now;
          setPitch(pitchRef.current);
        }
      });
    };

    const stopListening = () => {
      if (!isListening) {
        return;
      }

      window.removeEventListener('devicemotion', handleMotion);
      isListening = false;
    };

    const handleMotion = (event: DeviceMotionEvent) => {
      const accelX = event.accelerationIncludingGravity?.x;
      const accelY = event.accelerationIncludingGravity?.y;
      const accelZ = event.accelerationIncludingGravity?.z;

      if (typeof accelX !== 'number' || typeof accelY !== 'number' || typeof accelZ !== 'number') {
        return;
      }

      const rawPitch = Math.atan2(accelY, Math.sqrt(accelX * accelX + accelZ * accelZ)) * (180 / Math.PI);
      const prev = pitchRef.current;
      pitchRef.current = prev === null ? rawPitch : 0.7 * prev + 0.3 * rawPitch;
      scheduleStateSync();
    };

    const startListening = () => {
      if (document.hidden || isListening) {
        return;
      }

      window.addEventListener('devicemotion', handleMotion);
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
    pitch: debugPitch !== null ? debugPitch : pitch,
    sensorPitch: pitch,
    supported,
    permissionState,
    requestPermission,
  };
}
