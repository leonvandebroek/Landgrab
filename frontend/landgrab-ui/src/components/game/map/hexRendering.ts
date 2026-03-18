import { roomHexCornerLatLngs, roomHexToLatLng } from '../../map/HexMath';
import type { GameState, HexCell, TerrainType } from '../../../types/game';
import { terrainFillColors, terrainFillOpacity } from '../../../utils/terrainColors';
import { hexToHSL, scaleTroopColor, scaleTroopOpacity } from '../../../utils/hexColorUtils';
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
  hasTerrain: boolean;
  isFogHidden: boolean;
  isInactive: boolean;
  ownerColor: string;
  hostColor: string;
  terrainType: TerrainType;
}

interface HexBorderStyleOptions {
  cell: HexCell;
  isCurrentHex: boolean;
  isFogHidden: boolean;
  isHQ: boolean;
  isHostile: boolean;
  isInactive: boolean;
  isSelected: boolean;
}

interface TerrainIconVisibilityOptions {
  cell: HexCell;
  isFogHidden: boolean;
  isInactive: boolean;
  shouldShowBuildingIcons: boolean;
  shouldShowTerrainIcons: boolean;
  terrainIcon: string;
  terrainType: TerrainType;
  terrainEnabled: boolean | undefined;
}

interface ForestBlindOptions {
  cell: HexCell;
  myAllianceId: string | undefined;
  myUserId: string;
  terrainEnabled: boolean | undefined;
}

