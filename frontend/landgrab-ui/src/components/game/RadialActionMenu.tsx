import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { HexCell, Player } from '../../types/game';
import type { TileAction, TileActionType } from './tileInteraction';
import { RadialSegment } from './RadialSegment';

interface Props {
  actions: TileAction[];
  onAction: (type: TileActionType) => void;
  onDismiss: () => void;
  position: { x: number; y: number }; // screen pixel coords
  targetCell: HexCell | undefined;
  player: Player | null;
}

const TONE_COLORS: Record<TileAction['tone'], string> = {
  primary: '#3498db',
  danger: '#e74c3c',
  info: '#2ecc71',
  neutral: '#95a5a6',
};

export function RadialActionMenu({ actions, onAction, onDismiss, position, targetCell, player }: Props) {
  const { t } = useTranslation();

  // ── Escape key dismisses the menu ──
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onDismiss(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onDismiss]);

  const radius = Math.min(120, Math.min(window.innerWidth, window.innerHeight) * 0.17);
  const innerRadius = 30;
  const svgSize = (radius + 14) * 2;

  // Viewport collision detection: shift position inward if menu would overflow edges
  const adjustedPos = useMemo(() => {
    const margin = radius + 14;
    return {
      x: Math.max(margin, Math.min(window.innerWidth - margin, position.x)),
      y: Math.max(margin, Math.min(window.innerHeight - margin, position.y)),
    };
  }, [position, radius]);

  if (actions.length === 0) return null;

  const anglePerAction = (Math.PI * 2) / actions.length;
  const startOffset = -Math.PI / 2; // first slice at 12-o'clock

  // Center circle info
  const troopCount = targetCell?.troops ?? 0;
  const ownerName = targetCell?.ownerName;
  const carriedTroops = player?.carriedTroops ?? 0;

  return (
    <>
      {/* Full-screen transparent backdrop */}
      <div
        className="radial-backdrop"
        onClick={onDismiss}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9000,
          background: 'rgba(0, 0, 0, 0.25)',
        }}
      />

      {/* Radial menu container */}
      <div
        className="radial-menu"
        style={{
          position: 'fixed',
          left: adjustedPos.x,
          top: adjustedPos.y,
          transform: 'translate(-50%, -50%)',
          zIndex: 9001,
          pointerEvents: 'auto',
        }}
      >
        <svg
          width={svgSize}
          height={svgSize}
          viewBox={`${-svgSize / 2} ${-svgSize / 2} ${svgSize} ${svgSize}`}
        >
          {/* Action segments */}
          {actions.map((action, i) => (
            <RadialSegment
              key={action.type}
              startAngle={startOffset + i * anglePerAction}
              endAngle={startOffset + (i + 1) * anglePerAction}
              radius={radius}
              innerRadius={innerRadius}
              color={TONE_COLORS[action.tone]}
              icon={action.icon}
              label={t(action.label as never)}
              enabled={action.enabled}
              onClick={() => onAction(action.type)}
            />
          ))}

          {/* Center circle: tile info */}
          <circle
            r={innerRadius}
            fill="var(--surface, #1a2740)"
            stroke="rgba(255,255,255,0.15)"
            strokeWidth={1}
          />
          <text
            x={0}
            y={ownerName ? -7 : 0}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={14}
            fontWeight="bold"
            fill="var(--text, #ecf0f1)"
            style={{ pointerEvents: 'none' }}
          >
            ⚔️ {troopCount}
          </text>
          {ownerName && (
            <text
              x={0}
              y={8}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={7}
              fill="var(--muted, #8899aa)"
              style={{ pointerEvents: 'none' }}
            >
              {ownerName.slice(0, 8)}
            </text>
          )}
          <text
            x={0}
            y={ownerName ? 19 : 13}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={7}
            fill="var(--muted, #8899aa)"
            style={{ pointerEvents: 'none' }}
          >
            🎒 {carriedTroops}
          </text>
        </svg>
      </div>
    </>
  );
}
