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
    const badgeSize = Math.round(Math.min(38, Math.max(20, 22 + Math.log2(Math.max(1, troops)) * 3)));
    const troopCountLength = troopLabel.length;
    const countFontSize = troopCountLength >= 3
      ? Math.max(10, Math.round(badgeSize * 0.34))
      : Math.max(11, Math.round(badgeSize * 0.4));
    const ringPct = Math.min(100, troops * 2);
    const prefixMarkup = getPrefixMarkup(isMasterTile, isHQ);
    const { h: badgeHue, s: badgeSaturation } = hexToHSL(ownerColor);
    const badgeBg = `hsla(${Math.round(badgeHue)},${Math.round(badgeSaturation * 0.8)}%,22%,0.97)`;
    const badgeBorderColor = `hsla(${Math.round(badgeHue)},${Math.round(badgeSaturation * 0.65)}%,48%,0.85)`;
    const badgeGlow = troops >= 20
      ? `0 0 12px hsla(${Math.round(badgeHue)},${Math.round(badgeSaturation)}%,50%,0.50),0 2px 6px rgba(0,0,0,0.4)`
      : '0 2px 8px rgba(0,0,0,0.45)';

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
  ].filter(Boolean).join(' ');

  const badgeStyle = {
    width: badge.badgeSize,
    height: badge.badgeSize,
    background: badge.badgeBg,
    borderColor: badge.badgeBorderColor,
    boxShadow: badge.badgeGlow,
    backdropFilter: 'blur(3px)',
    [TROOP_COUNT_SIZE_VAR]: `${badge.countFontSize}px`,
  } satisfies CSSProperties & Record<typeof TROOP_COUNT_SIZE_VAR, string>;

  return (
    <div className={badgeClassName} style={badgeStyle}>
      <svg className="troop-ring" viewBox="0 0 36 36" aria-hidden="true">
        <circle
          cx="18"
          cy="18"
          r="16"
          fill="none"
          stroke={ownerColor}
          strokeWidth="2.5"
          strokeDasharray={`${badge.ringPct} ${100 - badge.ringPct}`}
          strokeDashoffset="25"
          opacity="0.6"
        />
      </svg>
      {badge.prefixMarkup ? (
        <span
          className="troop-badge-prefix"
          aria-hidden="true"
          dangerouslySetInnerHTML={{ __html: badge.prefixMarkup }}
        />
      ) : null}
      <span className="troop-count">{troopLabel}</span>
    </div>
  );
});

function getPrefixMarkup(isMasterTile: boolean, isHQ: boolean): string {
  if (isMasterTile) {
    return gameIcons.master.replace(
      /<svg\b([^>]*)>/i,
      '<svg$1 width="0.85em" height="0.85em" style="color:#ffe08a">',
    );
  }

  if (isHQ) {
    return gameIcons.hq.replace(
      /<svg\b([^>]*)>/i,
      '<svg$1 width="0.85em" height="0.85em" style="color:#f1c40f">',
    );
  }

  return '';
}
