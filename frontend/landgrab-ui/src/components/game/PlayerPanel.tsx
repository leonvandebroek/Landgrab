import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import type { GameState, Player } from '../../types/game';
import { hexKey } from '../map/HexMath';

interface LocationPoint {
  lat: number;
  lng: number;
}

interface PickupPrompt {
  q: number;
  r: number;
  max: number;
}

interface Props {
  state: GameState;
  myUserId: string;
  currentLocation: LocationPoint | null;
  currentHex: [number, number] | null;
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
  pickupPrompt,
  pickupCount,
  onPickupCountChange,
  onConfirmPickup,
  onCancelPickup,
  onReturnToLobby,
  error,
  locationError
}: Props) {
  const { t } = useTranslation();
  const [now, setNow] = useState(() => Date.now());
  const me = state.players.find(player => player.id === myUserId) ?? null;
  const currentCell = currentHex ? state.grid[hexKey(currentHex[0], currentHex[1])] : undefined;
  const claimableHexes = useMemo(
    () => Object.values(state.grid).filter(cell => !cell.isMasterTile).length,
    [state.grid]
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
            {t('game.gpsLocation', { lat: currentLocation.lat.toFixed(5), lng: currentLocation.lng.toFixed(5) })}
          </p>
        )}
        <button type="button" className="btn-secondary" onClick={onReturnToLobby}>
          {t('game.returnToLobby')}
        </button>
      </div>

      {locationError && <p className="error-msg">{locationError}</p>}
      {error && <p className="error-msg">{error}</p>}

      <div className="scoreboard">
        <h4>{t('game.territories')}</h4>
        {(state.alliances.length > 0 ? state.alliances : state.players).map(entity => (
          <ScoreRow key={entity.id} player={entity} totalHexes={claimableHexes} />
        ))}
      </div>
    </div>
  );
}

function ScoreRow({ player, totalHexes }: { player: Pick<Player, 'id' | 'name' | 'color' | 'territoryCount'> & { color?: string }; totalHexes: number }) {
  const share = totalHexes > 0 ? Math.round((player.territoryCount / totalHexes) * 100) : 0;

  return (
    <div className="score-row">
      <span className="score-dot" style={{ background: player.color ?? '#95a5a6' }} />
      <span>{player.name}</span>
      <span className="score-count">{player.territoryCount} ({share}%)</span>
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

function formatDuration(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
