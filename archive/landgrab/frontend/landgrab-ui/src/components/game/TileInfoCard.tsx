import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSecondTick } from '../../hooks/useSecondTick';
import { useEffectsStore } from '../../stores/effectsStore';
import { useGameStore } from '../../stores/gameStore';
import { useGameplayStore } from '../../stores/gameplayStore';
import { usePlayerLayerStore } from '../../stores/playerLayerStore';
import type { AllianceDto, ClaimMode, GameDynamics, HexCell, Player } from '../../types/game';
import { GameIcon } from '../common/GameIcon';
import { deriveTileState } from '../map/tricorderTileState';
import { getLocalHexSightingMs } from '../../utils/localVisibility';

const TILE_OWNER_FALLBACK_COLOR = 'rgba(177, 204, 220, 0.5)';
const TILE_VALUE_POSITIVE_COLOR = 'rgba(46, 204, 113, 0.85)';
const TILE_VALUE_WARNING_COLOR = 'rgba(251, 146, 60, 0.96)';
const EMPTY_GRID: Record<string, HexCell> = {};
const EMPTY_PLAYERS: Player[] = [];
const EMPTY_PLAYERS_RECORD: Record<string, Player> = {};
const EMPTY_ALLIANCES: AllianceDto[] = [];
const EMPTY_RAIDS: Array<{ targetQ: number; targetR: number }> = [];
const DEFAULT_CLAIM_MODE: ClaimMode = 'PresenceOnly';
const DEFAULT_DYNAMICS: GameDynamics = {
  playerRolesEnabled: false,
  beaconEnabled: false,
  hqEnabled: false,
  hqAutoAssign: false,
  tileDecayEnabled: false,
  fieldBattleEnabled: true,
  enemySightingMemorySeconds: 0,
};
const TILE_INFO_CARD_TOKEN_STYLES = `
  .tile-info-card {
    pointer-events: auto;
  }

  .tile-info-card__color-dot--fallback {
    background: ${TILE_OWNER_FALLBACK_COLOR};
  }

  .tile-info-card__color-dot--owned {
    background: ${TILE_OWNER_FALLBACK_COLOR};
  }

  .tile-info-card__value--positive {
    color: ${TILE_VALUE_POSITIVE_COLOR};
  }

  .tile-info-card__value--warning {
    color: ${TILE_VALUE_WARNING_COLOR};
  }

  .tile-info-card__archived-pill {
    display: inline-block;
    padding: 1px 6px;
    border-radius: 3px;
    background: rgba(180, 140, 60, 0.25);
    border: 1px solid rgba(255, 176, 0, 0.5);
    color: #ffb000;
    font-size: 0.65em;
    font-weight: 700;
    letter-spacing: 0.05em;
    vertical-align: middle;
    margin-left: 4px;
  }
`;

interface TileInfoCardProps {
  targetCell: HexCell | undefined;
  targetHex: [number, number];
  onDismiss: () => void;
  isPresenceBoosted?: boolean;
}

