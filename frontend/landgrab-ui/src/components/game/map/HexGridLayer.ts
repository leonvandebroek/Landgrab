import type { MutableRefObject } from 'react';
import L from 'leaflet';
import type { GameState, HexCell } from '../../../types/game';
import type { MapLayerPreferences } from '../../../types/mapLayerPreferences';
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
import { latLngToRoomHex, roomHexCornerLatLngs } from '../../map/HexMath';
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
const FORT_BUILD_DURATION_MS = 10 * 60 * 1000;
const DEMOLISH_DURATION_MS = 2 * 60 * 1000;

function getEngineerBuildProgress(engineerBuiltAt: string | undefined): number | null {
  if (!engineerBuiltAt) {
    return null;
  }

  const builtAtMs = Date.parse(engineerBuiltAt);
  if (!Number.isFinite(builtAtMs)) {
    return null;
  }

  return Math.max(0, Math.min(1, (Date.now() - builtAtMs) / FORT_BUILD_DURATION_MS));
}

function getTimedProgress(startedAt: string | undefined, durationMs: number): number | null {
  if (!startedAt) {
    return null;
  }

  const startedAtMs = Date.parse(startedAt);
  if (!Number.isFinite(startedAtMs)) {
    return null;
  }

  return Math.max(0, Math.min(1, (Date.now() - startedAtMs) / durationMs));
}

function getPlayerHexKey(player: GameState['players'][number], state: GameState): string | null {
  if (player.currentHexQ != null && player.currentHexR != null) {
    return `${player.currentHexQ},${player.currentHexR}`;
  }

  if (player.currentLat == null || player.currentLng == null || state.mapLat == null || state.mapLng == null) {
    return null;
  }

  const [q, r] = latLngToRoomHex(
    player.currentLat,
    player.currentLng,
    state.mapLat,
    state.mapLng,
    state.tileSizeMeters,
  );

  return `${q},${r}`;
}

interface RenderHexGridLayerOptions {
  currentHex: [number, number] | null;
  currentZoom: number;
  inactiveHexKeySet: ReadonlySet<string>;
  layerGroup: L.LayerGroup;
  layerPrefs: MapLayerPreferences;
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
  layerPrefs,
  myUserId,
  onHexClickRef,
  pointerDownRef,
  prevGridRef,
  renderedGrid,
  selectedHex,
  state,
}: RenderHexGridLayerOptions): void {
  layerGroup.clearLayers();
  if (layerPrefs.worldDimMask) {
    renderWorldDimMask(layerGroup, Object.values(renderedGrid), state.mapLat!, state.mapLng!, state.tileSizeMeters);
  }

  const { newlyClaimedKeys, newlyRevealedKeys } = getChangedHexKeys(prevGridRef.current, renderedGrid);
  const hostPlayer = state.players.find(player => player.isHost);
  const hostColor = hostPlayer?.allianceColor ?? hostPlayer?.color ?? '#f1c40f';
  const myPlayer = state.players.find(player => player.id === myUserId);
  const currentPlayerHighlightColor = myPlayer?.allianceColor ?? myPlayer?.color ?? DEFAULT_PLAYER_MARKER_COLOR;
  const playersById = new Map(state.players.map(player => [player.id, player]));
  const shouldShowTerrainIcons = layerPrefs.terrainIcons && showTerrainIconsZoom(currentZoom);
  const shouldShowTroopBadges = layerPrefs.troopBadges && showTroopBadges(currentZoom);
  const shouldShowBorderEffects = layerPrefs.borderEffects && showBorderEffects(currentZoom);
  const shouldShowBuildingIcons = layerPrefs.buildingIcons && showBuildingIcons(currentZoom);
  const shouldShowHexTooltips = showHexTooltips(currentZoom);
  const shouldShowContestEffects = layerPrefs.contestedEdges && showContestEffects(currentZoom);
  const shouldShowSupplyLines = layerPrefs.supplyLines && showSupplyLines(currentZoom);
  const shouldApplyFogOfWar = layerPrefs.fogOfWar;
  const shieldWallHexKeys = new Set(
    state.players
      .filter((player) => player.shieldWallActive)
      .map((player) => getPlayerHexKey(player, state))
      .filter((key): key is string => key != null),
  );
  const demolishProgressByHexKey = new Map<string, number>();

  for (const player of state.players) {
    if (!player.demolishActive || !player.demolishTargetKey) {
      continue;
    }

    const progress = getTimedProgress(player.demolishStartedAt, DEMOLISH_DURATION_MS);
    if (progress == null) {
      continue;
    }

    const currentProgress = demolishProgressByHexKey.get(player.demolishTargetKey) ?? 0;
    demolishProgressByHexKey.set(player.demolishTargetKey, Math.max(currentProgress, progress));
  }

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
      currentPlayerHighlightColor,
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
      shieldWallHexKeys,
      shouldApplyFogOfWar,
      shouldShowContestEffects,
      shouldShowBorderEffects,
      shouldShowBuildingIcons,
      shouldShowHexTooltips,
      shouldShowSupplyLines,
      shouldShowTerrainIcons,
      shouldShowTroopBadges,
      state,
      demolishProgressByHexKey,
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
  currentPlayerHighlightColor: string;
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
  shieldWallHexKeys: ReadonlySet<string>;
  shouldApplyFogOfWar: boolean;
  shouldShowContestEffects: boolean;
  shouldShowBorderEffects: boolean;
  shouldShowBuildingIcons: boolean;
  shouldShowHexTooltips: boolean;
  shouldShowSupplyLines: boolean;
  shouldShowTerrainIcons: boolean;
  shouldShowTroopBadges: boolean;
  state: GameState;
  demolishProgressByHexKey: ReadonlyMap<string, number>;
  supplyDisconnected: ReadonlySet<string>;
}

