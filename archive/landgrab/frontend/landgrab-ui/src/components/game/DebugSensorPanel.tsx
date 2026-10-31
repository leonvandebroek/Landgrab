import { useState } from 'react';
import { useUiStore } from '../../stores/uiStore';
import { useDeviceOrientation } from '../../hooks/useDeviceOrientation';
import { useDeviceMotion } from '../../hooks/useDeviceMotion';

export function DebugSensorPanel() {
  const [collapsed, setCollapsed] = useState(true);

  const debugHeading = useUiStore((state) => state.debugHeading);
  const debugPitch = useUiStore((state) => state.debugPitch);
  const setDebugHeading = useUiStore((state) => state.setDebugHeading);
  const setDebugPitch = useUiStore((state) => state.setDebugPitch);

  const { sensorHeading } = useDeviceOrientation(true);
  const { sensorPitch } = useDeviceMotion(true);

  const activeHeading = debugHeading !== null ? debugHeading : (sensorHeading ?? 0);
  const activePitch = debugPitch !== null ? debugPitch : (sensorPitch ?? 0);

  return (
    <aside
      className={`debug-gps-panel compact${!collapsed ? ' is-active' : ''}${collapsed ? ' collapsed' : ''}`}
      data-testid="debug-sensor-panel"
    >
      <div className="debug-gps-collapse-row">
        <span>Sensors</span>
        <button
          type="button"
          className="debug-gps-collapse-toggle"
          onClick={() => setCollapsed(c => !c)}
          aria-label="Toggle"
        >
          {collapsed ? '▼' : '▲'}
        </button>
      </div>
      {!collapsed && (
        <div className="debug-sensor-body">
          <div>
            <label htmlFor="debug-heading">Heading</label>
            <input id="debug-heading" type="range" min="0" max="359" value={Math.round(activeHeading)} onChange={e => setDebugHeading(Number(e.target.value))} />
            <button onClick={() => setDebugHeading(null)} disabled={debugHeading===null}>Rst</button>
            <div>Val: {Math.round(activeHeading)} Sens: {sensorHeading ?? 'N/A'}</div>
          </div>
          <div>
            <label htmlFor="debug-pitch">Pitch</label>
            <input id="debug-pitch" type="range" min="-90" max="90" value={Math.round(activePitch)} onChange={e => setDebugPitch(Number(e.target.value))} />
            <button onClick={() => setDebugPitch(null)} disabled={debugPitch===null}>Rst</button>
            <div>Val: {Math.round(activePitch)} Sens: {sensorPitch ?? 'N/A'}</div>
          </div>
        </div>
      )}
    </aside>
  );
}