interface TroopBadgeDescriptorOptions {
  isFort: boolean;
  isForestBlind: boolean;
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
  isSupplyDisconnected: boolean;
  isContested: boolean;
  newlyClaimedKeys: ReadonlySet<string>;
  newlyRevealedKeys: ReadonlySet<string>;
  shouldShowBorderEffects: boolean;
  shouldShowSupplyLines: boolean;
  supplyLinesEnabled: boolean | undefined;
  hqEnabled: boolean | undefined;
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

export function isFogHiddenHex(cell: HexCell, isInactive: boolean, fogOfWarEnabled: boolean | undefined): boolean {
  return Boolean(
    fogOfWarEnabled
    && !cell.ownerId
    && !cell.isMasterTile
    && cell.troops === 0
    && !isInactive
  );
}

export function getHexFillStyle({
  cell,
  hasTerrain,
  isFogHidden,
  isInactive,
  ownerColor,
  hostColor,
  terrainType,
}: HexFillStyleOptions): HexFillStyle {
  // Playful Dark Arcade: Deep backgrounds with neon pops
  // Neutral hexes: Dark Slate for clean canvas
  const neutralFill = hasTerrain && !isInactive
    ? terrainFillColors[terrainType]
    : (isInactive ? '#1e293b' : '#0f172a'); // Slate-800 / Slate-900

  const neutralOpacity = hasTerrain && !isInactive
    ? terrainFillOpacity[terrainType]
    : scaleTroopOpacity(0, false);

  return {
    fillColor: isFogHidden
      ? 'url(#pattern-fog)' // Patterned fog
      : cell.isMasterTile
        ? hostColor
        : cell.ownerId
          ? scaleTroopColor(ownerColor, cell.troops)
          : neutralFill,
    fillOpacity: isFogHidden
      ? 1.0 // Full opacity for pattern base
      : isInactive
        ? 0.1 // Faint inactive
        : cell.isMasterTile
          ? 0.8 // More solid
          : cell.ownerId
            ? 0.9 // Solid, vibrant ownership
            : 0.6, // Semi-transparent neutral
  };
}

export function getHexBorderStyle({
  cell,
  isCurrentHex,
  isFogHidden,
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
      : (isFogHidden ? '#1e293b' : '#475569')); // Slate-800 / Slate-600
  
  let borderWeight = cell.ownerId ? 3 : (isInactive ? 1 : 2); // Slightly thinner than light mode
  const borderOpacity = cell.ownerId || cell.isMasterTile ? 1.0 : ((isInactive || isFogHidden) ? 0.3 : 0.5);
  let dashArray: string | undefined;

  if (cell.isMasterTile) {
    borderColor = '#fbbf24'; // Amber-400
    borderWeight = 5;
  }
  if (isCurrentHex) {
    borderColor = '#4ade80'; // Green-400
    borderWeight = Math.max(borderWeight, 4);
  }
  if (isSelected) {
    borderColor = isHostile ? '#ef4444' : '#38bdf8'; // Red-500 : Sky-400
    borderWeight = Math.max(borderWeight, 5);
  }
  if (cell.isFortified && !isInactive) {
    borderColor = '#f59e0b'; // Amber-500
    borderWeight = Math.max(borderWeight, 4);
  }
  if (cell.isFort && !isInactive) {
    borderColor = '#e879f9'; // Fuchsia-400
    borderWeight = Math.max(borderWeight, 5);
  }
  if (isHQ && !isInactive) {
    borderColor = '#fbbf24'; // Amber-400
    borderWeight = Math.max(borderWeight, 6);
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
  isSupplyDisconnected,
  isContested,
  newlyClaimedKeys,
  newlyRevealedKeys,
  shouldShowBorderEffects,
  shouldShowSupplyLines,
  supplyLinesEnabled,
  hqEnabled,
}: PolygonClassNameOptions): string {
  return [
    'hex-polygon',
    cell.isMasterTile ? 'is-master' : '',
    cell.ownerId ? 'is-owned' : 'is-neutral',
    isMine ? 'is-mine' : '',
    isCurrentHex ? 'is-current' : '',
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
    shouldShowSupplyLines && supplyLinesEnabled && hqEnabled && isSupplyDisconnected ? 'is-disconnected' : '',
  ].filter(Boolean).join(' ');
}

export function shouldRenderTerrainIcon({
  cell,
  isFogHidden,
  isInactive,
  shouldShowBuildingIcons,
  shouldShowTerrainIcons,
  terrainIcon,
  terrainType,
  terrainEnabled,
}: TerrainIconVisibilityOptions): boolean {
  const hasTerrain = terrainEnabled && terrainType !== 'None';
  if (!hasTerrain || isInactive || !terrainIcon || isFogHidden) {
    return false;
  }

  // Premium cleanup: Don't show terrain icons on neutral/unowned hexes to reduce clutter
  // Exception: Buildings might still be relevant
  if (!cell.ownerId && terrainType !== 'Building') {
    return false;
  }
  // Even for Buildings, if it's unowned, we probably want to reduce clutter unless it's a special POI
  // Assuming standard urban terrain is just 'Building', we hide it on unowned too.
  if (!cell.ownerId && terrainType === 'Building' && !cell.isMasterTile && !cell.isFort) {
      return false;
  }

  const isCommonTerrain = terrainType === 'Building' || terrainType === 'Road' || terrainType === 'Path';
  const showThisTerrainIcon = isCommonTerrain ? shouldShowBuildingIcons : shouldShowTerrainIcons;
  if (!showThisTerrainIcon) {
    return false;
  }

  return true;
}

export function shouldHideTroopCountInForest({
  cell,
  myAllianceId,
  myUserId,
  terrainEnabled,
}: ForestBlindOptions): boolean {
  return Boolean(
    terrainEnabled
    && cell.terrainType === 'Forest'
    && cell.ownerId
    && cell.ownerId !== myUserId
    && !(myAllianceId && cell.ownerAllianceId === myAllianceId)
  );
}

export function getTroopBadgeDescriptor({
  isFort,
  isForestBlind,
  isHQ,
  isMasterTile,
  ownerColor,
  troopLabel,
  troops,
}: TroopBadgeDescriptorOptions): { badgeSize: number; html: string } {
  // Playful sizing: Chunky and readable
  const badgeSize = Math.round(Math.min(48, Math.max(28, 30 + Math.log2(Math.max(1, troops)) * 4)));
  const troopCountLength = troopLabel.length;
  // Fredoka is rounded, needs good size
  const countFontSize = troopCountLength >= 3
    ? Math.max(12, Math.round(badgeSize * 0.4))
    : Math.max(14, Math.round(badgeSize * 0.5));
    
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
  
  // Playful Badge: Solid color, white border, drop shadow
  const badgeBg = `hsl(${Math.round(badgeHue)},${Math.round(badgeSaturation)}%,55%)`; // Lighter for neon pop
  const badgeBorderColor = '#ffffff';
  
  // Pop shadow - stronger for dark mode
  const badgeGlow = '0 0 10px rgba(0,0,0,0.5), 0 0 20px rgba(255,255,255,0.2)';
    
  const badgeClass = [
    'hex-troop-badge',
    isForestBlind ? 'forest-blind' : '',
    isMasterTile ? 'master-badge' : '',
    isHQ ? 'hq-badge' : '',
    isFort ? 'fort-badge' : '',
    troops === 0 ? 'zero-troops' : '',
  ].filter(Boolean).join(' ');

  // Use Fredoka font
  return {
    badgeSize,
    html: `<div class="${badgeClass}" style="width:${badgeSize}px;height:${badgeSize}px;background:${badgeBg};border: 3px solid ${badgeBorderColor};box-shadow:${badgeGlow};border-radius:50%;--troop-count-size:${countFontSize}px;font-family:'Fredoka',sans-serif;font-weight:600;display:flex;align-items:center;justify-content:center;color:white;">
  <svg class="troop-ring" viewBox="0 0 36 36" aria-hidden="true" style="position:absolute;top:-3px;left:-3px;width:calc(100% + 6px);height:calc(100% + 6px);pointer-events:none;">
    <circle cx="18" cy="18" r="16" fill="none" stroke="rgba(255,255,255,0.4)" stroke-width="4"
            stroke-dasharray="${ringPct} ${100 - ringPct}" stroke-dashoffset="25" opacity="1" stroke-linecap="round" />
  </svg>
  ${prefix ? `<span class="troop-badge-prefix" style="margin-right:2px;display:flex;align-items:center;">${prefix}</span>` : ''}
  <span class="troop-count" style="${troops === 0 ? 'color:rgba(255,255,255,0.8)' : ''};line-height:1;">${escapeHtml(troopLabel)}</span>
</div>`,
  };
}
