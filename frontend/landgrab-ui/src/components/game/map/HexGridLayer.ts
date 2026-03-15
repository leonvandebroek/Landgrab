import type { MutableRefObject } from 'react';
import i18n from '../../../i18n';
import L from 'leaflet';
import type { GameState, HexCell } from '../../../types/game';
import { terrainIcons } from '../../../utils/terrainIcons';
import {
  showBorderEffects,
  showBuildingIcons,
  showContestEffects,
  showHexTooltips,
  showSupplyLines,
  showTerrainIcons as showTerrainIconsZoom,
  showTroopBadges,
} from '../../../utils/zoomThresholds';
import { findContestedEdges } from '../../../utils/contestedEdges';
import { computeSupplyNetwork } from '../../../utils/supplyNetwork';
import { roomHexCornerLatLngs } from '../../map/HexMath';
import { buildHexTooltipHtml } from './HexTooltip';
import {
  getHexBorderStyle,
  getHexFillStyle,
  getHexGeometry,
  getHexOwnerColor,
  getHexPolygonClassName,
  getHexTerritoryStatus,
  getTroopBadgeDescriptor,
  isFogHiddenHex,
  shouldHideTroopCountInForest,
  shouldRenderTerrainIcon,
} from './hexRendering';

const DEFAULT_PLAYER_MARKER_COLOR = '#4f8cff';

interface RenderHexGridLayerOptions {
  currentHex: [number, number] | null;
  currentZoom: number;
  inactiveHexKeySet: ReadonlySet<string>;
  layerGroup: L.LayerGroup;
  myUserId: string;
  onHexClickRef: MutableRefObject<((q: number, r: number, cell: HexCell | undefined) => void) | undefined>;
  pointerDownRef: MutableRefObject<{ x: number; y: number } | null>;
  prevGridRef: MutableRefObject<Record<string, HexCell>>;
  renderedGrid: Record<string, HexCell>;
  selectedHex: [number, number] | null;
  state: GameState;
}

export function renderHexGridLayers({
  currentHex,
  currentZoom,
  inactiveHexKeySet,
  layerGroup,
  myUserId,
  onHexClickRef,
  pointerDownRef,
  prevGridRef,
  renderedGrid,
  selectedHex,
  state,
}: RenderHexGridLayerOptions): void {
  layerGroup.clearLayers();
  renderWorldDimMask(layerGroup, Object.values(renderedGrid), state.mapLat!, state.mapLng!, state.tileSizeMeters);

  const { newlyClaimedKeys, newlyRevealedKeys } = getChangedHexKeys(prevGridRef.current, renderedGrid);
  const hostPlayer = state.players.find(player => player.isHost);
  const hostColor = hostPlayer?.allianceColor ?? hostPlayer?.color ?? '#f1c40f';
  const myPlayer = state.players.find(player => player.id === myUserId);
  const playersById = new Map(state.players.map(player => [player.id, player]));
  const shouldShowTerrainIcons = showTerrainIconsZoom(currentZoom);
  const shouldShowTroopBadges = showTroopBadges(currentZoom);
  const shouldShowBorderEffects = showBorderEffects(currentZoom);
  const shouldShowBuildingIcons = showBuildingIcons(currentZoom);
  const shouldShowHexTooltips = showHexTooltips(currentZoom);
  const shouldShowContestEffects = showContestEffects(currentZoom);
  const shouldShowSupplyLines = showSupplyLines(currentZoom);

  const supplyDisconnected = new Set<string>();
  let supplyEdges: Array<{ fromCenter: L.LatLngExpression; toCenter: L.LatLngExpression; teamColor: string }> = [];
  if (shouldShowSupplyLines && state.dynamics?.supplyLinesEnabled && state.dynamics?.hqEnabled) {
    const supplyResult = computeSupplyNetwork(
      renderedGrid,
      state.alliances,
      state.mapLat!,
      state.mapLng!,
      state.tileSizeMeters,
    );
    for (const key of supplyResult.disconnectedHexes) {
      supplyDisconnected.add(key);
    }
    supplyEdges = supplyResult.supplyEdges;
  }

  for (const cell of Object.values(renderedGrid)) {
    renderHexCell({
      cell,
      currentHex,
      hostColor,
      inactiveHexKeySet,
      layerGroup,
      myPlayer,
      myUserId,
      newlyClaimedKeys,
      newlyRevealedKeys,
      onHexClickRef,
      playersById,
      pointerDownRef,
      renderedGrid,
      selectedHex,
      shouldShowBorderEffects,
      shouldShowBuildingIcons,
      shouldShowHexTooltips,
      shouldShowSupplyLines,
      shouldShowTerrainIcons,
      shouldShowTroopBadges,
      state,
      supplyDisconnected,
    });
  }

  renderSupplyLines(layerGroup, shouldShowSupplyLines, state, supplyEdges);
  renderContestedEdges(layerGroup, shouldShowContestEffects, renderedGrid, state);
  prevGridRef.current = { ...renderedGrid };
}

