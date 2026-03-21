import { memo, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import L from 'leaflet';
import { useHexGeometries } from '../../../hooks/useHexGeometries';
import { useGameStore } from '../../../stores/gameStore';
import { useGameplayStore } from '../../../stores/gameplayStore';
import { usePlayerLayerStore } from '../../../stores/playerLayerStore';
import { HEX_DIRS, hexKey as toHexKey } from '../HexMath';
import { ReactSvgOverlay } from '../ReactSvgOverlay';

interface AbilityOverlayLayerProps {
  map: L.Map;
  mapLat: number;
  mapLng: number;
  tileSizeMeters: number;
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

  const hexGeometries = useHexGeometries(
    map,
    overlayState.tileKeys,
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

  if (!svgRoot || overlayState.mode === 'none') {
    return null;
  }

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