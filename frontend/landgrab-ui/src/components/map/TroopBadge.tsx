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

  const prefixMarkup = getPrefixMarkup(isMasterTile, isHQ);
  const fortPrefixMarkup = isFort
    ? gameIcons.fort.replace('<svg', '<svg width="10" height="10" style="vertical-align:middle;opacity:0.8;margin-right:2px"')
    : '';

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

  const badgeStyle: CSSProperties = {
    height: isHQ ? 22 : 18,
    minWidth: isHQ ? 22 : 18,
    padding: isHQ ? '0 8px' : '0 4px',
  };

  const coordinateLabel = showCoords && q != null && r != null
    ? `${q},${r}`
    : undefined;

  const troopDisplayContent = (
    <>
      {prefixMarkup ? (
        <span
          className="troop-badge-prefix"
          aria-hidden="true"
          style={{ marginRight: '2px', display: 'flex', alignItems: 'center' }}
          dangerouslySetInnerHTML={{ __html: prefixMarkup }}
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
          {fortPrefixMarkup ? (
            <span aria-hidden="true" dangerouslySetInnerHTML={{ __html: fortPrefixMarkup }} />
          ) : null}
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
      {troops === 1 && !isHQ && !isMasterTile && !isFort
        ? <span className="troop-pip" aria-label="1 troop" />
        : troopDisplayContent
      }
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
