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
import { useGuidanceBannerState } from './GuidanceBanner';
import { HelpOverlay } from './HelpOverlay';
import { InfoLedge } from './InfoLedge';
import { PlayerDisplaySettings } from './PlayerDisplaySettings';
import { ScoreRow } from './PlayerPanel';
import { TileInfoCard } from './TileInfoCard';
import { PlayerHUD } from './PlayerHUD';
import { AbilityCard } from './AbilityCard';
import { BeaconCard } from './abilities/BeaconCard';
import { ShareIntelCard } from './abilities/ShareIntelCard';
import { CommandoRaidCard } from './abilities/CommandoRaidCard';
import { DemolishCard } from './abilities/DemolishCard';
import { FortConstructionCard } from './abilities/FortConstructionCard';
import { RallyPointCard } from './abilities/RallyPointCard';
import { SabotageCard } from './abilities/SabotageCard';
import { TacticalStrikeCard } from './abilities/TacticalStrikeCard';
import { InterceptCard } from './abilities/InterceptCard';
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
  onActivateBeacon?: (heading: number) => Promise<boolean> | void;
  onDeactivateBeacon?: () => Promise<boolean> | void;
  onShareBeaconIntel?: () => Promise<number>;
  onActivateTacticalStrike?: (targetQ: number, targetR: number) => Promise<boolean> | void;
  onResolveTacticalStrikeTarget?: (heading: number) => Promise<{ targetQ: number; targetR: number } | null>;
  onActivateCommandoRaid?: (targetQ: number, targetR: number) => Promise<boolean> | void;
  onResolveRaidTarget?: (heading: number) => Promise<{ targetQ: number; targetR: number } | null>;
  onActivateRallyPoint?: () => Promise<boolean> | void;
  onActivateSabotage?: () => Promise<boolean> | void;
  onCancelFortConstruction?: () => Promise<boolean> | void;
  onCancelSabotage?: () => Promise<boolean> | void;
  onCancelDemolish?: () => Promise<boolean> | void;
  onStartDemolish?: () => Promise<boolean> | void;
  onStartFortConstruction?: () => Promise<boolean> | void;
  onAttemptIntercept?: (heading: number) => Promise<{ status: string; seconds?: number }>;
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