interface RenderHexCellOptions {
  cell: HexCell;
  currentHex: [number, number] | null;
  hostColor: string;
  inactiveHexKeySet: ReadonlySet<string>;
  layerGroup: L.LayerGroup;
  myPlayer: GameState['players'][number] | undefined;
  myUserId: string;
  newlyClaimedKeys: ReadonlySet<string>;
  newlyRevealedKeys: ReadonlySet<string>;
  onHexClickRef: MutableRefObject<((q: number, r: number, cell: HexCell | undefined) => void) | undefined>;
  playersById: ReadonlyMap<string, GameState['players'][number]>;
  pointerDownRef: MutableRefObject<{ x: number; y: number } | null>;
  renderedGrid: Record<string, HexCell>;
  selectedHex: [number, number] | null;
  shouldShowBorderEffects: boolean;
  shouldShowBuildingIcons: boolean;
  shouldShowHexTooltips: boolean;
  shouldShowSupplyLines: boolean;
  shouldShowTerrainIcons: boolean;
  shouldShowTroopBadges: boolean;
  state: GameState;
  supplyDisconnected: ReadonlySet<string>;
}

function renderHexCell({
  cell,
  currentHex,
  hostColor,
  inactiveHexKeySet,
  layerGroup,
  myPlayer,
  myUserId,
  newlyClaimedKeys,
  newlyRevealedKeys,
  onHexClickRef,
  playersById,
  pointerDownRef,
  renderedGrid,
  selectedHex,
  shouldShowBorderEffects,
  shouldShowBuildingIcons,
  shouldShowHexTooltips,
  shouldShowSupplyLines,
  shouldShowTerrainIcons,
  shouldShowTroopBadges,
  state,
  supplyDisconnected,
}: RenderHexCellOptions) {
  const cellKey = `${cell.q},${cell.r}`;
  const { corners, center } = getHexGeometry(cell, state.mapLat!, state.mapLng!, state.tileSizeMeters);
  const [centerLat, centerLng] = center;
  const isMine = cell.ownerId === myUserId;
  const isCurrentHex = currentHex?.[0] === cell.q && currentHex?.[1] === cell.r;
  const isSelected = selectedHex?.[0] === cell.q && selectedHex?.[1] === cell.r;
  const isInactive = inactiveHexKeySet.has(cellKey);
  const terrainType = cell.terrainType ?? 'None';
  const terrainIcon = terrainIcons[terrainType];
  const isHQHex = state.alliances.some(alliance => alliance.hqHexQ === cell.q && alliance.hqHexR === cell.r);
  const ownerColor = getHexOwnerColor(cell, playersById, DEFAULT_PLAYER_MARKER_COLOR);
  const isFriendlyAllianceCell = Boolean(myPlayer?.allianceId && cell.ownerAllianceId === myPlayer.allianceId);
  const { isFrontier, isContested } = getHexTerritoryStatus(cell, renderedGrid, isFriendlyAllianceCell);
  const isFogHidden = isFogHiddenHex(cell, isInactive, state.dynamics?.fogOfWarEnabled);
  const hasTerrain = Boolean(state.dynamics?.terrainEnabled && terrainType !== 'None');
  const { fillColor, fillOpacity } = getHexFillStyle({
    cell,
    hasTerrain,
    isFogHidden,
    isInactive,
    ownerColor,
    hostColor,
    terrainType,
  });
  const { borderColor, borderWeight, borderOpacity, dashArray } = getHexBorderStyle({
    cell,
    isCurrentHex,
    isFogHidden,
    isInactive,
    isSelected,
  });

  if (shouldRenderTerrainIcon({
    cell,
    isFogHidden,
    isInactive,
    shouldShowBuildingIcons,
    shouldShowTerrainIcons,
    terrainIcon,
    terrainType,
    terrainEnabled: state.dynamics?.terrainEnabled,
    shouldShowTroopBadges,
  })) {
    L.marker([centerLat, centerLng], {
      icon: L.divIcon({
        className: 'hex-terrain-icon',
        html: `<span aria-hidden="true">${terrainIcon}</span>`,
        iconSize: [22, 22],
        iconAnchor: [11, 7],
      }),
      interactive: false,
      keyboard: false,
      zIndexOffset: -30,
    }).addTo(layerGroup);
  }

  const polygon = L.polygon(corners, {
    className: getHexPolygonClassName({
      cell,
      cellKey,
      isCurrentHex,
      isFrontier,
      isInactive,
      isMine,
      isSelected,
      isSupplyDisconnected: supplyDisconnected.has(cellKey),
      isContested,
      newlyClaimedKeys,
      newlyRevealedKeys,
      shouldShowBorderEffects,
      shouldShowSupplyLines,
      supplyLinesEnabled: state.dynamics?.supplyLinesEnabled,
      hqEnabled: state.dynamics?.hqEnabled,
    }),
    color: borderColor,
    dashArray,
    weight: borderWeight,
    opacity: borderOpacity,
    fillColor,
    fillOpacity,
  });

  if (shouldShowHexTooltips) {
    polygon.bindTooltip(
      isFogHidden ? i18n.t('phase7.hiddenHex') : buildHexTooltipHtml(cell, currentHex),
      { sticky: true, className: isFogHidden ? '' : 'hex-tooltip-card' },
    );
  }

  polygon.on('click', (event: L.LeafletMouseEvent) => {
    const down = pointerDownRef.current;
    if (down) {
      const dx = event.originalEvent.clientX - down.x;
      const dy = event.originalEvent.clientY - down.y;
      if (dx * dx + dy * dy > 100) {
        return;
      }
    }
    onHexClickRef.current?.(cell.q, cell.r, cell);
  });

  polygon.addTo(layerGroup);
  const polygonElement = polygon.getElement();
  if (polygonElement instanceof SVGElement || polygonElement instanceof HTMLElement) {
    polygonElement.style.setProperty('--hex-owner-color', ownerColor);
  }

  if (cell.contestProgress != null && cell.contestProgress > 0 && !isInactive && !isFogHidden) {
    L.circle([centerLat, centerLng], {
      radius: state.tileSizeMeters * 0.3,
      color: '#e74c3c',
      weight: 3,
      fillColor: '#e74c3c',
      fillOpacity: cell.contestProgress * 0.4,
      interactive: false,
    }).addTo(layerGroup);
  }

  if (shouldShowTroopBadges && !isInactive && !isFogHidden && (cell.troops > 0 || cell.isMasterTile)) {
    const isForestBlind = shouldHideTroopCountInForest({
      cell,
      myAllianceId: myPlayer?.allianceId,
      myUserId,
      terrainEnabled: state.dynamics?.terrainEnabled,
    });
    const troopLabel = isForestBlind ? '?' : String(cell.troops);
    const { badgeSize, html } = getTroopBadgeDescriptor({
      isForestBlind,
      isHQ: isHQHex,
      isMasterTile: cell.isMasterTile,
      ownerColor,
      troopLabel,
      troops: cell.troops,
    });

    L.marker([centerLat, centerLng], {
      icon: L.divIcon({
        className: 'hex-label-wrapper',
        html,
        iconSize: [badgeSize, badgeSize],
        iconAnchor: [badgeSize / 2, badgeSize / 2],
      }),
      interactive: false,
    }).addTo(layerGroup);
  }

  if (shouldShowBuildingIcons) {
    if (cell.isFort && !isInactive && !isFogHidden) {
      L.marker([centerLat, centerLng], {
        icon: L.divIcon({
          className: 'hex-building-icon',
          html: '<div class="building fort">🏰</div>',
          iconSize: [28, 28],
          iconAnchor: [14, 28],
        }),
        interactive: false,
        zIndexOffset: -10,
      }).addTo(layerGroup);
    }

    if (isHQHex && !cell.isMasterTile && !isInactive && !isFogHidden) {
      L.marker([centerLat, centerLng], {
        icon: L.divIcon({
          className: 'hex-building-icon',
          html: '<div class="building hq">🏛️</div>',
          iconSize: [28, 28],
          iconAnchor: [14, 28],
        }),
        interactive: false,
        zIndexOffset: -10,
      }).addTo(layerGroup);
    }
  }
}

