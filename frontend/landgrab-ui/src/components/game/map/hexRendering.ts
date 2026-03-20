import { roomHexCornerLatLngs, roomHexToLatLng } from '../../map/HexMath';
import type { GameState, HexCell } from '../../../types/game';
import { escapeHtml } from './HexTooltip';

export const HEX_NEIGHBOR_OFFSETS: [number, number][] = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];

export interface HexGeometry {
  corners: [number, number][];
  center: [number, number];
}

export interface HexTerritoryStatus {
  isFrontier: boolean;
  isContested: boolean;
}

export interface HexFillStyle {
  fillColor: string;
  fillOpacity: number;
}

export interface HexBorderStyle {
  borderColor: string;
  borderWeight: number;
  borderOpacity: number;
  dashArray?: string;
  animationClass?: string;
}

function formatTroopCount(n: number): string {
  if (n >= 10000) return `${Math.round(n / 1000)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

interface HexFillStyleOptions {
  cell: HexCell;
  isContested: boolean;
  isInactive: boolean;
  isHQ?: boolean;
  ownerColor: string;
}

interface HexBorderStyleOptions {
  cell: HexCell;
  isContested?: boolean;
  isCurrentHex: boolean;
  isFrontier: boolean;
  isEngineeringInProgress?: boolean;
  isHQ?: boolean;
  isInactive: boolean;
  isSelected: boolean;
  selectionType?: 'none' | 'selectedFriendly' | 'selectedHostile';
  ownerColor?: string;
}

interface TroopBadgeDescriptorOptions {
  isFort: boolean;
  isHQ: boolean;
  isMasterTile: boolean;
  isEnemy?: boolean;
  ownerColor: string;
  q?: number;
  r?: number;
  showCoords?: boolean;
  troopLabel?: string;
  troops: number;
}

interface PolygonClassNameOptions {
  cell: HexCell;
  cellKey: string;
  isCurrentHex: boolean;
  isFrontier: boolean;
  isHQ: boolean;
  isInactive: boolean;
  isMine: boolean;
  isSelected: boolean;
  selectionType?: 'none' | 'selectedFriendly' | 'selectedHostile';
  isContested: boolean;
  newlyClaimedKeys: ReadonlySet<string>;
  newlyRevealedKeys: ReadonlySet<string>;
  shouldShowBorderEffects: boolean;
}

export function getHexGeometry(
  cell: Pick<HexCell, 'q' | 'r'>,
  mapLat: number,
  mapLng: number,
  tileSizeMeters: number,
): HexGeometry {
  return {
    corners: roomHexCornerLatLngs(cell.q, cell.r, mapLat, mapLng, tileSizeMeters),
    center: roomHexToLatLng(cell.q, cell.r, mapLat, mapLng, tileSizeMeters),
  };
}

export function getHexOwnerColor(
  cell: HexCell,
  playersById: ReadonlyMap<string, GameState['players'][number]>,
  fallbackColor: string,
): string {
  return playersById.get(cell.ownerId ?? '')?.allianceColor
    ?? playersById.get(cell.ownerId ?? '')?.color
    ?? cell.ownerColor
    ?? fallbackColor;
}

export function getHexTerritoryStatus(
  cell: HexCell,
  renderedGrid: Record<string, HexCell>,
  isFriendlyAllianceCell: boolean,
): HexTerritoryStatus {
  let isFrontier = false;
  let isContested = false;

  if (!cell.ownerId) {
    return { isFrontier, isContested };
  }

  for (const [dq, dr] of HEX_NEIGHBOR_OFFSETS) {
    const neighbor = renderedGrid[`${cell.q + dq},${cell.r + dr}`];
    const isSameTeamNeighbor = Boolean(
      neighbor?.ownerId
      && (
        neighbor.ownerId === cell.ownerId
        || (
          isFriendlyAllianceCell
          && neighbor.ownerAllianceId != null
          && neighbor.ownerAllianceId === cell.ownerAllianceId
        )
      )
    );

    if (!neighbor?.ownerId || !isSameTeamNeighbor) {
      isFrontier = true;
    }

    if (neighbor?.ownerId && !isSameTeamNeighbor) {
      isContested = true;
    }

    if (isFrontier && isContested) {
      break;
    }
  }

  return { isFrontier, isContested };
}

export function getHexFillStyle({
  cell,
  isInactive,
  isHQ,
  ownerColor,
}: HexFillStyleOptions): HexFillStyle {
  return {
    fillColor: isInactive
      ? 'var(--hex-void-bg)'
      : !cell.ownerId
        ? 'transparent'
        : ownerColor,
    fillOpacity: isInactive
      ? 1
      : !cell.ownerId
        ? 0
        : cell.isMasterTile
          ? 0.50
          : isHQ
            ? 0.40
            : cell.isFort
              ? 0.35
              : 0.25,
  };
}

export function getHexBorderStyle({
  cell,
  isCurrentHex,
  isFrontier,
  isEngineeringInProgress,
  isHQ,
  isInactive,
  isSelected,
  selectionType = 'none',
  ownerColor,
}: HexBorderStyleOptions): HexBorderStyle {
  if (isInactive) {
    return {
      borderColor: 'transparent',
      borderWeight: 0,
      borderOpacity: 0,
    };
  }

  if (!cell.ownerId) {
    return {
      borderColor: 'rgba(255,255,255,0.08)',
      borderWeight: 1,
      borderOpacity: 1,
    };
  }

  if (isEngineeringInProgress) {
    return {
      borderColor: '#00ddff',
      borderWeight: 2,
      borderOpacity: 1,
      dashArray: '6 6',
      animationClass: 'is-march',
    };
  }

  if (isCurrentHex) {
    return {
      borderColor: '#00ffaa',
      borderWeight: 2,
      borderOpacity: 1,
    };
  }

  if (selectionType === 'selectedFriendly') {
    return {
      borderColor: 'var(--hex-sel-friendly, #00f3ff)',
      borderWeight: 4,
      borderOpacity: 1,
      dashArray: '8 8',
    };
  }

  if (selectionType === 'selectedHostile') {
    return {
      borderColor: 'var(--hex-sel-hostile, #ff3333)',
      borderWeight: 4,
      borderOpacity: 1,
      dashArray: '12 6',
    };
  }

  if (isSelected) {
    return {
      borderColor: '#ffffff',
      borderWeight: 2,
      borderOpacity: 1,
      dashArray: '6 8',
      animationClass: 'is-pulse',
    };
  }

  if (cell.isMasterTile) {
    return {
      borderColor: ownerColor ?? '#fbbf24',
      borderWeight: 3,
      borderOpacity: 1,
    };
  }

  if (isHQ) {
    return {
      borderColor: ownerColor ?? '#334155',
      borderWeight: 2.5,
      borderOpacity: 0.85,
    };
  }

  if (cell.isFort) {
    return {
      borderColor: ownerColor ?? '#334155',
      borderWeight: 2.5,
      borderOpacity: 0.85,
    };
  }

  if (isFrontier) {
    return {
      borderColor: ownerColor ?? '#aaaaaa',
      borderWeight: 2.5,
      borderOpacity: 0.85,
    };
  }

  return {
    borderColor: ownerColor ?? '#334155',
    borderWeight: 1,
    borderOpacity: 0.05,
  };
}

export function getHexPolygonClassName({
  cell,
  cellKey,
  isCurrentHex,
  isFrontier,
  isHQ,
  isInactive,
  isMine,
  isSelected,
  selectionType = 'none',
  isContested,
  newlyClaimedKeys,
  newlyRevealedKeys,
  shouldShowBorderEffects,
}: PolygonClassNameOptions): string {
  return [
    'hex-polygon',
    cell.isMasterTile ? 'is-master' : '',
    cell.ownerId ? 'is-owned' : 'is-neutral',
    isMine ? 'is-mine' : '',
    isCurrentHex ? 'is-current' : '',
    // This class triggers the intense neon pulse animation in index.css
    isCurrentHex ? 'is-current-player-hex' : '',
    isSelected ? 'is-selected' : '',
    !isCurrentHex && selectionType === 'selectedFriendly' ? 'hex-selection-friendly' : '',
    !isCurrentHex && selectionType === 'selectedHostile' ? 'hex-selection-hostile' : '',
    isInactive ? 'is-inactive' : '',
    cell.isFortified ? 'is-fortified' : '',
    cell.isFort ? 'is-fort' : '',
    isHQ ? 'is-hq' : '',
    newlyRevealedKeys.has(cellKey) ? 'is-revealing' : '',
    newlyClaimedKeys.has(cellKey) ? 'is-just-claimed' : '',
    shouldShowBorderEffects && isFrontier ? 'is-frontier' : '',
    shouldShowBorderEffects && isContested ? 'is-contested' : '',
  ].filter(Boolean).join(' ');
}

export function getTroopBadgeDescriptor({
  isFort,
  isHQ,
  isMasterTile,
  isEnemy,
  q,
  r,
  showCoords = false,
  troopLabel,
  troops,
}: TroopBadgeDescriptorOptions): { badgeSize: number; html: string } {
  const resolvedTroopLabel = troopLabel?.trim() ? troopLabel : formatTroopCount(troops);
  const badgeSize = 18;
  const troopCountLength = resolvedTroopLabel.length;
  const countFontSize = troopCountLength >= 3
    ? Math.max(14, Math.round(badgeSize * 0.4))
    : Math.max(16, Math.round(badgeSize * 0.5));

  const badgePrefix = `${isMasterTile ? '★ ' : ''}${isFort ? '[F] ' : ''}`;
    
  const badgeClass = [
    'hex-troop-badge',
    isEnemy === true ? 'enemy-badge' : '',
    isEnemy === false ? 'friendly-badge' : '',
    isMasterTile ? 'master-badge' : '',
    isHQ ? 'hq-badge' : '',
    isFort ? 'fort-badge' : '',
    troops === 0 ? 'zero-troops' : '',
  ].filter(Boolean).join(' ');

  const coordinateLabel = showCoords && q != null && r != null
    ? `<div class="hex-coord-label">${q},${r}</div>`
    : '';

  // Callers may pass a preformatted compact label via troopLabel; otherwise we fall back to formatTroopCount(troops).
  return {
    badgeSize,
    html: `<div class="${badgeClass}" style="width:${badgeSize}px;background:var(--badge-bg-void);height:18px;border-radius:var(--radius-tech-pill);--troop-count-size:${countFontSize}px;font-family:var(--font-scifi-mono);font-weight:700;display:flex;align-items:center;justify-content:center;color:white;position:relative;">
  <div class="troop-badge-text" style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-width:0;">
    <span class="troop-count" style="${troops === 0 ? 'color:rgba(255,255,255,0.8)' : ''};line-height:1;display:flex;align-items:center;justify-content:center;">${escapeHtml(`${badgePrefix}${resolvedTroopLabel}`)}</span>
    ${coordinateLabel}
  </div>
</div>`,
  };
}
