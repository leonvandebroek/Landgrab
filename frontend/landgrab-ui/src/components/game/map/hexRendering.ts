import { roomHexCornerLatLngs, roomHexToLatLng } from '../../map/HexMath';
import type { GameState, HexCell } from '../../../types/game';
import { scaleTroopColor, hexToHSL } from '../../../utils/hexColorUtils';
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

interface HexFillStyleOptions {
  cell: HexCell;
  isInactive: boolean;
  ownerColor: string;
  hostColor: string;
}

interface HexBorderStyleOptions {
  cell: HexCell;
  isCurrentHex: boolean;
  isHQ: boolean;
  isHostile: boolean;
  isInactive: boolean;
  isSelected: boolean;
}

interface TroopBadgeDescriptorOptions {
  isFort: boolean;
  isHQ: boolean;
  isMasterTile: boolean;
  ownerColor: string;
  troopLabel: string;
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
          ? 0.8 // More solid
          : cell.ownerId
            ? 0.9 // Solid, vibrant ownership
            : 0.25, // See-through neutral — map visible below
  };
}

export function getHexBorderStyle({
  cell,
  isCurrentHex,
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
  const borderOpacity = cell.ownerId || cell.isMasterTile ? 1.0 : (isInactive ? 0.4 : 0.75);
  let dashArray: string | undefined;

  if (cell.isMasterTile) {
    borderColor = '#fbbf24'; // Amber-400
    borderWeight = 6;
  }
  if (isCurrentHex) {
    // Current location is handled heavily by CSS .is-current-player-hex
    // But we set base SVG props here too as a fallback/reinforcement
    borderColor = '#22d3ee'; // Cyan-400 (Bright Neon)
    borderWeight = 8; // Ultra Thick for visibility
  }
  if (isSelected) {
    borderColor = isHostile ? '#ef4444' : '#38bdf8'; // Red-500 : Sky-400
    borderWeight = Math.max(borderWeight, 6);
  }
  if (cell.isFortified && !isInactive) {
    borderColor = '#f59e0b'; // Amber-500
    borderWeight = Math.max(borderWeight, 5);
  }
  if (cell.isFort && !isInactive) {
    borderColor = '#e879f9'; // Fuchsia-400
    borderWeight = Math.max(borderWeight, 6);
  }
  if (isHQ && !isInactive) {
    borderColor = '#fbbf24'; // Amber-400
    borderWeight = Math.max(borderWeight, 7);
  }
  if (isInactive) {
    dashArray = '4 6'; // Chunky dash
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
  ownerColor,
  troopLabel,
  troops,
}: TroopBadgeDescriptorOptions): { badgeSize: number; html: string } {
  // Playful sizing: Chunky and readable
  const badgeSize = Math.round(Math.min(48, Math.max(36, 30 + Math.log2(Math.max(1, troops)) * 4)));
  const troopCountLength = troopLabel.length;
  // Fredoka is rounded, needs good size
  const countFontSize = troopCountLength >= 3
    ? Math.max(14, Math.round(badgeSize * 0.4))
    : Math.max(16, Math.round(badgeSize * 0.5));
    
  const ringPct = Math.min(100, troops * 2);
  const prefix = isMasterTile
    ? gameIcons.master.replace(
      /<svg\b([^>]*)>/i,
      '<svg$1 width="0.9em" height="0.9em" style="color:#fcd34d">', // Amber-300
    )
    : (isHQ
      ? gameIcons.hq.replace(
        /<svg\b([^>]*)>/i,
        '<svg$1 width="0.9em" height="0.9em" style="color:#fcd34d">',
      )
      : '');
  const { h: badgeHue, s: badgeSaturation } = hexToHSL(ownerColor);
  
  // Playful Candy Button Look (Dark Arcade Mode) - MATCHING TroopBadge.tsx
  // Gradient: Vibrant top-down light-to-dark for volume
  const badgeBg = `linear-gradient(180deg, hsl(${Math.round(badgeHue)},${Math.round(badgeSaturation)}%,65%) 0%, hsl(${Math.round(badgeHue)},${Math.round(badgeSaturation)}%,45%) 100%)`;
  const avgLightness = 50;
  const isLightBadge = (badgeHue >= 40 && badgeHue <= 90 && badgeSaturation > 50)
    || (badgeHue >= 150 && badgeHue <= 195 && badgeSaturation > 50 && avgLightness > 45);
  const textColor = isLightBadge ? '#1a1a2e' : 'white';
  const badgeBorderColor = '#ffffff';
  
  // Pop shadow: Outer white glow for separation from dark map + Hard shadow for 3D + Inset highlight
  const badgeGlow = '0 0 15px rgba(255, 255, 255, 0.25), 0 4px 0 rgba(0,0,0,0.4), inset 0 2px 0 rgba(255,255,255,0.5), inset 0 -2px 0 rgba(0,0,0,0.2)';
    
  const badgeClass = [
    'hex-troop-badge',
    isMasterTile ? 'master-badge' : '',
    isHQ ? 'hq-badge' : '',
    isFort ? 'fort-badge' : '',
    troops === 0 ? 'zero-troops' : '',
  ].filter(Boolean).join(' ');

  // Use Fredoka font
  return {
    badgeSize,
    html: `<div class="${badgeClass}" style="width:${badgeSize}px;height:${badgeSize}px;background:${badgeBg};border: 3px solid ${badgeBorderColor};box-shadow:${badgeGlow};border-radius:50%;--troop-count-size:${countFontSize}px;font-family:'Fredoka',sans-serif;font-weight:700;display:flex;align-items:center;justify-content:center;color:${textColor};">
  <svg class="troop-ring" viewBox="0 0 36 36" aria-hidden="true" style="position:absolute;top:-3px;left:-3px;width:calc(100% + 6px);height:calc(100% + 6px);pointer-events:none;">
    <circle cx="18" cy="18" r="16" fill="none" stroke="rgba(255,255,255,0.4)" stroke-width="4"
            stroke-dasharray="${ringPct} ${100 - ringPct}" stroke-dashoffset="25" opacity="1" stroke-linecap="round" />
  </svg>
  ${prefix ? `<span class="troop-badge-prefix" style="margin-right:2px;display:flex;align-items:center;">${prefix}</span>` : ''}
  <span class="troop-count" style="${troops === 0 ? `color:${textColor === 'white' ? 'rgba(255,255,255,0.8)' : 'rgba(26,26,46,0.6)'}` : ''};line-height:1;">${escapeHtml(troopLabel)}</span>
</div>`,
  };
}