function renderWorldDimMask(
  layerGroup: L.LayerGroup,
  hexCells: HexCell[],
  mapLat: number,
  mapLng: number,
  tileSizeMeters: number,
) {
  if (hexCells.length === 0) {
    return;
  }

  const worldOuter: L.LatLngExpression[] = [
    [-90, -180],
    [-90, 180],
    [90, 180],
    [90, -180],
  ];
  const rings: L.LatLngExpression[][] = [worldOuter];

  for (const cell of hexCells) {
    const corners = roomHexCornerLatLngs(cell.q, cell.r, mapLat, mapLng, tileSizeMeters);
    rings.push(corners.map(([lat, lng]) => [lat, lng] as L.LatLngExpression));
  }

  L.polygon(rings, {
    color: 'transparent',
    weight: 0,
    fillColor: '#0a1220',
    fillOpacity: 0.55,
    interactive: false,
    className: 'grid-dim-mask',
  }).addTo(layerGroup);
}

function renderSupplyLines(
  layerGroup: L.LayerGroup,
  shouldShowSupplyLinesValue: boolean,
  state: GameState,
  supplyEdges: Array<{ fromCenter: L.LatLngExpression; toCenter: L.LatLngExpression; teamColor: string }>,
) {
  if (!(shouldShowSupplyLinesValue && state.dynamics?.supplyLinesEnabled && state.dynamics?.hqEnabled)) {
    return;
  }

  for (const edge of supplyEdges) {
    L.polyline([edge.fromCenter, edge.toCenter], {
      color: edge.teamColor,
      weight: 1.5,
      opacity: 0.4,
      dashArray: '8 4',
      interactive: false,
      className: 'supply-line',
    }).addTo(layerGroup);
  }
}

