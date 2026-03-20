import { roomHexCornerLatLngs, roomHexToLatLng } from '../../map/HexMath';
import type { GameState, HexCell } from '../../../types/game';
import { scaleTroopColor } from '../../../utils/hexColorUtils';
import { gameIcons } from '../../../utils/gameIcons';
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
  ownerColor: string;
  hostColor: string;
}

interface HexBorderStyleOptions {
  cell: HexCell;
  isContested?: boolean;
  isCurrentHex: boolean;
  isFrontier: boolean;
  isHQ: boolean;
  isHostile: boolean;
  isInactive: boolean;
  isSelected: boolean;
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
  isContested,
  isInactive,
  ownerColor,
  hostColor,
}: HexFillStyleOptions): HexFillStyle {
  const neutralFill = isInactive ? '#1e293b' : '#0f172a'; // Slate-800 / Slate-900

  return {
    fillColor: cell.isMasterTile
        ? hostColor
        : cell.ownerId
          ? scaleTroopColor(ownerColor, cell.troops)
          : neutralFill,
    fillOpacity: isInactive
        ? 0.1 // Faint inactive
        : cell.isMasterTile
          ? 0.50 // More solid
          : isContested
            ? 0.52 // Higher contested emphasis for fast tactical scanning
          : cell.ownerId
            ? 0.42 // Stronger owned fill while keeping streets readable
            : 0.30, // Slightly clearer neutral read without overwhelming the basemap
  };
}

export function getHexBorderStyle({
  cell,
  isContested,
  isCurrentHex,
  isFrontier,
  isHQ,
  isHostile,
  isInactive,
  isSelected,
}: HexBorderStyleOptions): HexBorderStyle {
  // Borders: Thick, rounded, playful neon
  let borderColor = cell.ownerId
    ? '#ffffff' // White borders between owned hexes for "sticker" look
    : (isInactive
      ? '#334155' // Slate-700
      : '#64748b'); // Slate-500
  
  let borderWeight = cell.ownerId ? 4 : (isInactive ? 2 : 2); // Owned=4, neutral=2, inactive=2
  let borderOpacity = cell.ownerId || cell.isMasterTile ? 1.0 : (isInactive ? 0.4 : 0.75);
  let dashArray: string | undefined;

  if (cell.ownerId && !isFrontier) {
    borderWeight = 0.4;
    borderOpacity = 0.2;
  }

  if (cell.isMasterTile) {
    borderColor = '#fbbf24'; // Amber-400
    borderWeight = 6;
    borderOpacity = 1.0;
  }
  if (isCurrentHex) {
    // Current location is handled heavily by CSS .is-current-player-hex
    // But we set base SVG props here too as a fallback/reinforcement
    borderColor = '#22d3ee'; // Cyan-400 (Bright Neon)
    borderWeight = 8; // Ultra Thick for visibility
    borderOpacity = 1.0;
  }
  if (isSelected) {
    borderColor = isHostile ? '#ef4444' : '#38bdf8'; // Red-500 : Sky-400
    borderWeight = Math.max(borderWeight, 6);
    borderOpacity = Math.max(borderOpacity, 0.95);
  }
  if (cell.isFortified && !isInactive) {
    borderColor = '#f59e0b'; // Amber-500
    borderWeight = Math.max(borderWeight, 5);
    borderOpacity = Math.max(borderOpacity, 0.9);
  }
  if (cell.isFort && !isInactive) {
    borderColor = '#e879f9'; // Fuchsia-400
    borderWeight = Math.max(borderWeight, 6);
    borderOpacity = Math.max(borderOpacity, 0.95);
  }
  if (isHQ && !isInactive) {
    borderColor = '#fbbf24'; // Amber-400
    borderWeight = Math.max(borderWeight, 7);
    borderOpacity = Math.max(borderOpacity, 0.95);
  }
  if (isInactive) {
    dashArray = '4 6'; // Chunky dash
  }
  if (isContested && !isInactive) {
    dashArray = '12, 8';
  }

  return { borderColor, borderWeight, borderOpacity, dashArray };
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
    
  const fortPrefixIcon = isFort
    ? gameIcons.fort.replace('<svg', '<svg width="10" height="10" style="vertical-align:middle;opacity:0.8;margin-right:2px"')
    : '';
    
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
    html: `<div class="${badgeClass}" style="width:${badgeSize}px;background:var(--color-void);height:18px;border-radius:var(--radius-tech-pill);--troop-count-size:${countFontSize}px;font-family:var(--font-scifi-mono);font-weight:700;display:flex;align-items:center;justify-content:center;color:white;position:relative;">
  <div class="troop-badge-text" style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-width:0;">
    <span class="troop-count" style="${troops === 0 ? 'color:rgba(255,255,255,0.8)' : ''};line-height:1;display:flex;align-items:center;justify-content:center;">${fortPrefixIcon}${escapeHtml(resolvedTroopLabel)}</span>
    ${coordinateLabel}
  </div>
</div>`,
  };
}
