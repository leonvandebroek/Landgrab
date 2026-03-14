import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { GameState, HexCell, RandomEvent, Mission, PendingDuel } from '../../types/game';
import type { PlayerDisplayPreferences } from '../../types/playerPreferences';
import { hexKey } from '../map/HexMath';
import { useSound } from '../../hooks/useSound';
import { GameEventLog } from './GameEventLog';
import { GameRulesPage } from './GameRulesPage';
import { GuidanceBanner } from './GuidanceBanner';
import { HelpOverlay } from './HelpOverlay';
import { AbilityBar } from './AbilityBar';
import { PlayerDisplaySettings } from './PlayerDisplaySettings';
import { ScoreRow } from './PlayerPanel';
import { TileActionPanel } from './TileActionPanel';
import { ToastManager } from './ToastManager';
import type { GameToast } from '../../hooks/useToastQueue';
import { RadialActionMenu } from './RadialActionMenu';
import { MiniMap } from '../map/MiniMap';
import { getTileInteractionStatus } from './tileInteraction';
import type { MapInteractionFeedback, TileAction, TileActionType } from './tileInteraction';

interface PickupPrompt {
  q: number;
  r: number;
  max: number;
}

interface AttackPrompt {
  q: number;
  r: number;
  max: number;
  defenderTroops: number;
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
  tileActions?: TileAction[];
  onTileAction?: (actionType: TileActionType) => void;
  onDismissTileActions?: () => void;
  attackPrompt: AttackPrompt | null;
  attackCount: number;
  onAttackCountChange: (count: number) => void;
  onConfirmAttack: () => void;
  onCancelAttack: () => void;
  randomEvent?: RandomEvent | null;
  eventWarning?: RandomEvent | null;
  isRushHour?: boolean;
  missionNotification?: { mission: Mission; type: 'assigned' | 'completed' | 'failed' } | null;
  pendingDuel?: PendingDuel | null;
  onAcceptDuel?: (duelId: string) => void;
  onDeclineDuel?: (duelId: string) => void;
  onDetainPlayer?: (targetPlayerId: string) => void;
  onActivateBeacon?: () => void;
  onDeactivateBeacon?: () => void;
  onActivateStealth?: () => void;
  commandoTargetingMode?: boolean;
  onStartCommandoTargeting?: () => void;
  onCancelCommandoTargeting?: () => void;
  playerDisplayPrefs: PlayerDisplayPreferences;
  onPlayerDisplayPrefsChange: (prefs: PlayerDisplayPreferences) => void;
  playerColor: string;
  currentPlayerName: string;
  selectedHexKey: string | null;
  carriedTroops: number;
  isInOwnHex: boolean;
  hasLocation: boolean;
  hostMessage?: { message: string; fromHost: boolean } | null;
  isPaused?: boolean;
  isHost?: boolean;
  onSetObserverMode?: (enabled: boolean) => void;
  debugToggle?: React.ReactNode;
  debugPanel?: React.ReactNode;
  children?: React.ReactNode;
  toasts?: GameToast[];
  onDismissToast?: (id: string) => void;
  mainMapBounds?: { north: number; south: number; east: number; west: number } | null;
  selectedHexScreenPos?: { x: number; y: number } | null;
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
  tileActions,
  onTileAction,
  onDismissTileActions,
  attackPrompt,
  attackCount,
  onAttackCountChange,
  onConfirmAttack,
  onCancelAttack,
  randomEvent,
  eventWarning,
  isRushHour,
  missionNotification,
  pendingDuel,
  onAcceptDuel,
  onDeclineDuel,
  onActivateBeacon,
  onDeactivateBeacon,
  onActivateStealth,
  commandoTargetingMode,
  onStartCommandoTargeting,
  onCancelCommandoTargeting,
  playerDisplayPrefs,
  onPlayerDisplayPrefsChange,
  playerColor,
  currentPlayerName,
  selectedHexKey,
  carriedTroops,
  isInOwnHex,
  hasLocation,
  hostMessage,
  isPaused,
  isHost,
  onSetObserverMode,
  debugToggle,
  debugPanel,
  children,
  toasts,
  onDismissToast,
  mainMapBounds,
  selectedHexScreenPos
}: Props) {
  const { t } = useTranslation();
  const { soundEnabled, toggleSound } = useSound();
  const [activeModal, setActiveModal] = useState<'players' | 'log' | 'menu' | 'missions' | 'help' | 'rules' | 'displaySettings' | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);

  const isTimedGame = state.winConditionType === 'TimedGame' && !!state.gameStartedAt && !!state.gameDurationMinutes;

  // Game countdown timer for TimedGame win condition
  useEffect(() => {
    if (!isTimedGame) return;

    const endTime = new Date(state.gameStartedAt!).getTime() + state.gameDurationMinutes! * 60 * 1000;

    const tick = () => {
      const remaining = Math.max(0, endTime - Date.now());
      setTimeRemaining(remaining);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [isTimedGame, state.gameStartedAt, state.gameDurationMinutes]);

  // Derive displayed time — null when not a timed game
  const displayTimeRemaining = isTimedGame ? timeRemaining : null;

  const me = state.players.find((p) => p.id === myUserId);

  const myMissions = useMemo(() => {
    if (!state.missions) return [];
    return state.missions.filter(m => m.status === 'Active' || m.status === 'Completed');
  }, [state.missions]);

  const activeMissionCount = myMissions.filter(m => m.status === 'Active').length;

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

  // Resolve the target cell for TileActionPanel from selectedHex
  const selectedCell: HexCell | undefined = selectedHex
    ? state.grid[hexKey(selectedHex[0], selectedHex[1])] ?? undefined
    : undefined;

  const showTileActions = Boolean(
    tileActions && tileActions.length > 0 && !pickupPrompt && !attackPrompt && onTileAction && onDismissTileActions
  );

  const localizeMissionText = (key: string | undefined, defaultValue: string) => {
    if (!key) {
      return defaultValue;
    }

    const translated = String(t(key as never, { defaultValue }));
    return translated.includes('{{') && translated.includes('}}') ? defaultValue : translated;
  };

  const getMissionTitle = (mission: Mission) => localizeMissionText(
    mission.titleKey ? `missions.title.${mission.titleKey}` : undefined,
    mission.title
  );

  const getMissionDescription = (mission: Mission) => localizeMissionText(
    mission.descriptionKey || mission.titleKey
      ? `missions.desc.${mission.descriptionKey || mission.titleKey}`
      : undefined,
    mission.description
  );

  const getMissionReward = (mission: Mission) => localizeMissionText(
    mission.rewardKey ? `missions.reward.${mission.rewardKey}` : undefined,
    mission.reward
  );

  const getMissionScope = (mission: Mission) => t(`missions.scope.${mission.scope}` as never, { defaultValue: mission.scope });
  const getMissionStatus = (mission: Mission) => t(`missions.status.${mission.status}` as never, { defaultValue: mission.status });

  return (
    <div className="game-layout hud-active">
      <div className="top-status-bar">
        {locationError && <div className="top-warning-bar">📍 {locationError}</div>}
        {error && <div className="top-warning-bar">⚠️ {error}</div>}
        {eventWarning && (
          <div className="top-warning-bar event-warning">
            ⚠️ {t('phase8.eventWarning' as never, { type: t(`phase8.eventType.${eventWarning.type}` as never) })}
          </div>
        )}
        {randomEvent && (
          <div className="top-warning-bar random-event">
            🎲 {t(`phase8.eventType.${randomEvent.type}` as never)} — {randomEvent.description}
          </div>
        )}
        {isPaused && (
          <div className="top-warning-bar event-warning">
            ⏸ {t('observer.gamePaused' as never)}
          </div>
        )}
        {hostMessage && (
          <div className="top-warning-bar host-message-banner">
            📢 {hostMessage.message}
          </div>
        )}
        {me?.heldByPlayerId && (
          <div className="top-warning-bar">
            🔒 {t('phase10.detained' as never)}
          </div>
        )}
        
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
            {displayTimeRemaining !== null && (
              <div className="stat-item">
                <span className={`stat-value ${displayTimeRemaining < 60000 ? 'danger' : displayTimeRemaining < 300000 ? 'warning' : 'primary'}`}>
                  {formatTimeRemaining(displayTimeRemaining)}
                </span>
                <span className="stat-label">{t('game.hudTimer')}</span>
              </div>
            )}
            {isRushHour && (
              <div className="stat-item">
                <span className="stat-value warning">⚡</span>
                <span className="stat-label">{t('phase8.rushHour' as never)}</span>
              </div>
            )}
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

        <GuidanceBanner
          gameState={state}
          selectedHexKey={selectedHexKey}
          carriedTroops={carriedTroops}
          isInOwnHex={isInOwnHex}
          hasLocation={hasLocation}
        />

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
                  aria-label={t('game.pickupPrompt')}
                  title={t('game.pickupPrompt')}
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

          {attackPrompt && (
            <div className="glass-panel hud-context-pill context-info" style={{ flexDirection: 'column', width: '100%', pointerEvents: 'auto' }}>
              <div>{t('game.tileAction.defenderTroops', { count: attackPrompt.defenderTroops })}</div>
              <div className="pickup-controls">
                <span>{attackPrompt.defenderTroops + 1}</span>
                <input
                  type="range"
                  min={attackPrompt.defenderTroops + 1}
                  max={attackPrompt.max}
                  value={attackCount}
                  aria-label={t('game.tileAction.attackPrompt')}
                  title={t('game.tileAction.attackPrompt')}
                  onChange={(e) => onAttackCountChange(Number(e.target.value))}
                />
                <span>{attackPrompt.max}</span>
              </div>
              <div style={{ fontWeight: 'bold', fontSize: '1.2rem' }}>
                {t('game.tileAction.deployCount', { count: attackCount })}
              </div>
              <div className="hud-action-bar">
                <button className="hud-btn" onClick={onCancelAttack}>{t('game.cancel')}</button>
                <button className="hud-btn primary" onClick={onConfirmAttack}>{t('game.confirm')}</button>
              </div>
            </div>
          )}

          {showTileActions && selectedHex && selectedHexScreenPos && (
            <RadialActionMenu
              actions={tileActions!}
              onAction={onTileAction!}
              onDismiss={onDismissTileActions!}
              position={selectedHexScreenPos}
              targetCell={selectedCell}
              player={me ?? null}
            />
          )}
          {showTileActions && selectedHex && !selectedHexScreenPos && (
            <TileActionPanel
              actions={tileActions!}
              targetCell={selectedCell}
              targetHex={selectedHex}
              player={me ?? null}
              onAction={onTileAction!}
              onDismiss={onDismissTileActions!}
            />
          )}

          {!pickupPrompt && !attackPrompt && !showTileActions && interactionStatus && interactionStatus.action !== 'none' && (
            <div className={`glass-panel hud-context-pill context-${interactionStatus.tone === 'error' ? 'danger' : 'info'}`}>
              <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><polyline points="12 16 16 12 12 8"></polyline><line x1="8" y1="12" x2="16" y2="12"></line></svg>
              {interactionStatus.message}
            </div>
          )}

          {interactionFeedback && !pickupPrompt && !attackPrompt && (
             <div className={`hud-toast toast-${interactionFeedback.tone === 'error' ? 'danger' : interactionFeedback.tone === 'success' ? 'success' : 'info'}`}>
               {interactionFeedback.message}
             </div>
          )}

          {missionNotification && (
            <div className={`hud-toast toast-${missionNotification.type === 'completed' ? 'success' : missionNotification.type === 'failed' ? 'danger' : 'info'}`}>
              {missionNotification.type === 'assigned' && `📋 ${t('phase9.missionAssigned' as never)}: ${getMissionTitle(missionNotification.mission)}`}
              {missionNotification.type === 'completed' && `✅ ${t('phase9.missionCompleted' as never)}: ${getMissionTitle(missionNotification.mission)}`}
              {missionNotification.type === 'failed' && `❌ ${t('phase9.missionFailed' as never)}: ${getMissionTitle(missionNotification.mission)}`}
            </div>
          )}

          {toasts && onDismissToast && (
            <ToastManager toasts={toasts} onDismiss={onDismissToast} />
          )}

          {me && state.dynamics && (
            <AbilityBar
              player={me}
              dynamics={state.dynamics}
              onActivateBeacon={onActivateBeacon ?? (() => {})}
              onDeactivateBeacon={onDeactivateBeacon ?? (() => {})}
              onActivateStealth={onActivateStealth ?? (() => {})}
              commandoTargetingMode={commandoTargetingMode ?? false}
              onStartCommandoTargeting={onStartCommandoTargeting ?? (() => {})}
              onCancelCommandoTargeting={onCancelCommandoTargeting ?? (() => {})}
            />
          )}

          <div className="hud-action-bar" style={{ pointerEvents: 'auto' }}>
             <button className="hud-btn" onClick={() => setActiveModal('players')}>
               <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
               <span>{t('game.hudPlayers')}</span>
             </button>
             {state.dynamics?.missionSystemEnabled && (
               <button className="hud-btn" onClick={() => setActiveModal('missions')}>
                 <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                 <span>{t('phase9.missions' as never)}{activeMissionCount > 0 ? ` (${activeMissionCount})` : ''}</span>
               </button>
             )}
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
          <button className="btn-secondary" style={{ width: '100%' }} onClick={toggleSound}>
            {soundEnabled ? '🔊' : '🔇'} {t('game.soundToggle')}
          </button>
          <button className="btn-secondary" style={{ width: '100%' }} onClick={() => setActiveModal('help')}>
            ❓ {t('guidance.helpTitle')}
          </button>
          <button className="btn-secondary" style={{ width: '100%' }} onClick={() => setActiveModal('rules')}>
            📖 {t('rules.title')}
          </button>
          <button className="btn-secondary" style={{ width: '100%' }} onClick={() => setActiveModal('displaySettings')}>
            ⚙️ {t('settings.display.title')}
          </button>
          {isHost && onSetObserverMode && (
            <button className="btn-secondary" style={{ width: '100%' }} onClick={() => onSetObserverMode(true)}>
              🔭 {t('observer.switchToObserver' as never)}
            </button>
          )}
          {debugToggle}
          <button className="btn-secondary" style={{width: '100%', color: 'var(--danger, #e74c3c)'}} onClick={onReturnToLobby}>
            {t('game.returnToLobby')}
          </button>
        </div>
      </div>

      <div className={`hud-modal-sheet ${activeModal === 'missions' ? 'open' : ''}`}>
        <div className="hud-modal-header">
          <h3>{t('phase9.missions' as never)}</h3>
          <button className="hud-modal-close" onClick={() => setActiveModal(null)}>×</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '0.5rem' }}>
          {myMissions.length === 0 ? (
            <div style={{ textAlign: 'center', opacity: 0.6, padding: '1rem' }}>
              {t('phase9.noMissions' as never)}
            </div>
          ) : (
            myMissions.map(mission => (
              <div key={mission.id} className="glass-panel" style={{ padding: '0.75rem', opacity: mission.status === 'Completed' ? 0.6 : 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                  <strong>{getMissionTitle(mission)}</strong>
                  <span style={{ fontSize: '0.75rem', opacity: 0.7 }}>
                    {mission.scope === 'Personal' ? '👤' : mission.scope === 'Team' ? '👥' : '🌍'} {getMissionScope(mission)}
                  </span>
                </div>
                <div style={{ fontSize: '0.85rem', opacity: 0.8, marginBottom: '0.5rem' }}>{getMissionDescription(mission)}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', fontSize: '0.75rem', opacity: 0.7, marginBottom: '0.5rem' }}>
                  <span>{getMissionScope(mission)}</span>
                  <span>{getMissionStatus(mission)}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <div style={{ flex: 1, height: '6px', background: 'rgba(255,255,255,0.15)', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ width: `${Math.min(100, mission.progress * 100)}%`, height: '100%', background: mission.status === 'Completed' ? '#2ecc71' : '#3498db', borderRadius: '3px', transition: 'width 0.3s' }} />
                  </div>
                  <span style={{ fontSize: '0.75rem', minWidth: '2.5rem', textAlign: 'right' }}>
                    {mission.status === 'Completed' ? '✅' : `${Math.round(mission.progress * 100)}%`}
                  </span>
                </div>
                {mission.reward && (
                  <div style={{ fontSize: '0.75rem', opacity: 0.6, marginTop: '0.25rem' }}>
                    🎁 {getMissionReward(mission)}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
      {activeModal === 'help' && (
        <HelpOverlay dynamics={state.dynamics} onClose={() => setActiveModal(null)} />
      )}

      {activeModal === 'rules' && (
        <GameRulesPage gameState={state} onContinue={() => setActiveModal(null)} isModal={true} />
      )}

      {activeModal === 'displaySettings' && (
        <div className="hud-modal-sheet open">
          <div className="hud-modal-header">
            <h3>{t('settings.display.title')}</h3>
            <button className="hud-modal-close" onClick={() => setActiveModal(null)}>×</button>
          </div>
          <div className="hud-modal-content">
            <PlayerDisplaySettings
              prefs={playerDisplayPrefs}
              onPrefsChange={onPlayerDisplayPrefsChange}
              playerColor={playerColor}
              playerName={currentPlayerName}
            />
          </div>
        </div>
      )}
      {pendingDuel && onAcceptDuel && onDeclineDuel && (
        <div className="hud-modal-sheet open">
          <div className="hud-modal-header">
            <h3>⚔️ {t('phase10.duelChallenge' as never)}</h3>
          </div>
          <div style={{ padding: '1rem', textAlign: 'center' }}>
            <p>{t('phase10.duelDescription' as never)}</p>
            <p style={{ fontSize: '0.85rem', opacity: 0.7 }}>
              {t('phase10.duelLocation' as never, { q: pendingDuel.tileQ, r: pendingDuel.tileR })}
            </p>
            <div className="hud-action-bar" style={{ marginTop: '1rem', justifyContent: 'center' }}>
              <button className="hud-btn" onClick={() => onDeclineDuel(pendingDuel.id)}>
                {t('phase10.declineDuel' as never)}
              </button>
              <button className="hud-btn primary" onClick={() => onAcceptDuel(pendingDuel.id)}>
                {t('phase10.acceptDuel' as never)}
              </button>
            </div>
          </div>
        </div>
      )}
      {debugPanel}
      {mainMapBounds !== undefined && state.mapLat != null && state.mapLng != null && (
        <MiniMap
          grid={state.grid}
          myUserId={myUserId}
          alliances={state.alliances}
          mapLat={state.mapLat}
          mapLng={state.mapLng}
          tileSizeMeters={state.tileSizeMeters}
          mainMapBounds={mainMapBounds ?? null}
        />
      )}
    </div>
  );
}

function formatTimeRemaining(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}