function renderContestedEdges(
  layerGroup: L.LayerGroup,
  shouldShowContestEffectsValue: boolean,
  renderedGrid: Record<string, HexCell>,
  state: GameState,
) {
  if (!shouldShowContestEffectsValue) {
    return;
  }

  const contestedEdges = findContestedEdges(renderedGrid, state.mapLat!, state.mapLng!, state.tileSizeMeters);
  for (const edge of contestedEdges) {
    const intensityClass = edge.intensity > 0.6 ? 'contested-edge-intense' : '';
    L.polyline([edge.from, edge.to], {
      color: edge.teamAColor,
      weight: 3,
      opacity: 0.7,
      interactive: false,
      className: `contested-edge ${intensityClass}`,
    }).addTo(layerGroup);
  }
}

function getChangedHexKeys(
  previousGrid: Record<string, HexCell>,
  nextGrid: Record<string, HexCell>,
): { newlyClaimedKeys: Set<string>; newlyRevealedKeys: Set<string> } {
  const newlyRevealedKeys = new Set<string>();
  const newlyClaimedKeys = new Set<string>();
  const isFirstRender = Object.keys(previousGrid).length === 0;

  if (isFirstRender) {
    return { newlyClaimedKeys, newlyRevealedKeys };
  }

  for (const cell of Object.values(nextGrid)) {
    const key = `${cell.q},${cell.r}`;
    const previousCell = previousGrid[key];
    if (previousCell && !previousCell.ownerId && previousCell.troops === 0 && (cell.ownerId || cell.troops > 0)) {
      newlyRevealedKeys.add(key);
    }
    if (previousCell && previousCell.ownerId !== cell.ownerId && cell.ownerId) {
      newlyClaimedKeys.add(key);
    }
  }

  return { newlyClaimedKeys, newlyRevealedKeys };
}
