import { memo } from 'react';
import type { CSSProperties } from 'react';
import { gameIcons } from '../../utils/gameIcons';

interface TroopBadgeProps {
  troops: number;
  ownerColor?: string;
  isFort?: boolean;
  isHQ?: boolean;
  isMasterTile?: boolean;
  isForestBlind?: boolean;
  isEnemy?: boolean;
  q?: number;
  r?: number;
  showCoords?: boolean;
}

function formatTroopCount(n: number): string {
  if (n >= 10000) return `${Math.round(n / 1000)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export const TroopBadge = memo(function TroopBadge({
  troops,
  ownerColor,
  isFort = false,
  isHQ = false,
  isMasterTile = false,
  isForestBlind = false,
  isEnemy,
  q,
  r,
  showCoords = false,
}: TroopBadgeProps) {
  const troopLabel = isForestBlind ? '?' : formatTroopCount(troops);

  const masterPrefixText = isMasterTile ? '★ ' : '';
  const hqPrefixMarkup = !isMasterTile ? getHqPrefixMarkup(isHQ) : '';

  const badgeClassName = [
    'hex-troop-badge',
    isEnemy === true ? 'enemy-badge' : '',
    isEnemy === false ? 'friendly-badge' : '',
    isForestBlind ? 'forest-blind' : '',
    isMasterTile ? 'master-badge' : '',
    isHQ ? 'hq-badge' : '',
    isFort ? 'fort-badge' : '',
    troops === 0 ? 'zero-troops' : '',
  ].filter(Boolean).join(' ');

  const badgeStyle: CSSProperties & { '--badge-border-color'?: string } = {
    height: isHQ ? 22 : 18,
    minWidth: isHQ ? 22 : 18,
    padding: isHQ ? '0 8px' : '0 4px',
    '--badge-border-color': ownerColor ?? 'rgba(255,255,255,0.25)',
  };

  const coordinateLabel = showCoords && q != null && r != null
    ? `${q},${r}`
    : undefined;

  const troopDisplayContent = (
    <>
      {masterPrefixText ? (
        <span
          className="troop-badge-prefix"
          aria-hidden="true"
          style={{ marginRight: '2px', display: 'flex', alignItems: 'center' }}
        >
          {masterPrefixText}
        </span>
      ) : null}
      {hqPrefixMarkup ? (
        <span
          className="troop-badge-prefix"
          aria-hidden="true"
          style={{ marginRight: '2px', display: 'flex', alignItems: 'center' }}
          dangerouslySetInnerHTML={{ __html: hqPrefixMarkup }}
        />
      ) : null}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minWidth: 0 }}>
        <span 
          className="troop-count" 
          style={{ 
            lineHeight: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {troopLabel}
        </span>
        {coordinateLabel ? (
          <div className="hex-coord-label">{coordinateLabel}</div>
        ) : null}
      </div>
    </>
  );

  return (
    <div className={badgeClassName} style={badgeStyle}>
      {isHQ ? (
        <span className="hq-badge-inner">{troopDisplayContent}</span>
      ) : troops === 1 && !isMasterTile && !isFort ? (
        <span className="troop-pip" aria-label="1 troop" />
      ) : (
        troopDisplayContent
      )}
    </div>
  );
});

function getHqPrefixMarkup(isHQ: boolean): string {
  if (isHQ) {
    return gameIcons.hq.replace(
      /<svg\b([^>]*)>/i,
      '<svg$1 width="0.9em" height="0.9em" style="color:#fcd34d">',
    );
  }

  return '';
}
