import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { HexCell } from '../../types/game';
import type { PlayerDisplayPreferences } from '../../types/playerPreferences';
import { hexKey } from '../map/HexMath';
import { useSound } from '../../hooks/useSound';
import { useGameStore } from '../../stores/gameStore';
import { useGameplayStore } from '../../stores';
import { useInfoLedgeStore } from '../../stores/infoLedgeStore';
import { useUiStore } from '../../stores/uiStore';
import { GameEventLog } from './GameEventLog';
import { GameRulesPage } from './GameRulesPage';
import { GuidanceBanner } from './GuidanceBanner';
import { HelpOverlay } from './HelpOverlay';
import { InfoLedge } from './InfoLedge';
import { PlayerDisplaySettings } from './PlayerDisplaySettings';
import { ScoreRow } from './PlayerPanel';
import { TileInfoCard } from './TileInfoCard';
import { PlayerHUD } from './PlayerHUD';
import { MiniMap } from '../map/MiniMap';
import { getTileInteractionStatus } from './tileInteraction';
import type { TileAction, TileActionType } from './tileInteraction';
import { useSecondTick } from '../../hooks/useSecondTick';
import { GameIcon } from '../common/GameIcon';

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
  onActivateBeacon?: () => void;
  onDeactivateBeacon?: () => void;
  onActivateTacticalStrike?: () => void;
  onActivateReinforce?: () => void;
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
  onActivateBeacon,
  onDeactivateBeacon,
  onActivateTacticalStrike,
  onActivateReinforce,
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
  onNavigateMap,
}: Props) {
  const { t } = useTranslation();
  const { toggleSound } = useSound();
  const state = useGameStore((store) => store.gameState);
  const selectedHexKey = useGameplayStore((store) => store.selectedHexKey);
  const interactionFeedback = useGameplayStore((store) => store.mapFeedback);
  const pickupPrompt = useGameplayStore((store) => store.pickupPrompt);
  const pickupCount = useGameplayStore((store) => store.pickupCount);
  const reinforcePrompt = useGameplayStore((store) => store.reinforcePrompt);
  const reinforceCount = useGameplayStore((store) => store.reinforceCount);
  const setPickupPrompt = useGameplayStore((store) => store.setPickupPrompt);
  const setPickupCount = useGameplayStore((store) => store.setPickupCount);
  const setReinforcePrompt = useGameplayStore((store) => store.setReinforcePrompt);
  const setReinforceCount = useGameplayStore((store) => store.setReinforceCount);
  const error = useUiStore((store) => store.error);
  const mainMapBounds = useUiStore((store) => store.mainMapBounds);
  const [activeModal, setActiveModal] = useState<'players' | 'log' | 'menu' | 'help' | 'rules' | 'displaySettings' | null>(null);
  const [showReturnConfirm, setShowReturnConfirm] = useState(false);
  const [currentTime, setCurrentTime] = useState(() => Date.now());

  const layoutRef = useRef<HTMLDivElement>(null);

  const isTimedGame = state?.winConditionType === 'TimedGame' && !!state.gameStartedAt && !!state.gameDurationMinutes;
  const effectiveShowReturnConfirm = activeModal === 'menu' && showReturnConfirm;
  const me = state?.players.find((player) => player.id === myUserId);
  const selectedHex = useMemo<[number, number] | null>(() => {
    if (!selectedHexKey) {
      return null;
    }

    return selectedHexKey.split(',').map(Number) as [number, number];
  }, [selectedHexKey]);
  const myAlliance = state?.alliances?.find((alliance) => alliance.id === me?.allianceId);
  const roleTitle = me?.role && me.role !== 'None' && state?.dynamics?.playerRolesEnabled
    ? t(`roles.${me.role}.title` as never, { defaultValue: t(`phase4.role${me.role}` as never) })
    : null;
  const needsClock = Boolean(
    state
    && isTimedGame
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

  useSecondTick(() => {
    if (!needsClock) {
      return;
    }

    setCurrentTime(Date.now());
  });

  // ── Info Ledge bridges ────────────────────────────────────────────────
  useEffect(() => {
    if (locationError && !isHostBypass) {
      useInfoLedgeStore.getState().clearBySource('locationError');
      useInfoLedgeStore.getState().push({
        severity: 'error',
        source: 'locationError',
        persistent: true,
        icon: 'pin',
        message: locationError,
      });
    } else {
      useInfoLedgeStore.getState().clearBySource('locationError');
    }
  }, [locationError, isHostBypass]);

  useEffect(() => {
    if (error) {
      useInfoLedgeStore.getState().clearBySource('error');
      useInfoLedgeStore.getState().push({
        severity: 'error',
        source: 'error',
        persistent: true,
        icon: 'lightning',
        message: error,
      });
    } else {
      useInfoLedgeStore.getState().clearBySource('error');
    }
  }, [error]);

  useEffect(() => {
    if (state?.isPaused) {
      useInfoLedgeStore.getState().clearBySource('paused');
      useInfoLedgeStore.getState().push({
        severity: 'error',
        source: 'paused',
        persistent: true,
        icon: 'hourglass',
        message: t('observer.gamePaused' as never),
      });
    } else {
      useInfoLedgeStore.getState().clearBySource('paused');
    }
  }, [state?.isPaused, t]);

  useEffect(() => {
    if (interactionFeedback) {
      useInfoLedgeStore.getState().push({
        severity: 'interaction',
        source: 'interaction',
        persistent: false,
        duration: 3500,
        message: interactionFeedback.message,
      });
    }
  }, [interactionFeedback]);

  const displayTimeRemaining = useMemo(() => {
    if (!isTimedGame || !state?.gameStartedAt || !state.gameDurationMinutes) {
      return null;
    }

    const endTime = new Date(state.gameStartedAt).getTime() + state.gameDurationMinutes * 60 * 1000;
    return Math.max(0, endTime - currentTime);
  }, [currentTime, isTimedGame, state]);

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
  }, [state, me, carriedTroops]);

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
  const interactionStatus = useMemo(() => {
    if (!state || pickupPrompt || reinforcePrompt) return null;

    const effectiveHex = currentHex;
    const effectiveKey = currentHex ? `${currentHex[0]},${currentHex[1]}` : null;
    const targetCell = effectiveKey
      ? state.grid[effectiveKey] ?? undefined
      : undefined;

    return getTileInteractionStatus({
      state,
      player: me ?? null,
      targetHex: effectiveHex,
      targetCell,
      currentHex,
      t,
    });
  }, [currentHex, me, pickupPrompt, reinforcePrompt, state, t]);

  const selectedCell: HexCell | undefined = state && selectedHexKey
    ? state.grid[selectedHexKey] ?? undefined
    : undefined;

  const hasExplicitRemoteSelection = Boolean(
    selectedHexKey
    && selectedHex
    && selectedCell
    && !(currentHex && selectedHex[0] === currentHex[0] && selectedHex[1] === currentHex[1]),
  );

  const showRemoteTileInfoCard = Boolean(hasExplicitRemoteSelection && onDismissTileActions);

  if (!state) {
    return null;
  }

  return (
    <div className="game-layout hud-active playing-hud-layout" ref={layoutRef}>
      <div className="top-status-bar">
        <div className="top-stats-row top-shell">
          <div className="top-shell__module top-shell__module--identity scanner-callsign">
            <div className="scanner-callsign__header">
              <span className="scanner-callsign__eyebrow">{t('game.you' as never, { defaultValue: 'You' })}</span>
              {roleTitle && <span className="scanner-callsign__role-badge">{roleTitle}</span>}
            </div>

            {currentPlayerName && (
              <div className="scanner-callsign__value">
                {me?.emoji && <span aria-hidden="true" className="scanner-callsign__emoji">{me.emoji}</span>}
                <span className="scanner-callsign__text">{currentPlayerName}</span>
              </div>
            )}

            <div className="scanner-callsign__footer">
              <span className="scanner-callsign__footer-label">{t('game.hudYourRole' as never)}</span>
              <span className="scanner-callsign__footer-value">
                {roleTitle ?? t('game.ready' as never, { defaultValue: 'Online' })}
              </span>
            </div>
          </div>

          <div className="top-shell__module top-shell__module--telemetry telemetry-cluster">
            <div className="telemetry-cluster__readout stat-item">
              <span className="stat-value primary">{myAlliance?.territoryCount ?? me?.territoryCount ?? 0}</span>
              <span className="stat-label">{t('game.hudLands')}</span>
            </div>

            <div className="telemetry-cluster__readout stat-item">
              <span className="stat-value secondary stat-value-with-detail">
                <span>{allianceTotalTroops}</span>
                {carriedTroops > 0 && (
                  <span className="stat-value-detail" aria-label={t('game.carriedTroops')}>
                    <GameIcon name="chest" size="sm" />
                    <span>+{carriedTroops}</span>
                  </span>
                )}
              </span>
              <span className="stat-label">{t('game.hudTroops')}</span>
            </div>
          </div>

          {displayTimeRemaining !== null && (
            <div className="top-shell__module top-shell__module--timer timer-module">
              <span className="timer-module__eyebrow">{t('game.hudTimer')}</span>
              <span className={`timer-module__value stat-value ${displayTimeRemaining < 60000 ? 'danger' : displayTimeRemaining < 300000 ? 'warning' : 'primary'}`}>
                {formatTimeRemaining(displayTimeRemaining)}
              </span>
            </div>
          )}

          <div className="top-shell__module top-shell__module--menu menu-control-pod">
            <button className="hud-menu-btn-flat menu-control-pod__button" onClick={() => setActiveModal('menu')} aria-label={t('game.hudMenu')}>
              <span className="menu-control-pod__label">{t('game.hudMenu')}</span>
              <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
            </button>
          </div>
        </div>
        <InfoLedge />
      </div>

      <div className="map-area-wrapper map-area-wrapper--with-player-hud">
        <div className="map-container">
          {children}
        </div>

        <div className="bottom-hud-overlay">
          {pickupPrompt && (
            <div className="glass-panel hud-context-pill context-info directive-panel directive-panel--interactive directive-panel--actionable hud-prompt-shell">
              <div className="directive-panel__eyebrow">Directive</div>
              <div className="directive-panel__title">{t('game.pickupPrompt')} (1 - {pickupPrompt.max})</div>
              <div className="pickup-controls directive-panel__slider">
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
              <div className="directive-panel__value" data-testid="pickup-count-display">{pickupCount}</div>
              <div className="hud-action-bar directive-panel__actions">
                <button className="hud-btn" onClick={() => setPickupPrompt(null)}>{t('game.cancel')}</button>
                <button className="hud-btn primary" data-testid="pickup-confirm" onClick={onConfirmPickup}>{t('game.confirm')}</button>
              </div>
            </div>
          )}

          {reinforcePrompt && (
            <div className="glass-panel hud-context-pill context-info directive-panel directive-panel--interactive directive-panel--actionable hud-prompt-shell">
              <div className="directive-panel__eyebrow">Directive</div>
              <div className="directive-panel__title">{t('game.reinforcePrompt')} (1 - {reinforcePrompt.max})</div>
              <div className="pickup-controls directive-panel__slider">
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
              <div className="directive-panel__value" data-testid="reinforce-count-display">{reinforceCount}</div>
              <div className="hud-action-bar directive-panel__actions">
                <button className="hud-btn" onClick={() => setReinforcePrompt(null)}>{t('game.cancel')}</button>
                <button className="hud-btn primary" data-testid="reinforce-confirm" onClick={() => void onConfirmReinforce()}>{t('game.confirm')}</button>
              </div>
            </div>
          )}

          {showRemoteTileInfoCard && selectedHex && (
            <TileInfoCard
              targetCell={selectedCell}
              targetHex={selectedHex}
              onDismiss={onDismissTileActions!}
              isPresenceBoosted={Boolean(
                selectedCell?.ownerId
                && me
                && (selectedCell.ownerId === me.id || (me.allianceId && selectedCell.ownerAllianceId === me.allianceId))
                && currentHex
                && selectedHex[0] === currentHex[0]
                && selectedHex[1] === currentHex[1]
              )}
            />
          )}

          {!pickupPrompt && !reinforcePrompt && !showRemoteTileInfoCard && (
            <div className="hud-context-area">
              {!(interactionStatus && interactionStatus.action !== 'none') && (
                <GuidanceBanner
                  carriedTroops={carriedTroops}
                  isInOwnHex={isInOwnHex}
                  hasLocation={hasLocation}
                />
              )}
              {interactionStatus && interactionStatus.action !== 'none' && (
                <div className={`context-item directive-panel directive-panel--actionable action-prompt enter-active ${interactionStatus.tone === 'error' ? 'context-danger' : ''}`}>
                  <span className="context-icon" aria-hidden="true">
                    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><polyline points="12 16 16 12 12 8"></polyline><line x1="8" y1="12" x2="16" y2="12"></line></svg>
                  </span>
                  <span className="directive-panel__message">{interactionStatus.message}</span>
                </div>
              )}
            </div>
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
              <div key={alliance.id} className="player-list-section">
                <div className="player-list-header alliance-header">
                  <svg className="alliance-color-dot" viewBox="0 0 14 14" aria-hidden="true">
                    <circle cx="7" cy="7" r="7" fill={alliance.color} />
                  </svg>
                  <strong className="alliance-header__name">{alliance.name}</strong>
                  <span className="alliance-header__meta">
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
              <div className="player-list-section">
                <div className="player-list-header unallied-header">
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
        <div className="hud-modal-content log-viewer">
          <GameEventLog events={state.eventLog} players={state.players} />
        </div>
      </div>

      <div className={`hud-modal-sheet ${activeModal === 'menu' ? 'open' : ''}`}>
        <div className="hud-modal-header">
          <h3>{t('game.hudMenu')}</h3>
          <button className="hud-modal-close" onClick={() => setActiveModal(null)}>×</button>
        </div>
        <div className="menu-nav">
          <div className="menu-nav__group">
            <button className="btn-secondary menu-nav__btn" onClick={() => setActiveModal('players')}>
              <GameIcon name="helmet" size="sm" /> {t('game.hudPlayers')}
            </button>
            <span className="hint menu-nav__hint">
              {t('game.hudPlayersDesc' as never, { defaultValue: 'Scoreboard and player list' })}
            </span>
          </div>
          <div className="menu-nav__group">
            <button className="btn-secondary menu-nav__btn" onClick={() => setActiveModal('log')}>
              <GameIcon name="hourglass" size="sm" /> {t('game.hudActivityFeed')}
            </button>
            <span className="hint menu-nav__hint">
              {t('game.hudFeedDesc' as never, { defaultValue: 'Game event history' })}
            </span>
          </div>
          <div className="menu-nav-separator" />
          <div className="menu-nav__group">
            <button className="btn-secondary menu-nav__btn" onClick={toggleSound}>
              <GameIcon name="radioTower" size="sm" /> {t('game.soundToggle')}
            </button>
            <span className="hint menu-nav__hint">
              {t('game.hudSoundDesc' as never, { defaultValue: 'Toggle sound effects' })}
            </span>
          </div>
          <div className="menu-nav__group">
            <button className="btn-secondary menu-nav__btn" onClick={() => setActiveModal('help')}>
              <GameIcon name="compass" size="sm" /> {t('guidance.helpTitle')}
            </button>
            <span className="hint menu-nav__hint">
              {t('game.hudHelpDesc' as never, { defaultValue: 'Rules and mechanics guide' })}
            </span>
          </div>
          <div className="menu-nav__group">
            <button className="btn-secondary menu-nav__btn" onClick={() => setActiveModal('rules')}>
              <GameIcon name="master" size="sm" /> {t('rules.title')}
            </button>
          </div>
          <div className="menu-nav__group">
            <button className="btn-secondary menu-nav__btn" onClick={() => setActiveModal('displaySettings')}>
              <GameIcon name="gearHammer" size="sm" /> {t('settings.display.title')}
            </button>
            <span className="hint menu-nav__hint">
              {t('game.hudDisplayDesc' as never, { defaultValue: 'Map layers and visual options' })}
            </span>
          </div>
          {isHost && onSetObserverMode && (
            <div className="menu-nav__group">
              <button className="btn-secondary menu-nav__btn" onClick={() => onSetObserverMode(true)}>
                <GameIcon name="archeryTarget" size="sm" /> {t('observer.switchToObserver' as never)}
              </button>
              <span className="hint menu-nav__hint menu-nav__hint--padded">
                {t('observer.switchToObserverDesc' as never)}
              </span>
            </div>
          )}
          {debugToggle}
          {!effectiveShowReturnConfirm ? (
            <button
              className="btn-secondary menu-nav__btn menu-nav__btn--danger"
              onClick={() => setShowReturnConfirm(true)}
            >
              {t('game.returnToLobby')}
            </button>
          ) : (
            <div className="return-confirm-box">
              <span className="return-confirm-box__message">{t('game.returnToLobbyConfirm' as never, { defaultValue: 'Leave the game? This cannot be undone.' })}</span>
              <div className="return-confirm-box__actions">
                <button className="btn-secondary menu-nav__btn menu-nav__btn--split" onClick={() => setShowReturnConfirm(false)}>
                  {t('game.returnToLobbyConfirmNo' as never, { defaultValue: 'Stay' })}
                </button>
                <button className="btn-secondary menu-nav__btn menu-nav__btn--danger menu-nav__btn--split" onClick={onReturnToLobby}>
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
          <div className="hud-modal-content settings-section">
            <PlayerDisplaySettings
              prefs={playerDisplayPrefs}
              onPrefsChange={onPlayerDisplayPrefsChange}
              playerColor={playerColor}
              playerName={currentPlayerName}
            />
          </div>
        </div>
      )}

      {!activeModal && debugPanel}

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
