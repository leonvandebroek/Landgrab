import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { GameState } from '../../types/game';
import { hexKey } from '../map/HexMath';
import { GameEventLog } from './GameEventLog';
import { ScoreRow } from './PlayerPanel';
import { getTileInteractionStatus } from './tileInteraction';
import type { MapInteractionFeedback } from './tileInteraction';

interface PickupPrompt {
  q: number;
  r: number;
  max: number;
}

interface Props {
  state: GameState;
  myUserId: string;
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
  debugToggle?: React.ReactNode;
  debugPanel?: React.ReactNode;
  children?: React.ReactNode;
}

export function PlayingHud({
  state,
  myUserId,
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
  locationError,
  debugToggle,
  debugPanel,
  children
}: Props) {
  const { t } = useTranslation();
  const [activeModal, setActiveModal] = useState<'players' | 'log' | 'menu' | null>(null);

  const me = state.players.find((p) => p.id === myUserId);
  const myTotalTroops = useMemo(() => {
    if (!me) return 0;
    return Object.values(state.grid).reduce((sum, h) => {
      return h.ownerId === me.id ? sum + h.troops : sum;
    }, 0);
  }, [state.grid, me]);

  const sortedPlayers = useMemo(() => {
    return [...state.players].sort((a, b) => {
      if (a.isWinner !== b.isWinner) return a.isWinner ? -1 : 1;
      return b.territoryCount - a.territoryCount;
    });
  }, [state.players]);

  const totalHexes = useMemo(() => Object.keys(state.grid).length, [state.grid]);

  const interactionStatus = useMemo(() => {
    if (pickupPrompt) return null;
    const targetCell = selectedHex ? state.grid[hexKey(selectedHex[0], selectedHex[1])] ?? undefined : undefined;
    return getTileInteractionStatus({
      state,
      player: me ?? null,
      targetHex: selectedHex,
      targetCell,
      currentHex,
      t
    });
  }, [state, me, currentHex, selectedHex, t, pickupPrompt]);

  return (
    <div className="game-layout hud-active">
      <div className="top-status-bar">
        {locationError && <div className="top-warning-bar">📍 {locationError}</div>}
        {error && <div className="top-warning-bar">⚠️ {error}</div>}
        
        <div className="top-stats-row">
          <div className="hud-stats-flat">
            <div className="stat-item">
              <span className="stat-value primary">{me?.territoryCount || 0}</span>
              <span className="stat-label">{t('game.hudLands')}</span>
            </div>
            <div className="stat-item">
              <span className="stat-value secondary">{myTotalTroops}</span>
              <span className="stat-label">{t('game.hudTroops')}</span>
            </div>
          </div>
          <button className="hud-menu-btn-flat" onClick={() => setActiveModal('menu')} aria-label={t('game.hudMenu')}>
            <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
          </button>
        </div>
      </div>

      <div className="map-area-wrapper">
        <div className="map-container">
          {children}
        </div>

        <div className="bottom-hud-overlay">
          {pickupPrompt && (
            <div className="glass-panel hud-context-pill context-info" style={{ flexDirection: 'column', width: '100%', pointerEvents: 'auto' }}>
              <div>{t('game.pickupPrompt')} (1 - {pickupPrompt.max})</div>
              <div className="pickup-controls">
                <span>1</span>
                <input
                  type="range"
                  min={1}
                  max={pickupPrompt.max}
                  value={pickupCount}
                  onChange={(e) => onPickupCountChange(Number(e.target.value))}
                />
                <span>{pickupPrompt.max}</span>
              </div>
              <div style={{ fontWeight: 'bold', fontSize: '1.2rem'}}>{pickupCount}</div>
              <div className="hud-action-bar">
                <button className="hud-btn" onClick={onCancelPickup}>{t('game.cancel')}</button>
                <button className="hud-btn primary" onClick={onConfirmPickup}>{t('game.confirm')}</button>
              </div>
            </div>
          )}

          {!pickupPrompt && interactionStatus && interactionStatus.action !== 'none' && (
            <div className={`glass-panel hud-context-pill context-${interactionStatus.tone === 'error' ? 'danger' : 'info'}`}>
              <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><polyline points="12 16 16 12 12 8"></polyline><line x1="8" y1="12" x2="16" y2="12"></line></svg>
              {interactionStatus.message}
            </div>
          )}

          {interactionFeedback && !pickupPrompt && (
             <div className={`hud-toast toast-${interactionFeedback.tone === 'error' ? 'danger' : interactionFeedback.tone === 'success' ? 'success' : 'info'}`}>
               {interactionFeedback.message}
             </div>
          )}

          <div className="hud-action-bar" style={{ pointerEvents: 'auto' }}>
             <button className="hud-btn" onClick={() => setActiveModal('players')}>
               <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
               <span>{t('game.hudPlayers')}</span>
             </button>
             <button className="hud-btn" onClick={() => setActiveModal('log')}>
               <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
               <span>{t('game.hudFeed')}</span>
             </button>
          </div>
        </div>
      </div>

      <div className={`hud-modal-sheet ${activeModal === 'players' ? 'open' : ''}`}>
        <div className="hud-modal-header">
          <h3>{t('game.hudPlayers')}</h3>
          <button className="hud-modal-close" onClick={() => setActiveModal(null)}>×</button>
        </div>
        <div className="player-list">
          {sortedPlayers.map((player) => (
             <ScoreRow
               key={player.id}
               player={player}
               totalHexes={totalHexes}
               t={t}
             />
          ))}
        </div>
      </div>

      <div className={`hud-modal-sheet ${activeModal === 'log' ? 'open' : ''}`}>
        <div className="hud-modal-header">
          <h3>{t('game.hudActivityFeed')}</h3>
          <button className="hud-modal-close" onClick={() => setActiveModal(null)}>×</button>
        </div>
        <GameEventLog events={state.eventLog} />
      </div>

      <div className={`hud-modal-sheet ${activeModal === 'menu' ? 'open' : ''}`}>
        <div className="hud-modal-header">
          <h3>{t('game.hudMenu')}</h3>
          <button className="hud-modal-close" onClick={() => setActiveModal(null)}>×</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {debugToggle}
          <button className="btn-secondary" style={{width: '100%', color: 'var(--danger, #e74c3c)'}} onClick={onReturnToLobby}>
            {t('game.returnToLobby')}
          </button>
        </div>
      </div>
      {debugPanel}
    </div>
  );
}