export function TileInfoCard({ targetCell, targetHex, onDismiss, isPresenceBoosted }: TileInfoCardProps) {
  const { t } = useTranslation();
  const grid = useGameStore((state) => (state.gridOverride ?? state.gameState?.grid) ?? EMPTY_GRID);
  const alliances = useGameStore((state) => state.gameState?.alliances ?? EMPTY_ALLIANCES);
  const activeRaids = useGameStore((state) => state.gameState?.activeRaids ?? EMPTY_RAIDS);
  const claimMode = useGameStore((state) => state.gameState?.claimMode ?? DEFAULT_CLAIM_MODE);
  const dynamics = useGameStore((state) => state.gameState?.dynamics ?? DEFAULT_DYNAMICS);
  const contestedHexKeys = useEffectsStore((state) => state.contestedHexKeys);
  const players = usePlayerLayerStore((state) => state.players ?? EMPTY_PLAYERS);
  const myUserId = usePlayerLayerStore((state) => state.myUserId);
  const currentHexKey = useGameplayStore((state) => state.currentHexKey);
  const selectedHexKey = useGameplayStore((state) => state.selectedHexKey);
  const beaconConeHexKeys = useGameplayStore((state) => state.beaconConeHexKeys);
  const [, setNow] = useState(() => Date.now());

  useSecondTick(() => {
    setNow(Date.now());
  });

  const hexKey = `${targetHex[0]},${targetHex[1]}`;

  const playersRecord = useMemo<Record<string, Player>>(() => {
    if (players.length === 0) {
      return EMPTY_PLAYERS_RECORD;
    }
    return Object.fromEntries(players.map((player) => [player.id, player])) as Record<string, Player>;
  }, [players]);

  const playerPositions = useMemo(() => buildPlayerPositions(players), [players]);
  const currentPlayer = playersRecord[myUserId];

  // Compute allied player hex keys for local visibility
  const alliedPlayerHexKeys = useMemo(() => {
    const keys = new Set<string>();
    const allianceId = currentPlayer?.allianceId;
    for (const player of players) {
      const isAllied = player.id === myUserId
        || (allianceId && player.allianceId === allianceId);
      if (isAllied && player.currentHexQ != null && player.currentHexR != null) {
        keys.add(`${player.currentHexQ},${player.currentHexR}`);
      }
    }
    return keys;
  }, [players, myUserId, currentPlayer]);

  // Compute alliance-owned hex keys for local visibility
  const allianceOwnedHexKeys = useMemo(() => {
    const keys = new Set<string>();
    const allianceId = currentPlayer?.allianceId;
    if (!allianceId) {
      return keys;
    }
    for (const [key, cell] of Object.entries(grid)) {
      if (cell.ownerId && cell.ownerAllianceId === allianceId) {
        keys.add(key);
      }
    }
    return keys;
  }, [grid, currentPlayer]);

  const tileState = useMemo(() => deriveTileState({
    cell: targetCell,
    hexKey,
    currentPlayerId: myUserId,
    currentPlayerAllianceId: currentPlayer?.allianceId,
    playerHexKey: currentHexKey,
    currentHexKey,
    selectedHexKey,
    alliances,
    players: playersRecord,
    activeRaids: activeRaids as never,
    contestedHexKeys,
    grid,
    claimMode,
    dynamics,
    playerPositions,
    beaconConeHexKeys,
    alliedPlayerHexKeys,
    allianceOwnedHexKeys,
    // alliedPlayerHexKeys (in deps) changes on the same PlayersMoved event that records
    // the sighting, so this memo re-runs and picks up the updated value.
    locallySeenAtMs: getLocalHexSightingMs(hexKey),
  }), [
    activeRaids,
    alliances,
    alliedPlayerHexKeys,
    allianceOwnedHexKeys,
    beaconConeHexKeys,
    claimMode,
    contestedHexKeys,
    currentHexKey,
    currentPlayer?.allianceId,
    dynamics,
    grid,
    hexKey,
    myUserId,
    playerPositions,
    playersRecord,
    selectedHexKey,
    targetCell,
  ]);

  const isInBeaconCone = beaconConeHexKeys.has(hexKey);
  const isRemembered = tileState.visibilityTier === 'Remembered' && !isInBeaconCone;
  const isHidden = tileState.visibilityTier === 'Hidden' && !isInBeaconCone;
  const stalenessTier = tileState.stalenessTier;
  const isStale = stalenessTier === 'stale' || stalenessTier === 'fading';
  const amberHeaderStyle = isStale ? { color: 'var(--color-phosphor-amber)' } : undefined;
  const lastSeenText = isRemembered ? formatRelativeTime(targetCell?.lastSeenAt) : null;

  const displayOwnerId = isRemembered ? targetCell?.lastKnownOwnerId : targetCell?.ownerId;
  const displayOwnerName = isRemembered 
    ? (targetCell?.lastKnownOwnerName ? `${targetCell.lastKnownOwnerName} ${t('game.tileInfo.lastKnown', '(last known)')}` : t('game.unknown'))
    : (targetCell?.ownerName ?? t('game.unknown'));
  const displayOwnerColor = isRemembered ? targetCell?.lastKnownOwnerColor : targetCell?.ownerColor;
  const displayTroops = isRemembered ? (targetCell?.lastKnownTroops ?? 0) : (targetCell?.troops ?? 0);
  const displayIsFort = isRemembered ? targetCell?.lastKnownIsFort : targetCell?.isFort;
  const displayIsFortified = isRemembered ? false : targetCell?.isFortified;
  const displayIsMasterTile = isRemembered ? targetCell?.lastKnownIsMasterTile : targetCell?.isMasterTile;

  const hasOwner = Boolean(displayOwnerId);
  const safeOwnerColor = sanitizeCssColor(displayOwnerColor ?? undefined);
  const tokenStyles = useMemo(() => {
    if (!safeOwnerColor) {
      return TILE_INFO_CARD_TOKEN_STYLES;
    }

    return `${TILE_INFO_CARD_TOKEN_STYLES}\n.tile-info-card__color-dot--owned {\n  background: ${safeOwnerColor};\n}`;
  }, [safeOwnerColor]);

  const friendlyPlayerCount = useMemo(() => countFriendlyPlayersOnHex({
    hexKey,
    currentPlayerAllianceId: currentPlayer?.allianceId,
    currentPlayerId: myUserId,
    playerPositions,
    players: playersRecord,
  }), [currentPlayer?.allianceId, hexKey, myUserId, playerPositions, playersRecord]);
  const sabotageStepsText = tileState.progressState.type === 'sabotage'
    ? `${tileState.progressState.stepsCompleted ?? 0}/${tileState.progressState.stepsRequired ?? 3}`
    : null;
  const demolishStepsText = tileState.progressState.type === 'demolish'
    ? `${tileState.progressState.stepsCompleted ?? 0}/${tileState.progressState.stepsRequired ?? 3}`
    : null;
  const regenBlockedCountdown = formatTimeRemaining(tileState.regenBlockedUntil);
  const rallyCountdown = formatTimeRemaining(tileState.urgencyState.rallyDeadline);
  const reachabilityKey = tileState.relationState.reachability === 'reachable'
    ? 'game.tileInfo.reachable'
    : tileState.relationState.reachability === 'unreachable'
      ? 'game.tileInfo.unreachable'
      : null;
  const showPresenceBoost = tileState.presenceBoosted || Boolean(isPresenceBoosted);

  if (!targetCell) {
    return null;
  }

  return (
    <>
      <style>{tokenStyles}</style>
      <div className="tile-info-card">
        <div className="tile-info-card__header" style={amberHeaderStyle}>
          <span className="tile-info-card__coords">
            ⬡ {targetHex[0]}, {targetHex[1]}
          </span>
          {isStale && (
            <span className="tile-info-card__archived-pill">
              {t('game.tileInfo.archived', 'ARCHIVED')}
            </span>
          )}
          <button
            type="button"
            className="tile-info-card__close"
            onClick={onDismiss}
            aria-label={t('game.close')}
          >
            ×
          </button>
        </div>

        <div className="tile-info-card__body">
          {isHidden ? (
            <div className="tile-info-card__row">
              <span className="tile-info-card__label">{t('game.tileInfo.status', 'Status')}</span>
              <span className="tile-info-card__value">{t('game.tileInfo.unknownTerritory', 'Unknown territory')}</span>
            </div>
          ) : (
            <>
              {hasOwner && (
                <div className="tile-info-card__row">
                  <span className="tile-info-card__label">{t('game.tileInfo.owner')}</span>
                  <span className="tile-info-card__value">
                    <span className={`tile-info-card__color-dot ${safeOwnerColor ? 'tile-info-card__color-dot--owned' : 'tile-info-card__color-dot--fallback'}`} />
                    {displayOwnerName}
                  </span>
                </div>
              )}

              {displayTroops > 0 && (
                <div className="tile-info-card__row">
                  <span className="tile-info-card__label">{t('game.tileInfo.troops')}</span>
                  <span className="tile-info-card__value"><GameIcon name="contested" size="sm" /> {isRemembered ? t('game.tileInfo.staleTroops' as never, { count: displayTroops, defaultValue: '~{{count}}' }) : displayTroops}</span>
                </div>
              )}

              {lastSeenText && (
                <div className="tile-info-card__row">
                  <span className="tile-info-card__value tile-info-card__last-seen" style={{ color: 'var(--color-phosphor-amber)', fontSize: '0.75em', opacity: 0.85 }}>
                    📡 {t('game.tileInfo.lastSeen', 'Last seen: {{time}}', { time: lastSeenText })}
                  </span>
                </div>
              )}

              {displayIsFortified && (
                <div className="tile-info-card__row">
                  <span className="tile-info-card__label">{t('game.tileInfo.status')}</span>
                  <span className="tile-info-card__value"><GameIcon name="shield" size="sm" /> {t('game.dock.fortified')}</span>
                </div>
              )}

              {displayIsFort && (
                <div className="tile-info-card__row">
                  <span className="tile-info-card__label">{t('game.tileInfo.status')}</span>
                  <span className="tile-info-card__value"><GameIcon name="fort" size="sm" /> {t('game.dock.fort')}</span>
                </div>
              )}

              {displayIsMasterTile && (
                <div className="tile-info-card__row">
                  <span className="tile-info-card__value tile-info-card__master">
                    <GameIcon name="crown" size="sm" /> {t('game.tileAction.masterTile')}
                  </span>
                </div>
              )}

          {tileState.progressState.type === 'sabotage' && (
            <div className="tile-info-card__section">
              <div className="tile-info-card__row">
                <span className="tile-info-card__label">{t('game.tileInfo.sabotageActive' as never)}</span>
                <span className="tile-info-card__value tile-info-card__value--warning">
                  <GameIcon name="lightning" size="sm" />
                  {sabotageStepsText}
                </span>
              </div>
              <progress
                className="tile-info-card__progress tile-info-card__progress--sabotage"
                max={100}
                value={Math.round(tileState.progressState.progress * 100)}
                aria-label={t('game.tileInfo.sabotageActive' as never)}
              />
            </div>
          )}

          {tileState.regenBlocked && (
            <div className="tile-info-card__section">
              <div className="tile-info-card__row">
                <span className="tile-info-card__label">{t('game.tileInfo.regenBlocked' as never)}</span>
                {regenBlockedCountdown ? (
                  <span className="tile-info-card__value tile-info-card__value--warning">
                    <GameIcon name="hourglass" size="sm" /> {regenBlockedCountdown}
                  </span>
                ) : null}
              </div>
              {regenBlockedCountdown ? (
                <div className="tile-info-card__meta">
                  {t('game.tileInfo.regenBlockedUntil' as never, { time: regenBlockedCountdown })}
                </div>
              ) : null}
            </div>
          )}

          {tileState.urgencyState.rallyObjective && (
            <div className="tile-info-card__section">
              <div className="tile-info-card__row">
                <span className="tile-info-card__label">{t('game.tileInfo.rallyPoint' as never)}</span>
                <span className="tile-info-card__value tile-info-card__value--positive">
                  <GameIcon name="rallyTroops" size="sm" /> {t('game.tileInfo.rallyPoint' as never)}
                </span>
              </div>
              {rallyCountdown ? (
                <div className="tile-info-card__meta">
                  {t('game.tileInfo.rallyDeadline' as never, { time: rallyCountdown })}
                </div>
              ) : null}
            </div>
          )}

          {friendlyPlayerCount > 0 && (
            <div className="tile-info-card__row">
              <span className="tile-info-card__value tile-info-card__value--positive">
                <GameIcon name="rallyTroops" size="sm" />
                {t('game.tileInfo.copresence' as never, { count: friendlyPlayerCount })}
              </span>
            </div>
          )}

          {tileState.progressState.type === 'demolish' && (
            <div className="tile-info-card__section">
              <div className="tile-info-card__row">
                <span className="tile-info-card__label">{t('game.tileInfo.demolishActive' as never)}</span>
                <span className="tile-info-card__value tile-info-card__value--warning">
                  <GameIcon name="hammerDrop" size="sm" />
                  {demolishStepsText}
                </span>
              </div>
              <progress
                className="tile-info-card__progress tile-info-card__progress--demolish"
                max={100}
                value={Math.round(tileState.progressState.progress * 100)}
                aria-label={t('game.tileInfo.demolishActive' as never)}
              />
            </div>
          )}

          {reachabilityKey && (
            <div className="tile-info-card__row">
              <span className="tile-info-card__label">{t('game.tileInfo.status')}</span>
              <span className={`tile-info-card__value ${tileState.relationState.reachability === 'reachable' ? 'tile-info-card__value--positive' : 'tile-info-card__value--warning'}`}>
                <GameIcon name={tileState.relationState.reachability === 'reachable' ? 'compass' : 'returnArrow'} size="sm" />
                {t(reachabilityKey as never)}
              </span>
            </div>
          )}

              {!hasOwner && !displayIsMasterTile && (
                <div className="tile-info-card__row">
                  <span className="tile-info-card__value tile-info-card__neutral">
                    {t('game.tileInfo.unclaimed')}
                  </span>
                </div>
              )}

              {showPresenceBoost && (
                <div className="tile-info-card__row">
                  <span className="tile-info-card__value tile-info-card__value--positive">
                    <GameIcon name="rallyTroops" size="sm" /> {t('game.tileInfo.presenceBoost' as never)}
                  </span>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}

function buildPlayerPositions(players: Player[]): ReadonlyMap<string, string[]> {
  const positions = new Map<string, string[]>();

  for (const player of players) {
    if (!Number.isFinite(player.currentHexQ) || !Number.isFinite(player.currentHexR)) {
      continue;
    }

    const key = `${player.currentHexQ},${player.currentHexR}`;
    const playerIds = positions.get(key) ?? [];
    playerIds.push(player.id);
    positions.set(key, playerIds);
  }

  return positions;
}

function countFriendlyPlayersOnHex({
  hexKey,
  currentPlayerAllianceId,
  currentPlayerId,
  playerPositions,
  players,
}: {
  hexKey: string;
  currentPlayerAllianceId?: string;
  currentPlayerId: string;
  playerPositions: ReadonlyMap<string, string[]>;
  players: Record<string, Player>;
}): number {
  const playerIds = playerPositions.get(hexKey) ?? [];

  return playerIds.reduce((count, playerId) => {
    const player = players[playerId];
    if (!player) {
      return count;
    }

    const isFriendlyPlayer = player.id === currentPlayerId
      || (currentPlayerAllianceId !== undefined && player.allianceId === currentPlayerAllianceId);

    return isFriendlyPlayer ? count + 1 : count;
  }, 0);
}

function formatTimeRemaining(until: string | undefined): string | null {
  if (!until) {
    return null;
  }

  const remaining = new Date(until).getTime() - Date.now();
  if (remaining <= 0) {
    return null;
  }

  const minutes = Math.floor(remaining / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function formatRelativeTime(seenAt: string | number | null | undefined): string {
  if (!seenAt) return 'unknown';
  const ageMs = Date.now() - new Date(seenAt as string).getTime();
  const ageSec = Math.floor(ageMs / 1000);
  if (ageSec < 60) return `${ageSec}s ago`;
  const ageMin = Math.floor(ageSec / 60);
  if (ageMin < 60) return `${ageMin}m ago`;
  return `${Math.floor(ageMin / 60)}h ago`;
}

function sanitizeCssColor(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim();
  if (!normalized) {
    return undefined;
  }

  const isSafeColor = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(normalized)
    || /^(?:rgb|hsl)a?\([^)]+\)$/i.test(normalized)
    || /^[a-zA-Z]+$/.test(normalized);

  return isSafeColor ? normalized : undefined;
}
