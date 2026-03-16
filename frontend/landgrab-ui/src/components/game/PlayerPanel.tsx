import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import type { GameState, Player } from '../../types/game';
import { hexKey } from '../map/HexMath';
import { GameEventLog } from './GameEventLog';
import { getTileInteractionStatus } from './tileInteraction';
import type { MapInteractionFeedback } from './tileInteraction';

interface LocationPoint {
  lat: number;
  lng: number;
}

interface PickupPrompt {
  q: number;
  r: number;
  max: number;
}

interface GuidanceCard {
  message: string;
  tone: 'info' | 'success';
}

interface Props {
  state: GameState;
  myUserId: string;
  currentLocation: LocationPoint | null;
  currentHex: [number, number] | null;
  selectedHex: [number, number] | null;
  interactionFeedback: MapInteractionFeedback | null;
  pickupPrompt: PickupPrompt | null;
  pickupCount: number;
  onPickupCountChange: (count: number) => void;
  onConfirmPickup: () => void;
  onCancelPickup: () => void;
  onReturnToLobby: () => void;
  error: string;
  locationError: string | null;
}

export function PlayerPanel({
  state,
  myUserId,
  currentLocation,
  currentHex,
  selectedHex,
  interactionFeedback,
  pickupPrompt,
  pickupCount,
  onPickupCountChange,
  onConfirmPickup,
  onCancelPickup,
  onReturnToLobby,
  error,
  locationError
}: Props) {
  const { i18n, t } = useTranslation();
  const [now, setNow] = useState(() => Date.now());
  const me = state.players.find(player => player.id === myUserId) ?? null;
  const currentCell = currentHex ? state.grid[hexKey(currentHex[0], currentHex[1])] : undefined;
  const selectedCell = selectedHex ? state.grid[hexKey(selectedHex[0], selectedHex[1])] : undefined;
  const claimableHexes = useMemo(
    () => Object.values(state.grid).filter(cell => !cell.isMasterTile).length,
    [state.grid]
  );
  const focusedHex = selectedHex ?? currentHex;
  const focusedCell = selectedHex ? selectedCell : currentCell;
  const tileInteractionStatus = useMemo(
    () => getTileInteractionStatus({
      state,
      player: me,
      targetHex: focusedHex,
      targetCell: focusedCell,
      currentHex,
      t
    }),
    [currentHex, focusedCell, focusedHex, me, state, t]
  );
  const visibleInteractionFeedback = useMemo(() => {
    if (!interactionFeedback) {
      return null;
    }

    if (!interactionFeedback.targetHex || !focusedHex) {
      return interactionFeedback.message === tileInteractionStatus.message
        ? null
        : interactionFeedback;
    }

    return interactionFeedback.targetHex[0] === focusedHex[0]
      && interactionFeedback.targetHex[1] === focusedHex[1]
      && interactionFeedback.message !== tileInteractionStatus.message
      ? interactionFeedback
      : null;
  }, [focusedHex, interactionFeedback, tileInteractionStatus.message]);
  const fieldGuidance = useMemo(
    () => getFieldGuidance({ currentLocation, currentHex, currentCell, player: me, t }),
    [currentCell, currentHex, currentLocation, me, t]
  );

  useEffect(() => {
    if (state.phase !== 'Playing' || state.winConditionType !== 'TimedGame' || !state.gameStartedAt || !state.gameDurationMinutes) {
      return;
    }

    const intervalId = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(intervalId);
  }, [state.gameDurationMinutes, state.gameStartedAt, state.phase, state.winConditionType]);

  const timeRemaining = useMemo(() => {
    if (state.winConditionType !== 'TimedGame' || !state.gameStartedAt || !state.gameDurationMinutes) {
      return null;
    }

    const endTime = new Date(state.gameStartedAt).getTime() + state.gameDurationMinutes * 60_000;
    return Math.max(0, endTime - now);
  }, [now, state.gameDurationMinutes, state.gameStartedAt, state.winConditionType]);

  return (
    <div className="player-panel">
      <div className="room-code-banner">
        <small>{t('game.roomLabel')}</small>
        <span className="room-code">{state.roomCode}</span>
      </div>

      <div className="turn-banner">
        <span className="turn-label">{t('game.realtimeMatch')}</span>
        <span className="phase-badge">{t(`phase.${state.phase}`)}</span>
      </div>

      <div className="status-grid">
        <div className="stat-card">
          <small>{t('game.carriedTroops')}</small>
          <strong>{me?.carriedTroops ?? 0}</strong>
        </div>

        <div className="stat-card">
          <small>{t('game.currentTile')}</small>
          <strong>{currentHex ? `${currentHex[0]}, ${currentHex[1]}` : t('game.unknown')}</strong>
          <span className="section-note">
            {currentCell
              ? describeCurrentHex(currentCell, me, t)
              : currentLocation
                ? t('game.moveToLock')
                : t('game.waitingForGps')}
          </span>
        </div>

        {state.winConditionType === 'TimedGame' && timeRemaining !== null && (
          <div className="stat-card">
            <small>{t('game.timer')}</small>
            <strong>{formatDuration(timeRemaining)}</strong>
            <span className="section-note">{t('game.timerNote')}</span>
          </div>
        )}
      </div>

      <div className="selected-hex-card gameplay-card">
        <div className="gameplay-card-header">
          <small>{selectedHex ? t('game.selectedTile') : t('game.nextStep')}</small>
          {focusedHex && <strong className="tile-coordinates">{focusedHex[0]}, {focusedHex[1]}</strong>}
        </div>
        <span className="section-note">
          {focusedCell
            ? describeCurrentHex(focusedCell, me, t)
            : currentLocation
              ? t('game.moveToLock')
              : t('game.waitingForGps')}
        </span>
        <p className="hint gameplay-hint">
          {focusedCell && focusedHex
            ? tileInteractionStatus.message
            : currentLocation
              ? t('game.tapTilePrompt')
              : t('game.waitingForGps')}
        </p>
        {visibleInteractionFeedback && (
          <p className={`map-feedback is-${visibleInteractionFeedback.tone}`}>
            {visibleInteractionFeedback.message}
          </p>
        )}
      </div>

      <div className={`selected-hex-card gameplay-card guidance-card is-${fieldGuidance.tone}`}>
        <div className="gameplay-card-header">
          <small>{t('game.fieldGuidance')}</small>
        </div>
        <p className="hint gameplay-hint">{fieldGuidance.message}</p>
      </div>

      {pickupPrompt && (
        <div className="pickup-card">
          <h4>{t('game.pickUpTroops', { q: pickupPrompt.q, r: pickupPrompt.r })}</h4>
          <div className="range-field">
            <span>{t('game.count')} <strong className="range-value">{pickupCount}</strong></span>
            <input
              type="range"
              min={1}
              max={pickupPrompt.max}
              value={pickupCount}
              onChange={event => onPickupCountChange(Number(event.target.value))}
            />
          </div>

          <div className="pickup-actions">
            <button type="button" className="btn-primary" onClick={onConfirmPickup}>{t('game.confirm')}</button>
            <button type="button" className="btn-secondary" onClick={onCancelPickup}>{t('game.cancel')}</button>
          </div>
        </div>
      )}

      <div className="actions">
        <p className="hint">
          {(me?.carriedTroops ?? 0) > 0
            ? t('game.hintWithTroops')
            : t('game.hintNoTroops')}
        </p>
        {currentLocation && (
          <p className="section-note">
            {t('game.gpsLocation', { lat: currentLocation.lat.toFixed(5), lon: currentLocation.lng.toFixed(5) })}
          </p>
        )}
        <button type="button" className="btn-secondary" onClick={onReturnToLobby}>
          {t('game.returnToLobby')}
        </button>
      </div>

      {locationError && <p className="error-msg">{locationError}</p>}
      {error && <p className="error-msg">{error}</p>}

      <GameEventLog events={state.eventLog} players={state.players} />

      <div className="scoreboard">
        <h4>{t('game.territories')}</h4>
        {(state.alliances.length > 0 ? state.alliances : state.players).map(entity => (
          <ScoreRow
            key={entity.id}
            player={entity}
            totalHexes={claimableHexes}
            language={i18n.resolvedLanguage}
            t={t}
          />
        ))}
      </div>
    </div>
  );
}

