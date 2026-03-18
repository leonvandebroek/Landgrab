import { memo, useMemo } from 'react';
import type { CSSProperties } from 'react';
import { gameIcons } from '../../utils/gameIcons';
import { hexToHSL } from '../../utils/hexColorUtils';

interface TroopBadgeProps {
  troops: number;
  ownerColor?: string;
  isFort?: boolean;
  isHQ?: boolean;
  isMasterTile?: boolean;
  isForestBlind?: boolean;
}

const DEFAULT_OWNER_COLOR = '#4f8cff';
const TROOP_COUNT_SIZE_VAR = '--troop-count-size' as const;

export const TroopBadge = memo(function TroopBadge({
  troops,
  ownerColor = DEFAULT_OWNER_COLOR,
  isFort = false,
  isHQ = false,
  isMasterTile = false,
  isForestBlind = false,
}: TroopBadgeProps) {
  const troopLabel = isForestBlind ? '?' : String(troops);

  const badge = useMemo(() => {
    // Playful sizing: Chunky and readable (matches hexRendering.ts)
    const badgeSize = Math.round(Math.min(48, Math.max(28, 30 + Math.log2(Math.max(1, troops)) * 4)));
    const troopCountLength = troopLabel.length;
    // Fredoka is rounded, needs good size
    const countFontSize = troopCountLength >= 3
      ? Math.max(12, Math.round(badgeSize * 0.4))
      : Math.max(14, Math.round(badgeSize * 0.5));
      
    const ringPct = Math.min(100, troops * 2);
    const prefixMarkup = getPrefixMarkup(isMasterTile, isHQ);
    const { h: badgeHue, s: badgeSaturation } = hexToHSL(ownerColor);
    
    // Playful Candy Button Look (Dark Arcade Mode)
    // Gradient: Vibrant top-down light-to-dark for volume
    const badgeBg = `linear-gradient(180deg, hsl(${Math.round(badgeHue)},${Math.round(badgeSaturation)}%,65%) 0%, hsl(${Math.round(badgeHue)},${Math.round(badgeSaturation)}%,45%) 100%)`;
    const badgeBorderColor = '#ffffff';
    
    // Pop shadow: Outer white glow for separation from dark map + Hard shadow for 3D + Inset highlight
    const badgeGlow = '0 0 15px rgba(255, 255, 255, 0.25), 0 4px 0 rgba(0,0,0,0.4), inset 0 2px 0 rgba(255,255,255,0.5), inset 0 -2px 0 rgba(0,0,0,0.2)';

    return {
      badgeSize,
      badgeBg,
      badgeBorderColor,
      badgeGlow,
      countFontSize,
      prefixMarkup,
      ringPct,
    };
  }, [isHQ, isMasterTile, ownerColor, troopLabel.length, troops]);

  const badgeClassName = [
    'hex-troop-badge',
    isForestBlind ? 'forest-blind' : '',
    isMasterTile ? 'master-badge' : '',
    isHQ ? 'hq-badge' : '',
    isFort ? 'fort-badge' : '',
    troops === 0 ? 'zero-troops' : '',
  ].filter(Boolean).join(' ');

  const badgeStyle = {
    width: badge.badgeSize,
    height: badge.badgeSize,
    background: badge.badgeBg,
    borderColor: badge.badgeBorderColor,
    boxShadow: badge.badgeGlow,
    borderWidth: '3px',
    borderStyle: 'solid',
    borderRadius: '50%',
    fontFamily: '"Fredoka", system-ui, sans-serif',
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'white',
    [TROOP_COUNT_SIZE_VAR]: `${badge.countFontSize}px`,
  } satisfies CSSProperties & Record<typeof TROOP_COUNT_SIZE_VAR, string>;

  return (
    <div className={badgeClassName} style={badgeStyle}>
      <svg 
        className="troop-ring" 
        viewBox="0 0 36 36" 
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: '-3px',
          left: '-3px',
          width: 'calc(100% + 6px)',
          height: 'calc(100% + 6px)',
          pointerEvents: 'none',
        }}
      >
        <circle
          cx="18"
          cy="18"
          r="16"
          fill="none"
          stroke="rgba(255,255,255,0.4)"
          strokeWidth="4"
          strokeDasharray={`${badge.ringPct} ${100 - badge.ringPct}`}
          strokeDashoffset="25"
          opacity="1"
          strokeLinecap="round"
        />
      </svg>
      {badge.prefixMarkup ? (
        <span
          className="troop-badge-prefix"
          aria-hidden="true"
          style={{ marginRight: '2px', display: 'flex', alignItems: 'center' }}
          dangerouslySetInnerHTML={{ __html: badge.prefixMarkup }}
        />
      ) : null}
      <span 
        className="troop-count" 
        style={{ 
          lineHeight: 1, 
          color: troops === 0 ? 'rgba(255,255,255,0.8)' : undefined 
        }}
      >
        {troopLabel}
      </span>
    </div>
  );
});

function getPrefixMarkup(isMasterTile: boolean, isHQ: boolean): string {
  if (isMasterTile) {
    return gameIcons.master.replace(
      /<svg\b([^>]*)>/i,
      '<svg$1 width="0.9em" height="0.9em" style="color:#fcd34d">', // Amber-300
    );
  }

  if (isHQ) {
    return gameIcons.hq.replace(
      /<svg\b([^>]*)>/i,
      '<svg$1 width="0.9em" height="0.9em" style="color:#fcd34d">',
    );
  }

  return '';
}
