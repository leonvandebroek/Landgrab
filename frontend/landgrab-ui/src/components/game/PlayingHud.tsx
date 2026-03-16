import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { HexCell } from '../../types/game';
import type { PlayerDisplayPreferences } from '../../types/playerPreferences';
import { hexKey } from '../map/HexMath';
import { useSound } from '../../hooks/useSound';
import { useGameStore } from '../../stores/gameStore';
import { useGameplayStore } from '../../stores/gameplayStore';
import { useNotificationStore } from '../../stores/notificationStore';
import { useUiStore } from '../../stores/uiStore';
import { GameEventLog } from './GameEventLog';
import { GameRulesPage } from './GameRulesPage';
import { GuidanceBanner } from './GuidanceBanner';
import { HelpOverlay } from './HelpOverlay';
import { PlayerDisplaySettings } from './PlayerDisplaySettings';
import { ScoreRow } from './PlayerPanel';
import { TileInfoCard } from './TileInfoCard';
import { ToastManager } from './ToastManager';
import type { GameToast } from '../../hooks/useToastQueue';
import { PlayerHUD } from './PlayerHUD';
import { MiniMap } from '../map/MiniMap';
import { getTileInteractionStatus } from './tileInteraction';
import type { TileAction, TileActionType } from './tileInteraction';

interface Props {
  myUserId: string;
  currentHex: [number, number] | null;
  onConfirmPickup: () => void;
  onConfirmReinforce: () => Promise<void>;
  onReturnToLobby: () => void;
  locationError: string | null;
  isHostBypass?: boolean;
  currentHexActions?: TileAction[];
  onCurrentHexAction?: (actionType: TileActionType) => void;
  onDismissTileActions?: () => void;
  onConfirmAttack: () => void;
  onActivateBeacon?: () => void;
  onDeactivateBeacon?: () => void;
  playerDisplayPrefs: PlayerDisplayPreferences;
  onPlayerDisplayPrefsChange: (prefs: PlayerDisplayPreferences) => void;
  currentPlayerName: string;
  hasLocation: boolean;
  onSetObserverMode?: (enabled: boolean) => void;
  debugToggle?: React.ReactNode;
  debugPanel?: React.ReactNode;
  children?: React.ReactNode;
  toasts?: GameToast[];
  onDismissToast?: (id: string) => void;
  onNavigateMap?: (lat: number, lng: number) => void;
}