export function ScoreRow({
  player,
  totalHexes,
  language,
  t
}: {
  player: Pick<Player, 'id' | 'name' | 'color' | 'territoryCount'> & { color?: string; emoji?: string };
  totalHexes: number;
  language?: string;
  t: TFunction;
}) {
  const share = totalHexes > 0 ? (player.territoryCount / totalHexes) * 100 : 0;

  return (
    <div className="score-row">
      <span className="score-dot" style={{ background: player.color ?? '#95a5a6' }} />
      <span className="score-name">
        {player.emoji && <span aria-hidden="true" style={{ display: 'inline', marginRight: '0.2em' }}>{player.emoji}</span>}
        {player.name}
      </span>
      <span className="score-count">
        {t('game.territoryProgress', {
          count: player.territoryCount,
          total: totalHexes,
          percent: formatTerritoryShare(share, language)
        })}
      </span>
    </div>
  );
}

function describeCurrentHex(cell: GameState['grid'][string], me: Player | null, t: TFunction): string {
  if (cell.isMasterTile) {
    return t('game.masterTileDesc', { count: cell.troops });
  }

  if (!cell.ownerId) {
    return t('game.neutralHex');
  }

  if (cell.ownerId === me?.id) {
    return t('game.yourHexDesc', { count: cell.troops });
  }

  return t('game.enemyHexDesc', { name: cell.ownerName ?? 'Enemy', count: cell.troops });
}

function getFieldGuidance({
  currentLocation,
  currentHex,
  currentCell,
  player,
  t
}: {
  currentLocation: LocationPoint | null;
  currentHex: [number, number] | null;
  currentCell: GameState['grid'][string] | undefined;
  player: Player | null;
  t: TFunction;
}): GuidanceCard {
  if (!currentLocation) {
    return { message: t('game.guidance.noGps'), tone: 'info' };
  }

  if (!currentHex) {
    return { message: t('game.guidance.notOnGrid'), tone: 'info' };
  }

  if ((player?.carriedTroops ?? 0) > 0) {
    return { message: t('game.guidance.expandNow'), tone: 'success' };
  }

  if (currentCell?.ownerId === player?.id && (currentCell?.troops ?? 0) > 0) {
    return { message: t('game.guidance.pickupHere'), tone: 'success' };
  }

  if (currentCell?.ownerId === player?.id) {
    return { message: t('game.guidance.findTroops'), tone: 'info' };
  }

  return { message: t('game.guidance.moveToOwnedTile'), tone: 'info' };
}

function formatDuration(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function formatTerritoryShare(share: number, language?: string): string {
  if (share <= 0) {
    return '0%';
  }

  const formatter = new Intl.NumberFormat(language, {
    minimumFractionDigits: share < 10 ? 1 : 0,
    maximumFractionDigits: share < 10 ? 1 : 0
  });

  return `${formatter.format(share)}%`;
}