function getPlayerHudInitials(name: string): string {
  const compactName = name.trim();

  if (!compactName) {
    return '??';
  }

  return compactName.slice(0, 2).toUpperCase();
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
  onShareBeaconIntel,
  onActivateTacticalStrike,
  onResolveTacticalStrikeTarget,
  onActivateCommandoRaid,
  onResolveRaidTarget,
  onActivateRallyPoint,
  onActivateSabotage,
  onCancelFortConstruction,
  onCancelSabotage,
  onCancelDemolish,
  onStartDemolish,
  onStartFortConstruction,
  onAttemptIntercept,
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
  const { t, i18n } = useTranslation();
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
  const abilityUi = useGameplayStore((store) => store.abilityUi);
  const exitAbilityMode = useGameplayStore((store) => store.exitAbilityMode);
  const hideAbilityCard = useGameplayStore((store) => store.hideAbilityCard);
  const error = useUiStore((store) => store.error);
  const mainMapBounds = useUiStore((store) => store.mainMapBounds);
  const [activeModal, setActiveModal] = useState<'players' | 'log' | 'menu' | 'help' | 'rules' | 'displaySettings' | null>(null);
  const [showReturnConfirm, setShowReturnConfirm] = useState(false);
  const [showDevSection, setShowDevSection] = useState(false);
  const [currentTime, setCurrentTime] = useState(() => Date.now());

  const layoutRef = useRef<HTMLDivElement>(null);
  const menuHeaderTapCountRef = useRef(0);
  const menuHeaderTapResetTimeoutRef = useRef<number | null>(null);
  const menuHeaderLongPressTimeoutRef = useRef<number | null>(null);
  const menuHeaderLongPressTriggeredRef = useRef(false);
  const isDevBuild = import.meta.env.DEV;
  const shouldShowDevSection = isDevBuild && showDevSection;

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

    let currentSurface: HTMLElement | null = null;
    let currentBottomZone: HTMLElement | null = null;

    const observer = new ResizeObserver(() => {
      syncHudMetrics();
    });

    const syncHudMetrics = () => {
      // Re-query in case elements changed due to conditional rendering
      const newSurface = layout.querySelector('.ability-card, .player-hud') as HTMLElement | null;
      const newBottomZone = layout.querySelector('.bottom-card-zone') as HTMLElement | null;

      if (newSurface !== currentSurface) {
        if (currentSurface) observer.unobserve(currentSurface);
        if (newSurface) observer.observe(newSurface);
        currentSurface = newSurface;
      }
      
      if (newBottomZone !== currentBottomZone) {
        if (currentBottomZone) observer.unobserve(currentBottomZone);
        if (newBottomZone) observer.observe(newBottomZone);
        currentBottomZone = newBottomZone;
      }

      if (!currentSurface) {
        layout.style.removeProperty('--player-hud-h');
        layout.style.removeProperty('--player-hud-surface-h');
        layout.style.removeProperty('--player-hud-safe-inset');
        useUiStore.getState().setHudBottomPx(0);
        return;
      }

      const layoutRect = layout.getBoundingClientRect();
      const surfaceRect = currentSurface.getBoundingClientRect();
      const baseSurfaceHeight = Math.ceil(surfaceRect.height);
      const isAbilityCard = currentSurface.classList.contains('ability-card');
      
      let bottomZoneHeight = 0;
      if (currentBottomZone && !isAbilityCard && currentBottomZone.childElementCount > 0) {
        const zoneRect = currentBottomZone.getBoundingClientRect();
        if (zoneRect.height > 0) {
          bottomZoneHeight = Math.ceil(zoneRect.height);
        }
      }

      const totalCombinedHeight = isAbilityCard 
        ? baseSurfaceHeight 
        : baseSurfaceHeight + bottomZoneHeight;

      layout.style.setProperty('--player-hud-surface-h', `${baseSurfaceHeight}px`);
      layout.style.setProperty('--player-hud-h', `${totalCombinedHeight}px`);
      layout.style.setProperty('--player-hud-safe-inset', `${Math.max(0, Math.ceil(layoutRect.bottom - surfaceRect.top))}px`);
      useUiStore.getState().setHudBottomPx(totalCombinedHeight);
    };

    observer.observe(layout);
    syncHudMetrics();
    window.addEventListener('resize', syncHudMetrics);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', syncHudMetrics);
      layout.style.removeProperty('--player-hud-h');
      layout.style.removeProperty('--player-hud-surface-h');
      layout.style.removeProperty('--player-hud-safe-inset');
    };
  }, []);

  useEffect(() => {
    return () => {
      if (menuHeaderTapResetTimeoutRef.current !== null) {
        window.clearTimeout(menuHeaderTapResetTimeoutRef.current);
      }

      if (menuHeaderLongPressTimeoutRef.current !== null) {
        window.clearTimeout(menuHeaderLongPressTimeoutRef.current);
      }
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
  const guidanceState = useGuidanceBannerState({
    carriedTroops,
    isInOwnHex,
    hasLocation,
    currentHex,
  });

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
  const territoryCount = myAlliance?.territoryCount ?? me?.territoryCount ?? 0;
  const playerAvatarGlyph = (me?.emoji?.trim() || getPlayerHudInitials(currentPlayerName)).slice(0, 2);
  const hasEmojiAvatar = Boolean(me?.emoji?.trim());

  const compactNumberFormatter = useMemo(() => {
    return new Intl.NumberFormat(i18n.resolvedLanguage, {
      notation: 'compact',
      compactDisplay: 'short',
      maximumFractionDigits: 1,
    });
  }, [i18n.resolvedLanguage]);

  const formattedTerritoryCount = compactNumberFormatter.format(territoryCount);
  const formattedTotalTroops = compactNumberFormatter.format(allianceTotalTroops);
  const hasAmbientCoordinates = me?.currentHexQ != null && me?.currentHexR != null;

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
  const hasCurrentHexActions = (currentHexActions?.length ?? 0) > 0;
  const canShowIntegratedIdleContext = !pickupPrompt && !reinforcePrompt && !showRemoteTileInfoCard;

  if (!state) {
    return null;
  }

  const clearMenuHeaderLongPress = () => {
    if (menuHeaderLongPressTimeoutRef.current !== null) {
      window.clearTimeout(menuHeaderLongPressTimeoutRef.current);
      menuHeaderLongPressTimeoutRef.current = null;
    }
  };

  const clearMenuHeaderTapReset = () => {
    if (menuHeaderTapResetTimeoutRef.current !== null) {
      window.clearTimeout(menuHeaderTapResetTimeoutRef.current);
      menuHeaderTapResetTimeoutRef.current = null;
    }
  };

  const toggleDevSectionVisibility = () => {
    setShowDevSection((current) => !current);
  };

  const handleMenuHeaderPointerDown = () => {
    if (!isDevBuild) {
      return;
    }

    menuHeaderLongPressTriggeredRef.current = false;
    clearMenuHeaderLongPress();
    menuHeaderLongPressTimeoutRef.current = window.setTimeout(() => {
      menuHeaderLongPressTriggeredRef.current = true;
      menuHeaderTapCountRef.current = 0;
      clearMenuHeaderTapReset();
      toggleDevSectionVisibility();
      menuHeaderLongPressTimeoutRef.current = null;
    }, 600);
  };

  const handleMenuHeaderPointerUp = () => {
    if (!isDevBuild) {
      return;
    }

    const wasLongPress = menuHeaderLongPressTriggeredRef.current;
    clearMenuHeaderLongPress();

    if (wasLongPress) {
      menuHeaderLongPressTriggeredRef.current = false;
      return;
    }

    menuHeaderTapCountRef.current += 1;

    if (menuHeaderTapCountRef.current >= 3) {
      menuHeaderTapCountRef.current = 0;
      clearMenuHeaderTapReset();
      toggleDevSectionVisibility();
      return;
    }

    clearMenuHeaderTapReset();
    menuHeaderTapResetTimeoutRef.current = window.setTimeout(() => {
      menuHeaderTapCountRef.current = 0;
      menuHeaderTapResetTimeoutRef.current = null;
    }, 900);
  };

  const handleMenuHeaderPointerCancel = () => {
    menuHeaderLongPressTriggeredRef.current = false;
    clearMenuHeaderLongPress();
  };

  return (
    <div className="game-layout hud-active playing-hud-layout" ref={layoutRef}>
      <div className="map-area-wrapper map-area-wrapper--with-player-hud">
        <div className="map-container">
          {children}
        </div>
      </div>

      <div className="top-status-bar">
        <div className="top-stats-row top-shell">
          <div className="top-shell__module top-shell__module--identity scanner-callsign">
            <span
              className={`scanner-callsign__avatar ${hasEmojiAvatar ? 'scanner-callsign__avatar--emoji' : 'scanner-callsign__avatar--initials'}`}
              aria-hidden="true"
            >
              {playerAvatarGlyph}
            </span>
            <div className="scanner-callsign__info">
              <div className="scanner-callsign__name-row">
                <span className="scanner-callsign__text" title={currentPlayerName}>{currentPlayerName}</span>
                {roleTitle && <span className="scanner-callsign__role-badge">{roleTitle}</span>}
              </div>
              {hasAmbientCoordinates && (
                <span className="coord-display">
                  Q{me.currentHexQ} R{me.currentHexR}
                </span>
              )}
            </div>
          </div>

          <div className="top-shell__center-col">
            <div className="top-shell__module top-shell__module--telemetry telemetry-cluster">
              <div className="telemetry-cluster__readout stat-item">
                <div className="telemetry-stat__number-row">
                  <GameIcon name="shield" className="telemetry-stat__icon" />
                  <span className="stat-value primary stat-value--numeric">{formattedTerritoryCount}</span>
                </div>
                <span className="stat-label">{t('game.hudLands')}</span>
              </div>

              <div className="telemetry-cluster__readout stat-item">
                <div className="telemetry-stat__number-row stat-value secondary stat-value-with-detail stat-value-with-detail--troops">
                  <GameIcon name="rallyTroops" className="telemetry-stat__icon" />
                  <span className="stat-value--numeric">{formattedTotalTroops}</span>
                </div>
                <span className="stat-label">{t('game.hudTroops')}</span>
              </div>
            </div>

            {displayTimeRemaining !== null && (
              <div className="top-shell__module top-shell__module--timer timer-module">
                <span className={`timer-module__value stat-value ${displayTimeRemaining < 60000 ? 'danger' : displayTimeRemaining < 300000 ? 'warning' : 'primary'}`}>
                  {formatTimeRemaining(displayTimeRemaining)}
                </span>
              </div>
            )}
          </div>

          <div className="top-shell__module top-shell__module--menu menu-control-pod">
            <button
              className="hud-menu-btn-flat menu-control-pod__button"
              onClick={() => setActiveModal('menu')}
              aria-label={t('game.hudMenu')}
              title={t('game.hudMenu')}
            >
              <span className="hamburger-button-icon" aria-hidden="true">
                <span className="hamburger-button-icon__line" />
                <span className="hamburger-button-icon__line" />
                <span className="hamburger-button-icon__line" />
              </span>
            </button>
          </div>
        </div>
        <InfoLedge />
      </div>

      {activeModal && <div className="hud-modal-backdrop" onClick={() => setActiveModal(null)} />}

      <div className={`hud-modal-sheet ${activeModal === 'players' ? 'open' : ''}`}>
        <div className="hud-modal-header">
          <h3>{t('game.hudPlayers')}</h3>
          <button className="hud-modal-close" onClick={() => setActiveModal(null)}>×</button>
        </div>
        <div className="player-list">
          {state.alliances.map((alliance) => {
            const alliancePlayers = sortedPlayers.filter(p => p.allianceId === alliance.id);
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
            const knownAllianceIds = new Set(state.alliances.map(a => a.id));
            const unallied = sortedPlayers.filter(p => !p.allianceId || !knownAllianceIds.has(p.allianceId));
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
          <h3
            className={isDevBuild ? 'hud-modal-header__secret-trigger' : undefined}
            onPointerDown={handleMenuHeaderPointerDown}
            onPointerUp={handleMenuHeaderPointerUp}
            onPointerCancel={handleMenuHeaderPointerCancel}
            onPointerLeave={handleMenuHeaderPointerCancel}
          >
            <span>▶ {t('game.hudMenu')}</span>
          </h3>
          <button className="hud-modal-close" onClick={() => setActiveModal(null)}>×</button>
        </div>
        {hasAmbientCoordinates && (
          <div className="menu-header-ambient">
            {`Q${me.currentHexQ} R${me.currentHexR} · ${formattedTerritoryCount} ZONES`}
          </div>
        )}
        <div className="menu-nav">
          <section className="menu-nav__section" aria-label={t('game.menuSectionGame' as never)}>
            <div className="menu-nav__section-header">{t('game.menuSectionGame' as never)}</div>
            <div className="menu-nav__group">
              <button className="btn-secondary menu-nav__btn" onClick={() => setActiveModal('players')}>
                <GameIcon name="helmet" size="sm" /> <span className="menu-item-label">{t('game.hudPlayers')}</span>
              </button>
            </div>
            <div className="menu-nav__group">
              <button className="btn-secondary menu-nav__btn" onClick={() => setActiveModal('log')}>
                <GameIcon name="hourglass" size="sm" /> <span className="menu-item-label">{t('game.hudActivityFeed')}</span>
              </button>
            </div>
          </section>

          <div className="menu-nav-separator" />

          <section className="menu-nav__section" aria-label={t('game.menuSectionSettings' as never)}>
            <div className="menu-nav__section-header">{t('game.menuSectionSettings' as never)}</div>
            <div className="menu-nav__group">
              <button className="btn-secondary menu-nav__btn" onClick={toggleSound}>
                <GameIcon name="radioTower" size="sm" /> <span className="menu-item-label">{t('game.soundToggle')}</span>
              </button>
            </div>
            <div className="menu-nav__group">
              <button className="btn-secondary menu-nav__btn" onClick={() => setActiveModal('displaySettings')}>
                <GameIcon name="gearHammer" size="sm" /> <span className="menu-item-label">{t('settings.display.title')}</span>
              </button>
            </div>
          </section>

          <div className="menu-nav-separator" />

          <section className="menu-nav__section" aria-label={t('game.menuSectionHelp' as never)}>
            <div className="menu-nav__section-header">{t('game.menuSectionHelp' as never)}</div>
            <div className="menu-nav__group">
              <button className="btn-secondary menu-nav__btn" onClick={() => setActiveModal('help')}>
                <GameIcon name="compass" size="sm" /> <span className="menu-item-label">{t('guidance.helpTitle')}</span>
              </button>
            </div>
            <div className="menu-nav__group">
              <button className="btn-secondary menu-nav__btn" onClick={() => setActiveModal('rules')}>
                <GameIcon name="treasureMap" size="sm" /> <span className="menu-item-label">{t('rules.title')}</span>
              </button>
            </div>
          </section>

          <div className="menu-nav-separator" />

          <section className="menu-nav__section" aria-label={t('game.menuSectionSession' as never)}>
            <div className="menu-nav__section-header">{t('game.menuSectionSession' as never)}</div>
            {isHost && onSetObserverMode && (
              <div className="menu-nav__group">
                <button className="btn-secondary menu-nav__btn" onClick={() => onSetObserverMode(true)}>
                  <GameIcon name="archeryTarget" size="sm" /> <span className="menu-item-label">{t('observer.switchToObserver' as never)}</span>
                </button>
              </div>
            )}
          </section>

          {shouldShowDevSection && debugToggle}
          <div className="menu-nav-separator menu-nav-separator--footer" />
          {!effectiveShowReturnConfirm ? (
            <button
              className="btn-secondary menu-nav__btn menu-nav__btn--danger"
              onClick={() => setShowReturnConfirm(true)}
            >
              <GameIcon name="returnArrow" size="sm" /> <span className="menu-item-label">{t('game.returnToLobby')}</span>
            </button>
          ) : (
            <div className="return-confirm-box">
              <span className="return-confirm-box__message">{t('game.returnToLobbyConfirm' as never, { defaultValue: 'Leave the game? This cannot be undone.' })}</span>
              <div className="return-confirm-box__actions">
                <button className="btn-secondary menu-nav__btn menu-nav__btn--split" onClick={() => setShowReturnConfirm(false)}>
                  <span className="menu-item-label">{t('game.returnToLobbyConfirmNo' as never, { defaultValue: 'Stay' })}</span>
                </button>
                <button className="btn-secondary menu-nav__btn menu-nav__btn--danger menu-nav__btn--split" onClick={onReturnToLobby}>
                  <span className="menu-item-label">{t('game.returnToLobbyConfirmYes' as never, { defaultValue: 'Leave' })}</span>
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

      <div className="bottom-card-zone">
        {pickupPrompt && (
          <div className="glass-panel hud-context-pill context-info directive-panel directive-panel--interactive directive-panel--actionable hud-prompt-shell">
            <div className="directive-panel__swipe-handle" />
            <span className="directive-panel__meta">SYS.LOCK // ACTIVE</span>
            <div className="directive-panel__header">
              <span className="directive-panel__status-led" />
              <div className="directive-panel__eyebrow">Directive</div>
            </div>
            <div className="directive-panel__title">
              {t('game.pickupPrompt')}
              <span className="directive-panel__title-range">1 – {pickupPrompt.max}</span>
            </div>
            <div className="pickup-controls directive-panel__slider">
              <input
                type="range"
                data-testid="pickup-count-slider"
                min={1}
                max={pickupPrompt.max}
                value={pickupCount}
                aria-label={t('game.pickupPrompt')}
                title={t('game.pickupPrompt')}
                onChange={(event) => setPickupCount(Number(event.target.value))}
                style={{ '--slider-fill-pct': `${((pickupCount - 1) / Math.max(1, pickupPrompt.max - 1)) * 100}%` } as React.CSSProperties}
              />
              <div className="directive-panel__slider-labels">
                <span>1</span>
                <span>{pickupPrompt.max}</span>
              </div>
            </div>
            <div className="directive-panel__value" data-testid="pickup-count-display">{pickupCount}</div>
            <div className="hud-action-bar directive-panel__actions">
              <button className="hud-btn directive-panel__cancel-btn" onClick={() => setPickupPrompt(null)}>{t('game.cancel')}</button>
              <button className="hud-btn primary directive-panel__confirm-btn" data-testid="pickup-confirm" onClick={onConfirmPickup}>{t('game.confirm')}</button>
            </div>
            <div className="directive-panel__divider" aria-hidden="true" />
          </div>
        )}

        {reinforcePrompt && (
          <div className="glass-panel hud-context-pill context-info directive-panel directive-panel--interactive directive-panel--actionable hud-prompt-shell">
            <div className="directive-panel__swipe-handle" />
            <span className="directive-panel__meta">SYS.LOCK // ACTIVE</span>
            <div className="directive-panel__header">
              <span className="directive-panel__status-led" />
              <div className="directive-panel__eyebrow">Directive</div>
            </div>
            <div className="directive-panel__title">
              {t('game.reinforcePrompt')}
              <span className="directive-panel__title-range">1 – {reinforcePrompt.max}</span>
            </div>
            <div className="pickup-controls directive-panel__slider">
              <input
                type="range"
                data-testid="reinforce-count-slider"
                min={1}
                max={reinforcePrompt.max}
                value={reinforceCount}
                aria-label={t('game.reinforcePrompt')}
                title={t('game.reinforcePrompt')}
                onChange={(event) => setReinforceCount(Number(event.target.value))}
                style={{ '--slider-fill-pct': `${((reinforceCount - 1) / Math.max(1, reinforcePrompt.max - 1)) * 100}%` } as React.CSSProperties}
              />
              <div className="directive-panel__slider-labels">
                <span>1</span>
                <span>{reinforcePrompt.max}</span>
              </div>
            </div>
            <div className="directive-panel__value" data-testid="reinforce-count-display">{reinforceCount}</div>
            <div className="hud-action-bar directive-panel__actions">
              <button className="hud-btn directive-panel__cancel-btn" onClick={() => setReinforcePrompt(null)}>{t('game.cancel')}</button>
              <button className="hud-btn primary directive-panel__confirm-btn" data-testid="reinforce-confirm" onClick={() => void onConfirmReinforce()}>{t('game.confirm')}</button>
            </div>
            <div className="directive-panel__divider" aria-hidden="true" />
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
      </div>

      {!activeModal && shouldShowDevSection && debugPanel}

      {abilityUi.activeAbility !== null && abilityUi.cardVisible ? (
        abilityUi.activeAbility === 'beacon' ? (
          <BeaconCard
            myUserId={myUserId}
            onActivateBeacon={onActivateBeacon ?? (() => { })}
            onDeactivateBeacon={onDeactivateBeacon ?? (() => { })}
            onShareBeaconIntel={onShareBeaconIntel ?? (async () => 0)}
          />
        ) : abilityUi.activeAbility === 'shareIntel' ? (
          <ShareIntelCard
            myUserId={myUserId}
            onShareBeaconIntel={onShareBeaconIntel ?? (async () => 0)}
          />
        ) : abilityUi.activeAbility === 'tacticalStrike' ? (
          <TacticalStrikeCard
            myUserId={myUserId}
            onActivateTacticalStrike={onActivateTacticalStrike ?? (() => { })}
            onResolveTacticalStrikeTarget={onResolveTacticalStrikeTarget ?? (async () => null)}
            currentHex={currentHex}
          />
        ) : abilityUi.activeAbility === 'rallyPoint' ? (
          <RallyPointCard
            myUserId={myUserId}
            currentHex={currentHex}
            onActivateRallyPoint={onActivateRallyPoint ?? (() => { })}
          />
        ) : abilityUi.activeAbility === 'commandoRaid' ? (
          <CommandoRaidCard
            myUserId={myUserId}
            onActivateCommandoRaid={onActivateCommandoRaid ?? (() => { })}
            onResolveRaidTarget={onResolveRaidTarget ?? (async () => null)}
          />
        ) : abilityUi.activeAbility === 'fortConstruction' ? (
          <FortConstructionCard
            myUserId={myUserId}
            currentHex={currentHex}
            onStartFortConstruction={onStartFortConstruction ?? (() => { })}
            onCancelFortConstruction={onCancelFortConstruction ?? (() => { })}
          />
        ) : abilityUi.activeAbility === 'sabotage' ? (
          <SabotageCard
            myUserId={myUserId}
            currentHex={currentHex}
            onActivateSabotage={onActivateSabotage ?? (() => { })}
            onCancelSabotage={onCancelSabotage ?? (() => { })}
          />
        ) : abilityUi.activeAbility === 'demolish' ? (
          <DemolishCard
            myUserId={myUserId}
            currentHex={currentHex}
            onStartDemolish={onStartDemolish ?? (() => { })}
            onCancelDemolish={onCancelDemolish ?? (() => { })}
          />
        ) : abilityUi.activeAbility === 'intercept' ? (
          <InterceptCard
            myUserId={myUserId}
            onAttemptIntercept={onAttemptIntercept ?? (async () => ({ status: 'noTarget' }))}
          />
        ) : (
          <AbilityCard
            title={t(`abilities.${abilityUi.activeAbility}.title` as never, { defaultValue: abilityUi.activeAbility })}
            icon={<GameIcon name="gearHammer" size="sm" />}
            onBackToHud={() => {
              if (abilityUi.mode === 'targeting' || abilityUi.mode === 'confirming') {
                exitAbilityMode();
              } else {
                hideAbilityCard();
              }
            }}
            showAbort={abilityUi.mode === 'inProgress'}
            onAbort={() => exitAbilityMode()}
          >
            <div className="placeholder-ability-content">
              <p>Ability card for {abilityUi.activeAbility}</p>
              <p>Mode: {abilityUi.mode}</p>
            </div>
          </AbilityCard>
        )
      ) : (
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
          onActivateRallyPoint={onActivateRallyPoint ?? (() => { })}
          onActivateSabotage={onActivateSabotage ?? (() => { })}
          onStartDemolish={onStartDemolish ?? (() => { })}
          onStartFortConstruction={onStartFortConstruction ?? (() => { })}
          guidanceHint={canShowIntegratedIdleContext && !hasCurrentHexActions ? guidanceState.hint : null}
          guidanceVisible={canShowIntegratedIdleContext && !hasCurrentHexActions ? guidanceState.isVisible : false}
          interactionPrompt={canShowIntegratedIdleContext && !hasCurrentHexActions && interactionStatus && interactionStatus.action !== 'none'
            ? {
              tone: interactionStatus.tone,
              message: interactionStatus.message,
            }
            : null}
        />
      )}

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