export function PlayingHud({
  myUserId,
  currentHex,
  onConfirmPickup,
  onConfirmReinforce,
  onReturnToLobby,
  locationError,
  isHostBypass,
  currentHexActions,
  onCurrentHexAction,
  onDismissTileActions,
  onConfirmAttack,
  onActivateBeacon,
  onDeactivateBeacon,
  playerDisplayPrefs,
  onPlayerDisplayPrefsChange,
  currentPlayerName,
  hasLocation,
  onSetObserverMode,
  debugToggle,
  debugPanel,
  children,
  toasts,
  onDismissToast,
  onNavigateMap,
}: Props) {
  const { t } = useTranslation();
  const { soundEnabled, toggleSound } = useSound();
  const state = useGameStore((store) => store.gameState);
  const selectedHex = useGameplayStore((store) => store.selectedHex);
  const interactionFeedback = useGameplayStore((store) => store.mapFeedback);
  const pickupPrompt = useGameplayStore((store) => store.pickupPrompt);
  const pickupCount = useGameplayStore((store) => store.pickupCount);
  const reinforcePrompt = useGameplayStore((store) => store.reinforcePrompt);
  const reinforceCount = useGameplayStore((store) => store.reinforceCount);
  const attackPrompt = useGameplayStore((store) => store.attackPrompt);
  const attackCount = useGameplayStore((store) => store.attackCount);
  const setPickupPrompt = useGameplayStore((store) => store.setPickupPrompt);
  const setPickupCount = useGameplayStore((store) => store.setPickupCount);
  const setReinforcePrompt = useGameplayStore((store) => store.setReinforcePrompt);
  const setReinforceCount = useGameplayStore((store) => store.setReinforceCount);
  const setAttackCount = useGameplayStore((store) => store.setAttackCount);
  const setAttackPrompt = useGameplayStore((store) => store.setAttackPrompt);
  const hostMessage = useNotificationStore((store) => store.hostMessage);
  const error = useUiStore((store) => store.error);
  const mainMapBounds = useUiStore((store) => store.mainMapBounds);
  const [activeModal, setActiveModal] = useState<'players' | 'log' | 'menu' | 'help' | 'rules' | 'displaySettings' | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);

  const layoutRef = useRef<HTMLDivElement>(null);

  const isTimedGame = state?.winConditionType === 'TimedGame' && !!state.gameStartedAt && !!state.gameDurationMinutes;

  useEffect(() => {
    const layout = layoutRef.current;
    if (!layout) return;

    const hud = layout.querySelector('.player-hud') as HTMLElement | null;
    if (!hud) return;

    const observer = new ResizeObserver(([entry]) => {
      layout.style.setProperty('--player-hud-h', `${Math.ceil(entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height)}px`);
    });

    observer.observe(hud);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!state || !isTimedGame) return;

    const endTime = new Date(state.gameStartedAt!).getTime() + state.gameDurationMinutes! * 60 * 1000;
    const tick = () => {
      const remaining = Math.max(0, endTime - Date.now());
      setTimeRemaining(remaining);
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [isTimedGame, state]);

  const displayTimeRemaining = isTimedGame ? timeRemaining : null;
  const me = state?.players.find((player) => player.id === myUserId);

  const currentHexCell: HexCell | undefined = useMemo(() => {
    if (!state || !currentHex) {
      return undefined;
    }

    return state.grid[hexKey(currentHex[0], currentHex[1])] ?? undefined;
  }, [currentHex, state]);

  const playerColor = me?.allianceColor ?? me?.color ?? '#4f8cff';
  const carriedTroops = me?.carriedTroops ?? 0;
  const isInOwnHex = Boolean(currentHexCell && me && currentHexCell.ownerId === me.id);
  const isHost = Boolean(me?.isHost);

  const myTileTroops = useMemo(() => {
    if (!state || !me) return 0;

    return Object.values(state.grid).reduce((sum, cell) => {
      return cell.ownerId === me.id ? sum + cell.troops : sum;
    }, 0);
  }, [state, me]);

  const myTotalTroops = myTileTroops + carriedTroops;

  const sortedPlayers = useMemo(() => {
    if (!state) {
      return [];
    }

    return [...state.players].sort((a, b) => {
      if (a.isWinner !== b.isWinner) return a.isWinner ? -1 : 1;
      return b.territoryCount - a.territoryCount;
    });
  }, [state]);

  const totalHexes = useMemo(() => Object.keys(state?.grid ?? {}).length, [state]);

  const interactionStatus = useMemo(() => {
    if (!state || pickupPrompt || reinforcePrompt) return null;

    const targetCell = selectedHex
      ? state.grid[hexKey(selectedHex[0], selectedHex[1])] ?? undefined
      : undefined;

    return getTileInteractionStatus({
      state,
      player: me ?? null,
      targetHex: selectedHex,
      targetCell,
      currentHex,
      t,
    });
  }, [currentHex, me, pickupPrompt, reinforcePrompt, selectedHex, state, t]);

  const selectedCell: HexCell | undefined = state && selectedHex
    ? state.grid[hexKey(selectedHex[0], selectedHex[1])] ?? undefined
    : undefined;

  const showRemoteTileInfoCard = Boolean(
    selectedHex
      && !(currentHex && selectedHex[0] === currentHex[0] && selectedHex[1] === currentHex[1])
      && onDismissTileActions,
  );

  if (!state) {
    return null;
  }

  return (
    <div className="game-layout hud-active" ref={layoutRef}>
      <div className="top-status-bar">
        {locationError && !isHostBypass && <div className="top-warning-bar">📍 {locationError}</div>}
        {error && <div className="top-warning-bar">⚠️ {error}</div>}
        {state.isPaused && (
          <div className="top-warning-bar event-warning">
            ⏸ {t('observer.gamePaused' as never)}
          </div>
        )}
        {hostMessage && (
          <div className="top-warning-bar host-message-banner">
            📢 {hostMessage.message}
          </div>
        )}

        <div className="top-stats-row">
          <div className="hud-stats-flat">
            {currentPlayerName && (
              <div className="stat-item">
                <span
                  className="stat-value primary"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', maxWidth: '12rem' }}
                >
                  {me?.emoji && <span aria-hidden="true" style={{ lineHeight: 1 }}>{me.emoji}</span>}
                  <span
                    style={{
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {currentPlayerName}
                  </span>
                </span>
                <span className="stat-label">{t('game.you' as never, { defaultValue: 'You' })}</span>
              </div>
            )}
            <div className="stat-item">
              <span className="stat-value primary">{me?.territoryCount || 0}</span>
              <span className="stat-label">{t('game.hudLands')}</span>
            </div>
            <div className="stat-item">
              <span className="stat-value secondary stat-value-with-detail">
                <span>{myTotalTroops}</span>
                {carriedTroops > 0 && (
                  <span className="stat-value-detail" aria-label={t('game.carriedTroops')}>
                    (+{carriedTroops}🎒)
                  </span>
                )}
              </span>
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
            {state.isRushHour && (
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
                  onChange={(event) => setPickupCount(Number(event.target.value))}
                />
                <span>{pickupPrompt.max}</span>
              </div>
              <div style={{ fontWeight: 'bold', fontSize: '1.2rem' }}>{pickupCount}</div>
              <div className="hud-action-bar">
                <button className="hud-btn" onClick={() => setPickupPrompt(null)}>{t('game.cancel')}</button>
                <button className="hud-btn primary" onClick={onConfirmPickup}>{t('game.confirm')}</button>
              </div>
            </div>
          )}

          {reinforcePrompt && (
            <div className="glass-panel hud-context-pill context-info" style={{ flexDirection: 'column', width: '100%', pointerEvents: 'auto' }}>
              <div>{t('game.reinforcePrompt')} (1 - {reinforcePrompt.max})</div>
              <div className="pickup-controls">
                <span>1</span>
                <input
                  type="range"
                  min={1}
                  max={reinforcePrompt.max}
                  value={reinforceCount}
                  aria-label={t('game.reinforcePrompt')}
                  title={t('game.reinforcePrompt')}
                  onChange={(event) => setReinforceCount(Number(event.target.value))}
                />
                <span>{reinforcePrompt.max}</span>
              </div>
              <div style={{ fontWeight: 'bold', fontSize: '1.2rem' }}>{reinforceCount}</div>
              <div className="hud-action-bar">
                <button className="hud-btn" onClick={() => setReinforcePrompt(null)}>{t('game.cancel')}</button>
                <button className="hud-btn primary" onClick={() => void onConfirmReinforce()}>{t('game.confirm')}</button>
              </div>
            </div>
          )}

          {attackPrompt && (
            <div className="glass-panel hud-context-pill context-info" style={{ flexDirection: 'column', width: '100%', pointerEvents: 'auto' }}>
              <div>{t('game.tileAction.defenderTroops', { count: attackPrompt.defenderTroops })}</div>
              <div>{t('game.tileAction.attackMinimumExplanation', { count: attackPrompt.defenderTroops })}</div>
              <div className="pickup-controls">
                <span>{attackPrompt.defenderTroops + 1}</span>
                <input
                  type="range"
                  min={attackPrompt.defenderTroops + 1}
                  max={attackPrompt.max}
                  value={attackCount}
                  aria-label={t('game.tileAction.attackPrompt')}
                  title={t('game.tileAction.attackPrompt')}
                  onChange={(event) => setAttackCount(Number(event.target.value))}
                />
                <span>{attackPrompt.max}</span>
              </div>
              <div style={{ fontWeight: 'bold', fontSize: '1.2rem' }}>
                {t('game.tileAction.deployCount', { count: attackCount })}
              </div>
              <div className="hud-action-bar">
                <button className="hud-btn" onClick={() => setAttackPrompt(null)}>{t('game.cancel')}</button>
                <button className="hud-btn primary" onClick={onConfirmAttack}>{t('game.confirm')}</button>
              </div>
            </div>
          )}

          {showRemoteTileInfoCard && selectedHex && (
            <TileInfoCard
              targetCell={selectedCell}
              targetHex={selectedHex}
              onDismiss={onDismissTileActions!}
            />
          )}

          {!pickupPrompt && !reinforcePrompt && !attackPrompt && !showRemoteTileInfoCard && interactionStatus && interactionStatus.action !== 'none' && (
            <div className={`glass-panel hud-context-pill context-${interactionStatus.tone === 'error' ? 'danger' : 'info'}`}>
              <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><polyline points="12 16 16 12 12 8"></polyline><line x1="8" y1="12" x2="16" y2="12"></line></svg>
              {interactionStatus.message}
            </div>
          )}

          {interactionFeedback && !pickupPrompt && !reinforcePrompt && !attackPrompt && (
            <div className={`hud-toast toast-${interactionFeedback.tone === 'error' ? 'danger' : interactionFeedback.tone === 'success' ? 'success' : 'info'}`}>
              {interactionFeedback.message}
            </div>
          )}

          {toasts && onDismissToast && (
            <ToastManager toasts={toasts} onDismiss={onDismissToast} />
          )}
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
        <GameEventLog events={state.eventLog} players={state.players} />
      </div>

      <div className={`hud-modal-sheet ${activeModal === 'menu' ? 'open' : ''}`}>
        <div className="hud-modal-header">
          <h3>{t('game.hudMenu')}</h3>
          <button className="hud-modal-close" onClick={() => setActiveModal(null)}>×</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <button className="btn-secondary" style={{ width: '100%' }} onClick={() => setActiveModal('players')}>
            👥 {t('game.hudPlayers')}
          </button>
          <button className="btn-secondary" style={{ width: '100%' }} onClick={() => setActiveModal('log')}>
            📜 {t('game.hudFeed')}
          </button>
          <div className="menu-nav-separator" />
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <button className="btn-secondary" style={{ width: '100%' }} onClick={() => onSetObserverMode(true)}>
                🔭 {t('observer.switchToObserver' as never)}
              </button>
              <span className="hint" style={{ fontSize: '0.75rem', textAlign: 'center', paddingInline: '0.25rem' }}>
                {t('observer.switchToObserverDesc' as never)}
              </span>
            </div>
          )}
          {debugToggle}
          <button className="btn-secondary" style={{ width: '100%', color: 'var(--danger, #e74c3c)' }} onClick={onReturnToLobby}>
            {t('game.returnToLobby')}
          </button>
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

      {debugPanel}

      <PlayerHUD
        actions={currentHexActions ?? []}
        onAction={onCurrentHexAction ?? (() => {})}
        currentHex={currentHex}
        targetCell={currentHexCell}
        carriedTroops={carriedTroops}
        playerColor={playerColor}
        hasLocation={hasLocation}
        myUserId={myUserId}
        myAllianceId={me?.allianceId ?? undefined}
        player={me}
        dynamics={state.dynamics}
        onActivateBeacon={onActivateBeacon ?? (() => {})}
        onDeactivateBeacon={onDeactivateBeacon ?? (() => {})}
      />

      {mainMapBounds !== undefined && state.mapLat != null && state.mapLng != null && (
        <MiniMap
          grid={state.grid}
          myUserId={myUserId}
          alliances={state.alliances}
          mapLat={state.mapLat}
          mapLng={state.mapLng}
          tileSizeMeters={state.tileSizeMeters}
          mainMapBounds={mainMapBounds ?? null}
          onNavigate={onNavigateMap}
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
