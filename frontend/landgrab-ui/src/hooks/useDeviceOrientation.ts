import { useCompassHeading } from './useCompassHeading';
import { useUiStore } from '../stores/uiStore';

export interface DeviceOrientationState {
  heading: number | null;
  sensorHeading: number | null;
  supported: boolean;
  permissionState: 'unavailable' | 'prompt' | 'granted' | 'denied';
  requestPermission: () => Promise<void>;
}

export function useDeviceOrientation(enabled: boolean): DeviceOrientationState {
  const { heading: sensorHeading, supported, permissionState, requestPermission } = useCompassHeading(enabled);
  const debugHeading = useUiStore((state) => state.debugHeading);

  return {
    heading: debugHeading !== null ? debugHeading : sensorHeading,
    sensorHeading,
    supported,
    permissionState,
    requestPermission,
  };
}