function renderHexCell({
  cell,
  currentHex,
  currentPlayerHighlightColor,
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
  shieldWallHexKeys,
  shouldApplyFogOfWar,
  shouldShowContestEffects,
  shouldShowBorderEffects,
  shouldShowBuildingIcons,
  shouldShowHexTooltips,
  shouldShowSupplyLines,
  shouldShowTerrainIcons,
  shouldShowTroopBadges,
  state,
  demolishProgressByHexKey,
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
  const isFogHidden = shouldApplyFogOfWar && isFogHiddenHex(cell, isInactive, state.dynamics?.fogOfWarEnabled);
  const hasShieldWall = shieldWallHexKeys.has(cellKey);
  const demolishProgress = demolishProgressByHexKey.get(cellKey) ?? null;
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
    isHQ: isHQHex,
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
      isHQ: isHQHex,
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

  if (shouldShowHexTooltips && !isFogHidden) {
    polygon.bindTooltip(
      buildHexTooltipHtml(cell, currentHex, isContested),
      { sticky: true, className: 'hex-tooltip-card' },
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
    polygonElement.style.setProperty('--hex-player-highlight-color', currentPlayerHighlightColor);
  }

  if (isCurrentHex && !isInactive && !isFogHidden) {
    const currentHexOverlay = L.polygon(corners, {
      className: 'hex-active-player is-current-player-hex',
      color: currentPlayerHighlightColor,
      dashArray: '10 6',
      weight: 5,
      opacity: 0.95,
      fillColor: currentPlayerHighlightColor,
      fillOpacity: 0.16,
      interactive: false,
      bubblingMouseEvents: false,
    }).addTo(layerGroup);
    const overlayElement = currentHexOverlay.getElement();
    if (overlayElement instanceof SVGElement || overlayElement instanceof HTMLElement) {
      overlayElement.style.setProperty('--hex-player-highlight-color', currentPlayerHighlightColor);
    }
  }

  if (supplyDisconnected.has(cellKey) && !isInactive && !isFogHidden) {
    L.polygon(corners, {
      className: 'hex-disconnected-overlay',
      color: 'rgba(214, 225, 240, 0.72)',
      dashArray: '6 5',
      weight: 2,
      opacity: 0.9,
      fillColor: 'transparent',
      fillOpacity: 0,
      interactive: false,
    }).addTo(layerGroup);
  }

  if (hasShieldWall && !isInactive) {
    L.polygon(corners, {
      className: 'hex-shield-wall-overlay',
      color: '#3b82f6',
      weight: 3,
      opacity: 0.95,
      fillColor: '#3b82f6',
      fillOpacity: 0.12,
      interactive: false,
      bubblingMouseEvents: false,
    }).addTo(layerGroup);

    L.marker([centerLat, centerLng], {
      icon: L.divIcon({
        className: 'hex-shield-wall-marker',
        html: '<div class="hex-shield-wall-icon" aria-hidden="true">🛡️</div>',
        iconSize: [26, 26],
        iconAnchor: [13, 13],
      }),
      interactive: false,
      zIndexOffset: 26,
    }).addTo(layerGroup);
  }

  const showContestedIndicator = shouldShowContestEffects
    && cell.troops > 0
    && cell.ownerId
    && isContested
    && !isInactive
    && !isFogHidden;

  if (showContestedIndicator) {
    L.circle([centerLat, centerLng], {
      radius: state.tileSizeMeters * 0.3,
      color: '#e74c3c',
      weight: 3,
      fillColor: '#e74c3c',
      fillOpacity: 0.2,
      interactive: false,
    }).addTo(layerGroup);

    L.marker([centerLat, centerLng], {
      icon: L.divIcon({
        className: 'hex-contested-icon',
        html: '<div aria-hidden="true" style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;font-size:12px;line-height:1;opacity:0.72;color:#fff;text-shadow:0 1px 2px rgba(0, 0, 0, 0.55);">⚔️</div>',
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      }),
      interactive: false,
      keyboard: false,
      zIndexOffset: 12,
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
      isFort: Boolean(cell.isFort),
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

  const engineerBuildProgress = !cell.isFort && !isInactive && !isFogHidden
    ? getEngineerBuildProgress(cell.engineerBuiltAt)
    : null;

  if (engineerBuildProgress != null) {
    L.marker([centerLat, centerLng], {
      icon: L.divIcon({
        className: 'hex-fort-progress',
        html: `<div class="fort-progress-ring" style="--progress:${engineerBuildProgress.toFixed(4)}"></div>`,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
      }),
      interactive: false,
      zIndexOffset: -15,
    }).addTo(layerGroup);
  }

  if (demolishProgress != null && !isInactive) {
    const remaining = Math.max(0, 1 - demolishProgress);
    L.marker([centerLat, centerLng], {
      icon: L.divIcon({
        className: 'hex-demolish-progress',
        html: `<div class="demolish-progress-ring" style="--progress:${demolishProgress.toFixed(4)};--remaining:${remaining.toFixed(4)}"></div>`,
        iconSize: [42, 42],
        iconAnchor: [21, 21],
      }),
      interactive: false,
      zIndexOffset: 28,
    }).addTo(layerGroup);
  }

  if (cell.isFort && !isInactive && !isFogHidden) {
    L.marker([centerLat, centerLng], {
      icon: L.divIcon({
        className: 'hex-fort-icon-wrapper',
        html: '<div class="hex-fort-icon" aria-hidden="true">🏰</div>',
        iconSize: [18, 18],
        iconAnchor: [0, 18],
      }),
      interactive: false,
      zIndexOffset: 18,
    }).addTo(layerGroup);
  }

  if (shouldShowBuildingIcons) {
    if (cell.isMasterTile && !isInactive && !isFogHidden) {
      L.marker([centerLat, centerLng], {
        icon: L.divIcon({
          className: 'hex-building-icon',
          html: '<div class="building master">✦</div>',
          iconSize: [28, 28],
          iconAnchor: [14, 28],
        }),
        interactive: false,
        zIndexOffset: -12,
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
