import { useEffect, useRef } from 'react';
import { useCompassHeading } from './useCompassHeading';
import { useUiStore } from '../stores/uiStore';

export interface DeviceOrientationState {
  heading: number | null;
  headingRef: React.RefObject<number | null>;
  sensorHeading: number | null;
  supported: boolean;
  permissionState: 'unavailable' | 'prompt' | 'granted' | 'denied';
  requestPermission: () => Promise<void>;
}

export function useDeviceOrientation(enabled: boolean): DeviceOrientationState {
  const { heading: sensorHeading, headingRef: sensorHeadingRef, supported, permissionState, requestPermission } = useCompassHeading(enabled);
  const debugHeading = useUiStore((state) => state.debugHeading);
  const debugHeadingRef = useRef<number | null>(null);

  useEffect(() => {
    debugHeadingRef.current = debugHeading;
  }, [debugHeading]);

  return {
    heading: debugHeading !== null ? debugHeading : sensorHeading,
    headingRef: debugHeading !== null ? debugHeadingRef : sensorHeadingRef,
    sensorHeading,
    supported,
    permissionState,
    requestPermission,
  };
}
