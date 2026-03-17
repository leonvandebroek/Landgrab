import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { useSecondTick } from '../../hooks/useSecondTick';

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
  onActivateTacticalStrike?: () => void;
  onActivateReinforce?: () => void;
  onActivateShieldWall?: () => void;
  onActivateEmergencyRepair?: () => void;
  onStartDemolish?: () => void;
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
  onActivateTacticalStrike,
  onActivateReinforce,
  onActivateShieldWall,
  onActivateEmergencyRepair,
  onStartDemolish,
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
  const [showReturnConfirm, setShowReturnConfirm] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [currentTime, setCurrentTime] = useState(() => Date.now());

  const layoutRef = useRef<HTMLDivElement>(null);

  const isTimedGame = state?.winConditionType === 'TimedGame' && !!state.gameStartedAt && !!state.gameDurationMinutes;
  const me = state?.players.find((player) => player.id === myUserId);
  const myAlliance = state?.alliances?.find((alliance) => alliance.id === me?.allianceId);
  const needsClock = Boolean(
    state
    && (
      isTimedGame
      || state.dynamics?.timedEscalationEnabled
      || (state.dynamics?.underdogPactEnabled && myAlliance?.underdogBoostUntil)
    )
  );

  useEffect(() => {
    const layout = layoutRef.current;
    if (!layout) return;

    const hud = layout.querySelector('.player-hud') as HTMLElement | null;
    if (!hud) {
      layout.style.removeProperty('--player-hud-h');
      return;
    }

    const syncHudHeight = (height: number) => {
      layout.style.setProperty('--player-hud-h', `${Math.ceil(height)}px`);
    };

    syncHudHeight(hud.getBoundingClientRect().height);

    const observer = new ResizeObserver(([entry]) => {
      syncHudHeight(entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height);
    });

    observer.observe(hud);
    return () => {
      observer.disconnect();
      layout.style.removeProperty('--player-hud-h');
    };
  }, []);

  useEffect(() => {
    if (activeModal !== 'menu') {
      setShowReturnConfirm(false);
    }
  }, [activeModal]);

  const tick = useCallback(() => {
    if (!state) {
      setTimeRemaining(null);
      return;
    }

    const now = Date.now();
    setCurrentTime(now);

    if (isTimedGame && state.gameStartedAt && state.gameDurationMinutes) {
      const endTime = new Date(state.gameStartedAt).getTime() + state.gameDurationMinutes * 60 * 1000;
      setTimeRemaining(Math.max(0, endTime - now));
      return;
    }

    setTimeRemaining(null);
  }, [isTimedGame, state]);

  useEffect(() => {
    if (!needsClock) {
      setCurrentTime(Date.now());
      setTimeRemaining(null);
      return;
    }

    tick();
  }, [needsClock, tick]);

  useSecondTick(() => {
    if (!needsClock) {
      return;
    }

    tick();
  });

  const displayTimeRemaining = isTimedGame ? timeRemaining : null;

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

  const allianceTileTroops = useMemo(() => {
    if (!state || !me) return 0;
    const allianceId = me.allianceId;

    if (allianceId) {
      return Object.values(state.grid).reduce((sum, cell) => {
        return cell.ownerAllianceId === allianceId ? sum + cell.troops : sum;
      }, 0);
    }

    return Object.values(state.grid).reduce((sum, cell) => {
      return cell.ownerId === me.id ? sum + cell.troops : sum;
    }, 0);
  }, [state, me]);

  const allianceCarriedTroops = useMemo(() => {
    if (!state || !me?.allianceId) return carriedTroops;
    return state.players
      .filter((player) => player.allianceId === me.allianceId)
      .reduce((sum, player) => sum + (player.carriedTroops ?? 0), 0);
  }, [state, me?.allianceId, carriedTroops]);

  const allianceTotalTroops = allianceTileTroops + allianceCarriedTroops;

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
  const escalationLevel = useMemo(() => {
    if (!state?.dynamics?.timedEscalationEnabled || !state.gameStartedAt) {
      return 0;
    }

    return Math.floor((currentTime - new Date(state.gameStartedAt).getTime()) / (30 * 60000));
  }, [currentTime, state?.dynamics?.timedEscalationEnabled, state?.gameStartedAt]);
  const underdogBoostActive = Boolean(
    state?.dynamics?.underdogPactEnabled
    && myAlliance?.underdogBoostUntil
    && new Date(myAlliance.underdogBoostUntil).getTime() > currentTime,
  );

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
    <div className="game-layout hud-active playing-hud-layout" ref={layoutRef}>
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
            {me?.role && me.role !== 'None' && state.dynamics?.playerRolesEnabled && (
              <div className="stat-item">
                <span className="stat-value secondary" style={{ fontSize: '0.8rem' }}>
                  {t(`roles.${me.role}.title` as never, { defaultValue: t(`phase4.role${me.role}` as never) })}
                </span>
                <span className="stat-label">{t('game.hudYourRole' as never)}</span>
              </div>
            )}
            <div className="stat-item">
              <span className="stat-value primary">{myAlliance?.territoryCount ?? me?.territoryCount ?? 0}</span>
              <span className="stat-label">{t('game.hudLands')}</span>
            </div>
            <div className="stat-item">
              <span className="stat-value secondary stat-value-with-detail">
                <span>{allianceTotalTroops}</span>
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
            {state.dynamics?.timedEscalationEnabled && state.gameStartedAt && (
              <div className="stat-item">
                <span className="stat-value warning">
                  ⚡ {escalationLevel}
                </span>
                <span className="stat-label">{t('game.escalationLevel' as never)}</span>
              </div>
            )}
            {underdogBoostActive && (
              <div className="stat-item">
                <span className="stat-value" style={{ color: '#2ecc71' }}>💪</span>
                <span className="stat-label">{t('game.underdogActive' as never)}</span>
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

      <div className="map-area-wrapper map-area-wrapper--with-player-hud">
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
                  data-testid="pickup-count-slider"
                  min={1}
                  max={pickupPrompt.max}
                  value={pickupCount}
                  aria-label={t('game.pickupPrompt')}
                  title={t('game.pickupPrompt')}
                  onChange={(event) => setPickupCount(Number(event.target.value))}
                />
                <span>{pickupPrompt.max}</span>
              </div>
              <div style={{ fontWeight: 'bold', fontSize: '1.2rem' }} data-testid="pickup-count-display">{pickupCount}</div>
              <div className="hud-action-bar">
                <button className="hud-btn" onClick={() => setPickupPrompt(null)}>{t('game.cancel')}</button>
                <button className="hud-btn primary" data-testid="pickup-confirm" onClick={onConfirmPickup}>{t('game.confirm')}</button>
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
                  data-testid="reinforce-count-slider"
                  min={1}
                  max={reinforcePrompt.max}
                  value={reinforceCount}
                  aria-label={t('game.reinforcePrompt')}
                  title={t('game.reinforcePrompt')}
                  onChange={(event) => setReinforceCount(Number(event.target.value))}
                />
                <span>{reinforcePrompt.max}</span>
              </div>
              <div style={{ fontWeight: 'bold', fontSize: '1.2rem' }} data-testid="reinforce-count-display">{reinforceCount}</div>
              <div className="hud-action-bar">
                <button className="hud-btn" onClick={() => setReinforcePrompt(null)}>{t('game.cancel')}</button>
                <button className="hud-btn primary" data-testid="reinforce-confirm" onClick={() => void onConfirmReinforce()}>{t('game.confirm')}</button>
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
                  data-testid="attack-count-slider"
                  min={attackPrompt.defenderTroops + 1}
                  max={attackPrompt.max}
                  value={attackCount}
                  aria-label={t('game.tileAction.attackPrompt')}
                  title={t('game.tileAction.attackPrompt')}
                  onChange={(event) => setAttackCount(Number(event.target.value))}
                />
                <span>{attackPrompt.max}</span>
              </div>
              <div style={{ fontWeight: 'bold', fontSize: '1.2rem' }} data-testid="attack-count-display">
                {t('game.tileAction.deployCount', { count: attackCount })}
              </div>
              <div className="hud-action-bar">
                <button className="hud-btn" onClick={() => setAttackPrompt(null)}>{t('game.cancel')}</button>
                <button className="hud-btn primary" data-testid="attack-confirm" onClick={onConfirmAttack}>{t('game.confirm')}</button>
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
          {state.alliances.map((alliance) => {
            const alliancePlayers = sortedPlayers.filter(p => p.allianceId === alliance.id);
            if (alliancePlayers.length === 0) return null;
            return (
              <div key={alliance.id} style={{ marginBottom: '0.75rem' }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '0.5rem',
                  padding: '0.5rem 0.6rem', borderRadius: '0.4rem',
                  background: 'rgba(255,255,255,0.06)', marginBottom: '0.25rem',
                }}>
                  <span style={{
                    display: 'inline-block', width: 14, height: 14,
                    borderRadius: '50%', background: alliance.color, flexShrink: 0,
                  }} />
                  <strong style={{ flex: 1 }}>{alliance.name}</strong>
                  <span style={{ opacity: 0.7, fontSize: '0.85rem' }}>
                    {alliance.territoryCount} {t('game.hudLands').toLowerCase()}
                  </span>
                </div>
                {alliancePlayers.map(player => (
                  <ScoreRow key={player.id} player={player} totalHexes={totalHexes} t={t} />
                ))}
              </div>
            );
          })}
          {(() => {
            const unallied = sortedPlayers.filter(p => !p.allianceId);
            if (unallied.length === 0) return null;
            return (
              <div style={{ marginBottom: '0.75rem' }}>
                <div style={{
                  padding: '0.5rem 0.6rem', opacity: 0.6, marginBottom: '0.25rem',
                }}>
                  <strong>{t('game.unallied' as never, { defaultValue: 'Unallied' })}</strong>
                </div>
                {unallied.map(player => (
                  <ScoreRow key={player.id} player={player} totalHexes={totalHexes} t={t} />
                ))}
              </div>
            );
          })()}
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
            <button className="btn-secondary" style={{ width: '100%' }} onClick={() => setActiveModal('players')}>
              👥 {t('game.hudPlayers')}
            </button>
            <span className="hint" style={{ fontSize: '0.7rem', textAlign: 'center', opacity: 0.6 }}>
              {t('game.hudPlayersDesc' as never, { defaultValue: 'Scoreboard and player list' })}
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
            <button className="btn-secondary" style={{ width: '100%' }} onClick={() => setActiveModal('log')}>
              📜 {t('game.hudActivityFeed')}
            </button>
            <span className="hint" style={{ fontSize: '0.7rem', textAlign: 'center', opacity: 0.6 }}>
              {t('game.hudFeedDesc' as never, { defaultValue: 'Game event history' })}
            </span>
          </div>
          <div className="menu-nav-separator" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
            <button className="btn-secondary" style={{ width: '100%' }} onClick={toggleSound}>
              {soundEnabled ? '🔊' : '🔇'} {t('game.soundToggle')}
            </button>
            <span className="hint" style={{ fontSize: '0.7rem', textAlign: 'center', opacity: 0.6 }}>
              {t('game.hudSoundDesc' as never, { defaultValue: 'Toggle sound effects' })}
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
            <button className="btn-secondary" style={{ width: '100%' }} onClick={() => setActiveModal('help')}>
              ❓ {t('guidance.helpTitle')}
            </button>
            <span className="hint" style={{ fontSize: '0.7rem', textAlign: 'center', opacity: 0.6 }}>
              {t('game.hudHelpDesc' as never, { defaultValue: 'Rules and mechanics guide' })}
            </span>
          </div>
          <button className="btn-secondary" style={{ width: '100%' }} onClick={() => setActiveModal('rules')}>
            📖 {t('rules.title')}
          </button>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
            <button className="btn-secondary" style={{ width: '100%' }} onClick={() => setActiveModal('displaySettings')}>
              ⚙️ {t('settings.display.title')}
            </button>
            <span className="hint" style={{ fontSize: '0.7rem', textAlign: 'center', opacity: 0.6 }}>
              {t('game.hudDisplayDesc' as never, { defaultValue: 'Map layers and visual options' })}
            </span>
          </div>
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
          {!showReturnConfirm ? (
            <button
              className="btn-secondary"
              style={{ width: '100%', color: 'var(--danger, #e74c3c)' }}
              onClick={() => setShowReturnConfirm(true)}
            >
              {t('game.returnToLobby')}
            </button>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', padding: '0.5rem', borderRadius: '0.5rem', background: 'rgba(231,76,60,0.1)' }}>
              <span style={{ textAlign: 'center', fontWeight: 500 }}>{t('game.returnToLobbyConfirm' as never, { defaultValue: 'Leave the game? This cannot be undone.' })}</span>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className="btn-secondary" style={{ flex: 1 }} onClick={() => setShowReturnConfirm(false)}>
                  {t('game.returnToLobbyConfirmNo' as never, { defaultValue: 'Stay' })}
                </button>
                <button className="btn-secondary" style={{ flex: 1, color: 'var(--danger, #e74c3c)' }} onClick={onReturnToLobby}>
                  {t('game.returnToLobbyConfirmYes' as never, { defaultValue: 'Leave' })}
                </button>
              </div>
            </div>
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

      {debugPanel}

      <PlayerHUD
        actions={currentHexActions ?? []}
        onAction={onCurrentHexAction ?? (() => { })}
        currentHex={currentHex}
        targetCell={currentHexCell}
        carriedTroops={carriedTroops}
        playerColor={playerColor}
        hasLocation={hasLocation}
        myUserId={myUserId}
        myAllianceId={me?.allianceId ?? undefined}
        myAllianceName={myAlliance?.name}
        player={me}
        dynamics={state.dynamics}
        onActivateBeacon={onActivateBeacon ?? (() => { })}
        onDeactivateBeacon={onDeactivateBeacon ?? (() => { })}
        onActivateTacticalStrike={onActivateTacticalStrike ?? (() => { })}
        onActivateReinforce={onActivateReinforce ?? (() => { })}
        onActivateShieldWall={onActivateShieldWall ?? (() => { })}
        onActivateEmergencyRepair={onActivateEmergencyRepair ?? (() => { })}
        onStartDemolish={onStartDemolish ?? (() => { })}
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
