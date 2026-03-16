import { roomHexCornerLatLngs, roomHexToLatLng } from '../../map/HexMath';
import type { GameState, HexCell, TerrainType } from '../../../types/game';
import { terrainFillColors, terrainFillOpacity } from '../../../utils/terrainColors';
import { hexToHSL, scaleTroopColor, scaleTroopOpacity } from '../../../utils/hexColorUtils';
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
  shouldShowTroopBadges: boolean;
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
  const neutralFill = hasTerrain && !isInactive
    ? terrainFillColors[terrainType]
    : (isInactive ? '#2d3340' : '#3b4252');
  const neutralOpacity = hasTerrain && !isInactive
    ? terrainFillOpacity[terrainType]
    : scaleTroopOpacity(0, false);

  return {
    fillColor: isFogHidden
      ? '#1a1a2e'
      : cell.isMasterTile
        ? hostColor
        : cell.ownerId
          ? scaleTroopColor(ownerColor, cell.troops)
          : neutralFill,
    fillOpacity: isFogHidden
      ? 0.7
      : isInactive
        ? 0.08
        : cell.isMasterTile
          ? 0.75
          : cell.ownerId
            ? scaleTroopOpacity(cell.troops, true)
            : neutralOpacity,
  };
}

export function getHexBorderStyle({
  cell,
  isCurrentHex,
  isFogHidden,
  isHQ,
  isInactive,
  isSelected,
}: HexBorderStyleOptions): HexBorderStyle {
  let borderColor = cell.ownerId
    ? 'rgba(255, 255, 255, 0.55)'
    : (isInactive
      ? 'rgba(80, 90, 105, 0.35)'
      : (isFogHidden ? 'rgba(100, 115, 140, 0.4)' : 'rgba(90, 100, 120, 0.45)'));
  let borderWeight = cell.ownerId ? 2.5 : (isInactive ? 1 : 1.5);
  const borderOpacity = cell.ownerId || cell.isMasterTile ? 0.9 : ((isInactive || isFogHidden) ? 0.6 : 0.7);
  let dashArray: string | undefined;

  if (cell.isMasterTile) {
    borderColor = '#f1c40f';
    borderWeight = 3.25;
  }
  if (isCurrentHex) {
    borderColor = '#2ecc71';
    borderWeight = Math.max(borderWeight, 3);
  }
  if (isSelected) {
    borderColor = '#ffffff';
    borderWeight = Math.max(borderWeight, 4);
  }
  if (cell.isFortified && !isInactive) {
    borderColor = '#f39c12';
    borderWeight = Math.max(borderWeight, 3);
  }
  if (cell.isFort && !isInactive) {
    borderColor = '#8e44ad';
    borderWeight = Math.max(borderWeight, 3.5);
  }
  if (isHQ && !isInactive) {
    borderColor = '#f1c40f';
    borderWeight = Math.max(borderWeight, 4);
  }
  if (isInactive) {
    dashArray = '6 6';
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
  shouldShowTroopBadges,
}: TerrainIconVisibilityOptions): boolean {
  const hasTerrain = terrainEnabled && terrainType !== 'None';
  if (!hasTerrain || isInactive || !terrainIcon || isFogHidden) {
    return false;
  }

  const isCommonTerrain = terrainType === 'Building' || terrainType === 'Road' || terrainType === 'Path';
  const showThisTerrainIcon = isCommonTerrain ? shouldShowBuildingIcons : shouldShowTerrainIcons;
  if (!showThisTerrainIcon) {
    return false;
  }

  return !(shouldShowTroopBadges && Boolean(cell.ownerId) && cell.troops > 0);
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
  const badgeSize = Math.round(Math.min(38, Math.max(20, 22 + Math.log2(Math.max(1, troops)) * 3)));
  const troopCountLength = troopLabel.length;
  const countFontSize = troopCountLength >= 3
    ? Math.max(10, Math.round(badgeSize * 0.34))
    : Math.max(11, Math.round(badgeSize * 0.4));
  const ringPct = Math.min(100, troops * 2);
  const prefix = isMasterTile ? '👑' : (isHQ ? '🏛️' : '');
  const { h: badgeHue, s: badgeSaturation } = hexToHSL(ownerColor);
  const badgeBg = `hsla(${Math.round(badgeHue)},${Math.round(badgeSaturation * 0.8)}%,22%,0.94)`;
  const badgeBorderColor = `hsla(${Math.round(badgeHue)},${Math.round(badgeSaturation * 0.65)}%,48%,0.65)`;
  const badgeGlow = troops >= 20
    ? `0 0 12px hsla(${Math.round(badgeHue)},${Math.round(badgeSaturation)}%,50%,0.50),0 2px 6px rgba(0,0,0,0.4)`
    : '0 2px 8px rgba(0,0,0,0.45)';
  const badgeClass = [
    'hex-troop-badge',
    isForestBlind ? 'forest-blind' : '',
    isMasterTile ? 'master-badge' : '',
    isHQ ? 'hq-badge' : '',
    isFort ? 'fort-badge' : '',
  ].filter(Boolean).join(' ');

  return {
    badgeSize,
    html: `<div class="${badgeClass}" style="width:${badgeSize}px;height:${badgeSize}px;background:${badgeBg};border-color:${badgeBorderColor};box-shadow:${badgeGlow};--troop-count-size:${countFontSize}px">
  <svg class="troop-ring" viewBox="0 0 36 36" aria-hidden="true">
    <circle cx="18" cy="18" r="16" fill="none" stroke="${ownerColor}" stroke-width="2.5"
            stroke-dasharray="${ringPct} ${100 - ringPct}" stroke-dashoffset="25" opacity="0.6" />
  </svg>
  ${prefix ? `<span class="troop-badge-prefix">${prefix}</span>` : ''}
  <span class="troop-count">${escapeHtml(troopLabel)}</span>
</div>`,
  };
}
