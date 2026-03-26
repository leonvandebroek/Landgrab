import { memo, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import L from 'leaflet';
import { useHexGeometries } from '../../../hooks/useHexGeometries';
import { useGameStore } from '../../../stores/gameStore';
import { useGameplayStore } from '../../../stores/gameplayStore';
import { usePlayerLayerStore } from '../../../stores/playerLayerStore';
import { HEX_DIRS, hexKey as toHexKey, roomHexToLatLng } from '../HexMath';
import { ReactSvgOverlay } from '../ReactSvgOverlay';
import { computeBeaconCone } from '../../../utils/beaconCone';

interface AbilityOverlayLayerProps {
  map: L.Map;
  mapLat: number;
  mapLng: number;
  tileSizeMeters: number;
  compassHeading: number | null;
  isCompassRotationEnabled: boolean;
}

type OverlayMode = 'none' | 'commando' | 'fort' | 'sabotage' | 'demolish' | 'rally';
type SegmentTone = 'friendly' | 'hostile' | 'breach';

interface SegmentDescriptor {
  key: string;
  hexKey: string;
  visited: boolean;
  tone: SegmentTone;
}

interface OverlayState {
  mode: OverlayMode;
  tileKeys: string[];
  validTargetHexKeys: string[];
  invalidTargetHexKeys: string[];
  selectedTargetHexKey: string | null;
  targetHexKey: string | null;
  segments: SegmentDescriptor[];
  rallyHexKey: string | null;
}

const HEX_PANE = 'game-map-hex-pane';
const OVERLAY_PANE = 'overlayPane';
const EMPTY_OVERLAY_STATE: OverlayState = {
  mode: 'none',
  tileKeys: [],
  validTargetHexKeys: [],
  invalidTargetHexKeys: [],
  selectedTargetHexKey: null,
  targetHexKey: null,
  segments: [],
  rallyHexKey: null,
};

function AbilityOverlayLayerComponent({
  map,
  mapLat,
  mapLng,
  tileSizeMeters,
  compassHeading,
  isCompassRotationEnabled,
}: AbilityOverlayLayerProps) {
  const [svgRoot, setSvgRoot] = useState<SVGGElement | null>(null);
  const [zoomLevel, setZoomLevel] = useState<number>(() => map.getZoom());

  const grid = useGameStore((state) => state.gridOverride ?? state.gameState?.grid ?? null);
  const gameState = useGameStore((state) => state.gameState);
  const abilityUi = useGameplayStore((state) => state.abilityUi);
  const myUserId = usePlayerLayerStore((state) => state.myUserId);

  useEffect(() => {
    const pane = map.getPane(HEX_PANE) ? HEX_PANE : OVERLAY_PANE;
    const overlay = new ReactSvgOverlay({ pane });
    overlay.addTo(map);
    overlay.getSvg().style.pointerEvents = 'none';
    overlay.getContainer().style.pointerEvents = 'none';

    const frameId = window.requestAnimationFrame(() => {
      setSvgRoot(overlay.getContainer());
      setZoomLevel(map.getZoom());
    });

    const handleProjectionChange = () => {
      setZoomLevel(map.getZoom());
    };

    map.on('zoomend moveend viewreset rotate', handleProjectionChange);

    return () => {
      window.cancelAnimationFrame(frameId);
      overlay.remove();
      map.off('zoomend moveend viewreset rotate', handleProjectionChange);
    };
  }, [map]);

  const myPlayer = useMemo(() => {
    if (!gameState || !myUserId) {
      return null;
    }

    return gameState.players.find((player) => player.id === myUserId) ?? null;
  }, [gameState, myUserId]);

  const overlayState = useMemo<OverlayState>(() => {
    if (!grid || !gameState || !myPlayer || !abilityUi.activeAbility) {
      return EMPTY_OVERLAY_STATE;
    }

    if (abilityUi.activeAbility === 'beacon' && abilityUi.mode === 'active') {
      return EMPTY_OVERLAY_STATE;
    }

    if (
      abilityUi.activeAbility === 'commandoRaid'
      && (abilityUi.mode === 'targeting' || abilityUi.mode === 'confirming')
    ) {
      const derivedValidTargetHexKeys = abilityUi.validTargetHexKeys.length > 0
        ? abilityUi.validTargetHexKeys.filter((hexKey) => Boolean(grid[hexKey]))
        : Object.keys(grid);

      const validTargetSet = new Set(derivedValidTargetHexKeys);
      const tileKeys = Object.keys(grid);

      return {
        mode: 'commando',
        tileKeys,
        validTargetHexKeys: derivedValidTargetHexKeys,
        invalidTargetHexKeys: tileKeys.filter((hexKey) => !validTargetSet.has(hexKey)),
        selectedTargetHexKey: abilityUi.pendingTargetHexKey ?? abilityUi.targetHexKey,
        targetHexKey: null,
        segments: [],
        rallyHexKey: null,
      };
    }

    if (abilityUi.activeAbility === 'fortConstruction' && abilityUi.mode === 'inProgress') {
      const targetHexKey = getTargetHexKey(myPlayer.fortTargetQ, myPlayer.fortTargetR);

      if (!targetHexKey) {
        return EMPTY_OVERLAY_STATE;
      }

      const neighborKeys = getNeighborKeysFromKey(targetHexKey);
      const visitedKeys = new Set(myPlayer.fortPerimeterVisited ?? []);

      return {
        mode: 'fort',
        tileKeys: [targetHexKey, ...neighborKeys],
        validTargetHexKeys: [],
        invalidTargetHexKeys: [],
        selectedTargetHexKey: null,
        targetHexKey,
        segments: neighborKeys.map((hexKey, index) => ({
          key: `${targetHexKey}:fort:${index}`,
          hexKey,
          visited: visitedKeys.has(hexKey),
          tone: 'friendly',
        })),
        rallyHexKey: null,
      };
    }

    if (abilityUi.activeAbility === 'sabotage' && abilityUi.mode === 'inProgress') {
      const targetHexKey = getTargetHexKey(myPlayer.sabotageTargetQ, myPlayer.sabotageTargetR);

      if (!targetHexKey) {
        return EMPTY_OVERLAY_STATE;
      }

      const neighborKeys = getNeighborKeysFromKey(targetHexKey);
      const visitedKeys = new Set(myPlayer.sabotagePerimeterVisited ?? []);

      return {
        mode: 'sabotage',
        tileKeys: [targetHexKey, ...neighborKeys],
        validTargetHexKeys: [],
        invalidTargetHexKeys: [],
        selectedTargetHexKey: null,
        targetHexKey,
        segments: neighborKeys.map((hexKey, index) => ({
          key: `${targetHexKey}:sabotage:${index}`,
          hexKey,
          visited: visitedKeys.has(hexKey),
          tone: 'hostile',
        })),
        rallyHexKey: null,
      };
    }

    if (abilityUi.activeAbility === 'demolish' && abilityUi.mode === 'inProgress') {
      const targetHexKey = myPlayer.demolishTargetKey ?? null;

      if (!targetHexKey) {
        return EMPTY_OVERLAY_STATE;
      }

      const neighborKeys = getNeighborKeysFromKey(targetHexKey);
      const visitedKeys = new Set(myPlayer.demolishApproachDirectionsMade ?? []);

      return {
        mode: 'demolish',
        tileKeys: [targetHexKey, ...neighborKeys],
        validTargetHexKeys: [],
        invalidTargetHexKeys: [],
        selectedTargetHexKey: null,
        targetHexKey,
        segments: neighborKeys.map((hexKey, index) => ({
          key: `${targetHexKey}:demolish:${index}`,
          hexKey,
          visited: visitedKeys.has(hexKey),
          tone: 'breach',
        })),
        rallyHexKey: null,
      };
    }

    if (
      abilityUi.activeAbility === 'rallyPoint'
      && abilityUi.mode === 'active'
      && myPlayer.rallyPointQ != null
      && myPlayer.rallyPointR != null
    ) {
      const rallyHexKey = toHexKey(myPlayer.rallyPointQ, myPlayer.rallyPointR);

      return {
        mode: 'rally',
        tileKeys: [rallyHexKey],
        validTargetHexKeys: [],
        invalidTargetHexKeys: [],
        selectedTargetHexKey: null,
        targetHexKey: null,
        segments: [],
        rallyHexKey,
      };
    }

    return EMPTY_OVERLAY_STATE;
  }, [abilityUi, gameState, grid, myPlayer]);

  // Player GPS position projected to SVG layer-point coordinates
  const playerPixelPos = useMemo(() => {
    if (myPlayer?.currentLat == null || myPlayer?.currentLng == null) return null;
    const pt = map.latLngToLayerPoint([myPlayer.currentLat, myPlayer.currentLng]);
    return [pt.x, pt.y] as [number, number];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, myPlayer?.currentLat, myPlayer?.currentLng, zoomLevel]);

  // Beacon range in pixels: project one hex step via roomHexToLatLng, measure pixel distance, scale by range.
  const beaconPixelRadius = useMemo(() => {
    const q = myPlayer?.currentHexQ;
    const r = myPlayer?.currentHexR;
    if (q == null || r == null) return 400;
    const beaconRange = 3;
    const [lat0, lng0] = roomHexToLatLng(q, r, mapLat, mapLng, tileSizeMeters);
    const [lat1, lng1] = roomHexToLatLng(q, r + 1, mapLat, mapLng, tileSizeMeters);
    const pt0 = map.latLngToLayerPoint([lat0, lng0]);
    const pt1 = map.latLngToLayerPoint([lat1, lng1]);
    const dx = pt1.x - pt0.x;
    const dy = pt1.y - pt0.y;
    const oneStepPx = Math.sqrt(dx * dx + dy * dy);
    return Math.max(40, oneStepPx * beaconRange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, mapLat, mapLng, myPlayer?.currentHexQ, myPlayer?.currentHexR, tileSizeMeters, zoomLevel]);

  // Compass beam: shown when compass rotation is active
  const showCompassBeam = isCompassRotationEnabled && compassHeading !== null && playerPixelPos !== null;

  // Compass beam length in pixels: beacon players use beacon range (3 hexes), others use 1 hex.
  const compassBeamPixelRadius = useMemo(() => {
    const q = myPlayer?.currentHexQ;
    const r = myPlayer?.currentHexR;
    if (q == null || r == null) return 120;
    const isBeaconActive = myPlayer?.role === 'Scout' || Boolean(myPlayer?.isBeacon) || (abilityUi.activeAbility === 'beacon' && abilityUi.mode === 'active');
    const range = isBeaconActive ? 3 : 1;
    const [lat0, lng0] = roomHexToLatLng(q, r, mapLat, mapLng, tileSizeMeters);
    const [lat1, lng1] = roomHexToLatLng(q, r + 1, mapLat, mapLng, tileSizeMeters);
    const pt0 = map.latLngToLayerPoint([lat0, lng0]);
    const pt1 = map.latLngToLayerPoint([lat1, lng1]);
    const dx = pt1.x - pt0.x;
    const dy = pt1.y - pt0.y;
    const oneStepPx = Math.sqrt(dx * dx + dy * dy);
    return Math.max(40, oneStepPx * range);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, mapLat, mapLng, myPlayer?.currentHexQ, myPlayer?.currentHexR, myPlayer?.isBeacon, myPlayer?.role, abilityUi.activeAbility, abilityUi.mode, tileSizeMeters, zoomLevel]);

  // Active directional ability beam
  const activeAbilityBeam = useMemo(() => {
    if (!abilityUi.activeAbility || !myPlayer || !gameState) return null;
    if (myPlayer.currentLat == null || myPlayer.currentLng == null) return null;

    const directionalAbilities = ['tacticalStrike', 'commandoRaid', 'intercept', 'demolish'];
    if (!directionalAbilities.includes(abilityUi.activeAbility)) return null;
    if (abilityUi.mode !== 'active' && abilityUi.mode !== 'targeting' && abilityUi.mode !== 'inProgress') return null;

    const role = abilityUi.activeAbility === 'tacticalStrike' || abilityUi.activeAbility === 'commandoRaid'
      ? 'commander'
      : abilityUi.activeAbility === 'intercept'
        ? 'scout'
        : 'engineer';

    return {
      heading: compassHeading,
      angle: gameState.dynamics?.beaconSectorAngle ?? 45,
      role,
    };
  }, [abilityUi, myPlayer, gameState, compassHeading]);

  const beaconState = useMemo(() => {
    const isBeaconActive = myPlayer?.role === 'Scout' || Boolean(myPlayer?.isBeacon) || (abilityUi.activeAbility === 'beacon' && abilityUi.mode === 'active');
    if (!gameState || !isBeaconActive) {
      return null;
    }
    const heading = compassHeading ?? myPlayer?.beaconHeading;
    if (heading == null) {
      return null;
    }
    return {
      heading,
      angle: gameState.dynamics?.beaconSectorAngle ?? 45,
    };
  }, [gameState, myPlayer, compassHeading, abilityUi]);

  const beaconScanHexes = useMemo(() => {
    const isBeaconActive = myPlayer?.role === 'Scout' || Boolean(myPlayer?.isBeacon) || (abilityUi.activeAbility === 'beacon' && abilityUi.mode === 'active');
    if (
      !isBeaconActive ||
      myPlayer?.currentHexQ == null ||
      myPlayer?.currentHexR == null
    ) {
      return [] as string[];
    }
    const heading = compassHeading ?? myPlayer.beaconHeading;
    if (heading == null) {
      return [] as string[];
    }
    const playerHexKey = `${myPlayer.currentHexQ},${myPlayer.currentHexR}`;
    const sectorAngle = gameState?.dynamics?.beaconSectorAngle ?? 45;
    return computeBeaconCone(playerHexKey, heading, grid ?? {}, sectorAngle);
  }, [myPlayer, grid, compassHeading, abilityUi, gameState]);

  const allTileKeys = useMemo(
    () => (beaconScanHexes.length > 0
      ? [...new Set([...overlayState.tileKeys, ...beaconScanHexes])]
      : overlayState.tileKeys),
    [overlayState.tileKeys, beaconScanHexes],
  );

  const setBeaconConeHexKeys = useGameplayStore((state) => state.setBeaconConeHexKeys);

  useLayoutEffect(() => {
    setBeaconConeHexKeys(beaconScanHexes);
  }, [beaconScanHexes, setBeaconConeHexKeys]);

  const hexGeometries = useHexGeometries(
    map,
    allTileKeys,
    mapLat,
    mapLng,
    tileSizeMeters,
    zoomLevel,
  );

  const targetGeometry = overlayState.targetHexKey ? hexGeometries[overlayState.targetHexKey] : undefined;
  const rallyGeometry = overlayState.rallyHexKey ? hexGeometries[overlayState.rallyHexKey] : undefined;
  const selectedTargetGeometry = overlayState.selectedTargetHexKey
    ? hexGeometries[overlayState.selectedTargetHexKey]
    : undefined;

  if (!svgRoot || (overlayState.mode === 'none' && !beaconState && !beaconScanHexes.length && !showCompassBeam && !activeAbilityBeam)) {
    return null;
  }

  const renderCompassBeam = () => {
    if (!showCompassBeam || compassHeading === null || !playerPixelPos) return null;

    const [cx, cy] = playerPixelPos;
    const beamAngle = 30;
    const length = compassBeamPixelRadius;
    const radCenter = (compassHeading - 90) * Math.PI / 180;
    const radLeft = (compassHeading - beamAngle / 2 - 90) * Math.PI / 180;
    const radRight = (compassHeading + beamAngle / 2 - 90) * Math.PI / 180;
    const x1 = cx + length * Math.cos(radLeft);
    const y1 = cy + length * Math.sin(radLeft);
    const x2 = cx + length * Math.cos(radRight);
    const y2 = cy + length * Math.sin(radRight);
    const gradEndX = cx + length * Math.cos(radCenter);
    const gradEndY = cy + length * Math.sin(radCenter);
    const pathData = `M ${cx},${cy} L ${x1},${y1} A ${length},${length} 0 0,1 ${x2},${y2} Z`;

    return (
      <g className="compass-beam" pointerEvents="none">
        <defs>
          <linearGradient
            id="compassBeamGradient"
            gradientUnits="userSpaceOnUse"
            x1={cx}
            y1={cy}
            x2={gradEndX}
            y2={gradEndY}
          >
            <stop offset="0%" stopColor="#00f3ff" stopOpacity={0.5} />
            <stop offset="70%" stopColor="#00f3ff" stopOpacity={0.08} />
            <stop offset="100%" stopColor="#00f3ff" stopOpacity={0} />
          </linearGradient>
        </defs>
        <path d={pathData} fill="url(#compassBeamGradient)" />
      </g>
    );
  };

  const renderAbilityBeam = () => {
    if (!activeAbilityBeam || activeAbilityBeam.heading === null || !playerPixelPos) return null;

    const { heading, angle, role } = activeAbilityBeam;
    if (heading === null) return null;
    const [cx, cy] = playerPixelPos;
    const length = 1200;
    const radCenter = (heading - 90) * Math.PI / 180;
    const radLeft = (heading - angle / 2 - 90) * Math.PI / 180;
    const radRight = (heading + angle / 2 - 90) * Math.PI / 180;
    const x1 = cx + length * Math.cos(radLeft);
    const y1 = cy + length * Math.sin(radLeft);
    const x2 = cx + length * Math.cos(radRight);
    const y2 = cy + length * Math.sin(radRight);
    const largeArcFlag = angle > 180 ? 1 : 0;
    const pathData = `M ${cx},${cy} L ${x1},${y1} A ${length},${length} 0 ${largeArcFlag},1 ${x2},${y2} Z`;
    const gradEndX = cx + length * Math.cos(radCenter);
    const gradEndY = cy + length * Math.sin(radCenter);

    const colorMap: Record<string, string> = {
      commander: '#ffb000',
      scout: '#00f3ff',
      engineer: '#ffb366',
    };
    const beamColor = colorMap[role] ?? '#00f3ff';

    return (
      <g className={`ability-beam ability-beam--${role}`} pointerEvents="none">
        <defs>
          <linearGradient
            id={`abilityBeamGradient-${role}`}
            gradientUnits="userSpaceOnUse"
            x1={cx}
            y1={cy}
            x2={gradEndX}
            y2={gradEndY}
          >
            <stop offset="0%" stopColor={beamColor} stopOpacity={0.45} />
            <stop offset="60%" stopColor={beamColor} stopOpacity={0.1} />
            <stop offset="100%" stopColor={beamColor} stopOpacity={0} />
          </linearGradient>
        </defs>
        <path d={pathData} fill={`url(#abilityBeamGradient-${role})`} />
      </g>
    );
  };

  const renderBeaconSector = () => {
    if (!beaconState || !playerPixelPos) return null;

    const { heading, angle } = beaconState;
    const [cx, cy] = playerPixelPos;

    const length = beaconPixelRadius;
    const radCenter = (heading - 90) * Math.PI / 180;
    const radLeft = (heading - angle / 2 - 90) * Math.PI / 180;
    const radRight = (heading + angle / 2 - 90) * Math.PI / 180;

    const x1 = cx + length * Math.cos(radLeft);
    const y1 = cy + length * Math.sin(radLeft);
    const x2 = cx + length * Math.cos(radRight);
    const y2 = cy + length * Math.sin(radRight);
    const gradEndX = cx + length * Math.cos(radCenter);
    const gradEndY = cy + length * Math.sin(radCenter);

    const largeArcFlag = angle > 180 ? 1 : 0;
    const pathData = `M ${cx},${cy} L ${x1},${y1} A ${length},${length} 0 ${largeArcFlag},1 ${x2},${y2} Z`;

    return (
      <g className="ability-overlay__beacon-sector" pointerEvents="none" opacity={0.3}>
        <defs>
          <linearGradient
            id="beaconGradient"
            gradientUnits="userSpaceOnUse"
            x1={cx}
            y1={cy}
            x2={gradEndX}
            y2={gradEndY}
          >
            <stop offset="0%" stopColor="#00f3ff" stopOpacity={0.8} />
            <stop offset="60%" stopColor="#00f3ff" stopOpacity={0.2} />
            <stop offset="100%" stopColor="#00f3ff" stopOpacity={0} />
          </linearGradient>
        </defs>
        <path d={pathData} fill="url(#beaconGradient)" />
      </g>
    );
  };

  const renderBeaconScanHexes = () => {
    if (!beaconScanHexes.length) return null;

    return (
      <g className="ability-overlay__beacon-scan-hexes" pointerEvents="none">
        {beaconScanHexes.map((hexKey) => {
          const geometry = hexGeometries[hexKey];
          if (!geometry) return null;

          return (
            <polygon
              key={`beacon-scan:${hexKey}`}
              className="ability-overlay__polygon ability-overlay__beacon-scan-hex"
              points={geometry.points}
            />
          );
        })}
      </g>
    );
  };

  return createPortal(
    <g className="ability-overlay-layer" pointerEvents="none">
      {overlayState.mode === 'commando' && (
        <>
          <g className="ability-overlay__commando-dim">
            {overlayState.invalidTargetHexKeys.map((hexKey) => {
              const geometry = hexGeometries[hexKey];

              if (!geometry) {
                return null;
              }

              return (
                <polygon
                  key={`commando-invalid:${hexKey}`}
                  className="ability-overlay__polygon ability-overlay__commando-invalid"
                  points={geometry.points}
                />
              );
            })}
          </g>

          <g className="ability-overlay__commando-valids">
            {overlayState.validTargetHexKeys.map((hexKey) => {
              const geometry = hexGeometries[hexKey];

              if (!geometry) {
                return null;
              }

              return (
                <polygon
                  key={`commando-valid:${hexKey}`}
                  className="ability-overlay__polygon ability-overlay__commando-valid"
                  points={geometry.points}
                />
              );
            })}
          </g>

          {selectedTargetGeometry ? (
            <g className="ability-overlay__selection-marker">
              <polygon
                className="ability-overlay__polygon ability-overlay__commando-selected"
                points={selectedTargetGeometry.points}
              />
              <circle
                className="ability-overlay__target-ring"
                cx={selectedTargetGeometry.center[0]}
                cy={selectedTargetGeometry.center[1]}
                r={18}
              />
              <line
                className="ability-overlay__target-crosshair"
                x1={selectedTargetGeometry.center[0] - 12}
                y1={selectedTargetGeometry.center[1]}
                x2={selectedTargetGeometry.center[0] + 12}
                y2={selectedTargetGeometry.center[1]}
              />
              <line
                className="ability-overlay__target-crosshair"
                x1={selectedTargetGeometry.center[0]}
                y1={selectedTargetGeometry.center[1] - 12}
                x2={selectedTargetGeometry.center[0]}
                y2={selectedTargetGeometry.center[1] + 12}
              />
            </g>
          ) : null}
        </>
      )}

      {(overlayState.mode === 'fort' || overlayState.mode === 'sabotage' || overlayState.mode === 'demolish') && targetGeometry ? (
        <>
          <polygon
            className={[
              'ability-overlay__polygon',
              'ability-overlay__mission-target',
              overlayState.mode === 'fort' ? 'ability-overlay__mission-target--friendly' : '',
              overlayState.mode === 'sabotage' ? 'ability-overlay__mission-target--hostile' : '',
              overlayState.mode === 'demolish' ? 'ability-overlay__mission-target--breach' : '',
            ].filter(Boolean).join(' ')}
            points={targetGeometry.points}
          />

          {overlayState.segments.map((segment) => {
            const geometry = hexGeometries[segment.hexKey];

            if (!geometry) {
              return null;
            }

            return (
              <g key={segment.key} className="ability-overlay__segment-group">
                <line
                  className={[
                    'ability-overlay__segment-line',
                    `ability-overlay__segment-line--${segment.tone}`,
                    segment.visited
                      ? 'ability-overlay__segment-line--visited'
                      : 'ability-overlay__segment-line--remaining',
                  ].join(' ')}
                  x1={targetGeometry.center[0]}
                  y1={targetGeometry.center[1]}
                  x2={geometry.center[0]}
                  y2={geometry.center[1]}
                />
                <polygon
                  className={[
                    'ability-overlay__polygon',
                    'ability-overlay__segment',
                    `ability-overlay__segment--${segment.tone}`,
                    segment.visited
                      ? 'ability-overlay__segment--visited'
                      : 'ability-overlay__segment--remaining',
                  ].join(' ')}
                  points={geometry.points}
                />
              </g>
            );
          })}
        </>
      ) : null}

      {overlayState.mode === 'rally' && rallyGeometry ? (
        <g className="ability-overlay__rally-marker">
          <polygon
            className="ability-overlay__polygon ability-overlay__rally-hex"
            points={rallyGeometry.points}
          />
          <circle
            className="ability-overlay__rally-ring"
            cx={rallyGeometry.center[0]}
            cy={rallyGeometry.center[1]}
            r={16}
          />
          <circle
            className="ability-overlay__rally-core"
            cx={rallyGeometry.center[0]}
            cy={rallyGeometry.center[1]}
            r={7}
          />
          <text
            className="ability-overlay__rally-label"
            x={rallyGeometry.center[0]}
            y={rallyGeometry.center[1] + 4}
            textAnchor="middle"
          >
            R
          </text>
        </g>
      ) : null}
      
      {renderCompassBeam()}
      {renderAbilityBeam()}
      {renderBeaconSector()}
      {renderBeaconScanHexes()}
    </g>,
    svgRoot,
  );
}

function getTargetHexKey(q?: number | null, r?: number | null): string | null {
  if (q == null || r == null) {
    return null;
  }

  return toHexKey(q, r);
}

function getNeighborKeysFromKey(targetHexKey: string): string[] {
  const parsed = parseHexKey(targetHexKey);
  if (!parsed) {
    return [];
  }

  const [q, r] = parsed;
  return HEX_DIRS.map(([dq, dr]) => toHexKey(q + dq, r + dr));
}

function parseHexKey(value: string): [number, number] | null {
  const delimiter = value.includes(',') ? ',' : ':';
  const [qText, rText] = value.split(delimiter);
  const q = Number(qText);
  const r = Number(rText);

  if (!Number.isFinite(q) || !Number.isFinite(r)) {
    return null;
  }

  return [q, r];
}

export const AbilityOverlayLayer = memo(AbilityOverlayLayerComponent);