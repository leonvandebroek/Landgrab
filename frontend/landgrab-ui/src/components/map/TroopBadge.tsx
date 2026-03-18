import { memo, useMemo } from 'react';
import type { CSSProperties } from 'react';
import { gameIcons } from '../../utils/gameIcons';

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
    
    // Playful Candy Button Look (Dark Arcade Mode)
    // Updated to MATCH PlayerLayer.tsx exactly: Slate Glass + Neon Border
    
    // Instead of colored fill, use Slate Glass gradient like PlayerLayer
    // PlayerLayer uses: linear-gradient(135deg, rgba(30, 41, 59, 0.95), rgba(15, 23, 42, 0.95))
    const badgeBg = `linear-gradient(135deg, rgba(30, 41, 59, 0.95), rgba(15, 23, 42, 0.95))`;
    
    // Neon Border (PlayerLayer uses 2px solid baseColor)
    // We use slightly thicker 2.5px for badge visibility
    const badgeBorderColor = ownerColor; 
    
    // Pop shadow: Neon glow matching PlayerLayer
    // PlayerLayer uses: 0 0 15px ${withAlpha(baseColor, 0.5)}
    const badgeGlow = `0 0 12px ${ownerColor}, 0 4px 8px rgba(0,0,0,0.5)`;

    return {
      badgeSize: Math.max(30, badgeSize), // Ensure minimum tappable/readable size
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
    borderWidth: '2.5px', 
    borderStyle: 'solid',
    borderRadius: '50%',
    fontFamily: '"Fredoka", system-ui, sans-serif',
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#f1f5f9', // Slate-100 (same as PlayerLayer)
    position: 'relative', 
    zIndex: 700,
    [TROOP_COUNT_SIZE_VAR]: `${badge.countFontSize}px`,
  } satisfies CSSProperties & Record<typeof TROOP_COUNT_SIZE_VAR, string>;

  // Inner sheen for that "glass" look
  const sheenStyle: CSSProperties = {
    position: 'absolute',
    top: '0',
    left: '0',
    right: '0',
    bottom: '0',
    background: 'linear-gradient(180deg, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0) 60%)',
    borderRadius: '50%',
    pointerEvents: 'none',
  };

  return (
    <div className={badgeClassName} style={badgeStyle}>
       <div style={sheenStyle} />
       
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
