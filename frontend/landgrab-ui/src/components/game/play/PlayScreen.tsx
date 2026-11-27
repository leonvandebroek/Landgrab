import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ReactNode } from 'react';
import type { GameState, Player } from '../../../types/game';
import type { PlayerDisplayPreferences } from '../../../types/playerPreferences';
import type { InvokeFn } from '../../../types/abilities';
import type { TileAction, TileActionType } from '../tileInteraction';
import { useGameplayStore } from '../../../stores/gameplayStore';
import { useInfoLedgeStore } from '../../../stores/infoLedgeStore';
import { useUiStore } from '../../../stores/uiStore';
import { useSecondTick } from '../../../hooks/useSecondTick';
import { abilityRegistry } from '../../../config/abilityRegistry';
import { Icon } from '../../ui/Icon';
import { cx } from '../../ui/kit';
import { GameRulesPage } from '../GameRulesPage';
import { TroopTransferReceivedPanel } from '../abilities/TroopTransferReceivedPanel';
import { FieldBattleInvitePanel } from '../abilities/FieldBattleInvitePanel';
import { TileDock } from './TileDock';
import { PlayMenuSheet } from './PlayMenuSheet';
import { CoachTips, hasSeenCoach, type CoachTarget } from './CoachTips';
import { formatCountdown, useAbilityButtons } from './useAbilityButtons';

interface Props {
  state: GameState;
  myUserId: string;
  currentHex: [number, number] | null;
  hasLocation: boolean;
  locationError: string | null;
  isHostBypass: boolean;
  currentHexActions: TileAction[];
  onCurrentHexAction: (type: TileActionType) => void;
  onConfirmPickup: () => void;
  onConfirmReinforce: () => Promise<void>;
  onConfirmAttack: () => Promise<void>;
  onDismissTileActions: () => void;
  onReturnToLobby: () => void;
  onSetObserverMode?: (enabled: boolean) => void;
  onFleeBattle: (battleId: string) => Promise<boolean>;
  invoke: InvokeFn | null;
  playerDisplayPrefs: PlayerDisplayPreferences;
  onPlayerDisplayPrefsChange: (prefs: PlayerDisplayPreferences) => void;
  debugToggle?: ReactNode;
  debugPanel?: ReactNode;
  /** The map, rendered with its compact controls. */
  children: ReactNode;
}

/**
 * The game screen: the map first, a score bar on top, two map buttons, the
 * ability buttons and one bottom panel that says what you can do here.
 */
export function PlayScreen({
  state,
  myUserId,
  currentHex,
  hasLocation,
  locationError,
  isHostBypass,
  currentHexActions,
  onCurrentHexAction,
  onConfirmPickup,
  onConfirmReinforce,
  onConfirmAttack,
  onDismissTileActions,
  onReturnToLobby,
  onSetObserverMode,
  onFleeBattle,
  invoke,
  playerDisplayPrefs,
  onPlayerDisplayPrefsChange,
  debugToggle,
  debugPanel,
  children,
}: Props) {
  const { t } = useTranslation();
  const rootRef = useRef<HTMLDivElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  const abilityUi = useGameplayStore((store) => store.abilityUi);
  const mapFeedback = useGameplayStore((store) => store.mapFeedback);
  const enterAbilityMode = useGameplayStore((store) => store.enterAbilityMode);
  const showAbilityCard = useGameplayStore((store) => store.showAbilityCard);
  const error = useUiStore((store) => store.error);
  const toasts = useInfoLedgeStore((store) => store.items);
  const dismissToast = useInfoLedgeStore((store) => store.dismiss);
  const [menuOpen, setMenuOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [coachOpen, setCoachOpen] = useState(() => !hasSeenCoach());
  const [coachTarget, setCoachTarget] = useState<CoachTarget | null>(null);
  const [devOpen, setDevOpen] = useState(false);
  const tapCountRef = useRef(0);
  const tapTimerRef = useRef<number | null>(null);

  const me: Player | null = state.players.find((player) => player.id === myUserId) ?? null;
  const abilityButtons = useAbilityButtons(me, state);
  const cardOpen = abilityUi.activeAbility !== null && abilityUi.cardVisible;

  // ── Messages that used to live in the info ledge ─────────────────────────
  useEffect(() => {
    const ledge = useInfoLedgeStore.getState();
    ledge.clearBySource('locationError');
    if (locationError && !isHostBypass) {
      ledge.push({ severity: 'error', source: 'locationError', persistent: true, message: locationError });
    }
  }, [isHostBypass, locationError]);

  useEffect(() => {
    const ledge = useInfoLedgeStore.getState();
    ledge.clearBySource('error');
    if (error) ledge.push({ severity: 'error', source: 'error', persistent: false, duration: 6000, message: error });
  }, [error]);

  useEffect(() => {
    const ledge = useInfoLedgeStore.getState();
    ledge.clearBySource('paused');
    if (state.isPaused) ledge.push({ severity: 'error', source: 'paused', persistent: true, message: t('ui.play.paused') });
  }, [state.isPaused, t]);

  useEffect(() => {
    if (!mapFeedback) return;
    useInfoLedgeStore.getState().push({
      severity: 'interaction',
      source: 'interaction',
      persistent: false,
      duration: 3500,
      message: mapFeedback.message,
    });
  }, [mapFeedback]);

  // ── Keep the map and the floating buttons clear of the bottom panel ───────
  useLayoutEffect(() => {
    const root = rootRef.current;
    const dock = dockRef.current;
    if (!root || !dock) return undefined;
    const sync = () => {
      const height = Math.ceil(dock.getBoundingClientRect().height);
      root.style.setProperty('--lg-dock-h', `${height}px`);
      useUiStore.getState().setHudBottomPx(height);
    };
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(dock);
    window.addEventListener('resize', sync);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', sync);
      useUiStore.getState().setHudBottomPx(0);
    };
  }, []);

  useEffect(() => () => {
    if (tapTimerRef.current !== null) window.clearTimeout(tapTimerRef.current);
  }, []);

  // Developer tools: tap the menu title three times in a dev build.
  const handleSecretTap = useCallback(() => {
    if (!import.meta.env.DEV) return;
    tapCountRef.current += 1;
    if (tapTimerRef.current !== null) window.clearTimeout(tapTimerRef.current);
    if (tapCountRef.current >= 3) {
      tapCountRef.current = 0;
      setDevOpen((open) => !open);
      return;
    }
    tapTimerRef.current = window.setTimeout(() => { tapCountRef.current = 0; }, 900);
  }, []);

  // ── Mission chips under the score bar ─────────────────────────────────────
  const chips = abilityButtons.filter((button) => button.chip);
  const incomingRaid = state.activeRaids?.find((raid) => me?.allianceId && raid.initiatorAllianceId !== me.allianceId
    && state.grid[`${raid.targetQ},${raid.targetR}`]?.ownerAllianceId === me.allianceId);

  const visibleToasts = useMemo(() => [...toasts]
    .filter((item) => item.source !== 'connection')
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 2), [toasts]);

  const ActiveCard = abilityUi.activeAbility ? abilityRegistry[abilityUi.activeAbility]?.Card : null;

  return (
    <div className="lg-play" ref={rootRef} data-testid="play-screen">
      <div className="lg-play__map">{children}</div>

      <div className="lg-top">
        <div className="lg-top__row">
          <div className={cx('lg-score-wrap', coachTarget === 'score' && 'lg-coach-target')}>
            <ScoreBar state={state} me={me} onOpen={() => setMenuOpen(true)} />
          </div>
          <button
            type="button"
            className={cx('lg-menubtn', coachTarget === 'menu' && 'lg-coach-target')}
            aria-label={t('ui.menu.open')}
            onClick={() => setMenuOpen(true)}
            data-testid="play-menu-btn"
          >
            <Icon name="menu" size={24} />
          </button>
        </div>

        {(chips.length > 0 || incomingRaid) && (
          <div className="lg-chips">
            {chips.map((chip) => (
              <button
                key={chip.key}
                type="button"
                className={cx('lg-chip', chip.tone === 'alert' ? 'lg-chip--warn' : 'lg-chip--live')}
                onClick={chip.onClick}
                data-testid={`mission-chip-${chip.key}`}
              >
                <span className="lg-chip__dot" aria-hidden="true" />
                {chip.chip}
                {chip.chipTime && <span className="lg-chip__time">{chip.chipTime}</span>}
              </button>
            ))}
            {incomingRaid && <RaidWarning deadline={incomingRaid.deadline} />}
          </div>
        )}

        {visibleToasts.map((toast) => (
          <button
            key={toast.id}
            type="button"
            className={cx('lg-toast', toast.severity === 'error' && 'lg-toast--error', toast.severity === 'hostMessage' && 'lg-toast--warn')}
            onClick={() => dismissToast(toast.id)}
            role="status"
          >
            {toast.message}
          </button>
        ))}
      </div>

      {abilityButtons.length > 0 && !cardOpen && (
        <div className="lg-abilitydock" data-testid="ability-dock">
          {abilityButtons.map((button) => (
            <button
              key={button.key}
              type="button"
              className={cx(
                'lg-abtn',
                button.tone === 'running' && 'is-running',
                button.tone === 'targeting' && 'is-running',
                button.tone === 'cooldown' && 'is-cooldown',
                button.tone === 'alert' && 'is-alert',
              )}
              disabled={button.disabled}
              onClick={button.onClick}
              data-testid={`ability-btn-${button.key}`}
              aria-label={`${button.label}: ${button.stateText}`}
            >
              <Icon name={button.icon} size={20} className="lg-abtn__icon" />
              <span className="lg-abtn__copy">
                <span className="lg-abtn__label">{button.label}</span>
                <span className="lg-abtn__state">{button.stateText}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      <div className={cx('lg-dockwrap', coachTarget === 'dock' && 'lg-coach-target')} ref={dockRef}>
        {cardOpen && ActiveCard
          ? <ActiveCard myUserId={myUserId} invoke={invoke} />
          : (
            <TileDock
              state={state}
              me={me}
              currentHex={currentHex}
              hasLocation={hasLocation}
              actions={currentHexActions}
              onAction={onCurrentHexAction}
              onConfirmPickup={onConfirmPickup}
              onConfirmReinforce={onConfirmReinforce}
              onConfirmAttack={onConfirmAttack}
              onDismissSelection={onDismissTileActions}
              onGiveTroops={() => {
                if (abilityUi.activeAbility === 'troopTransfer') showAbilityCard();
                else enterAbilityMode('troopTransfer', 'targeting', 'none', { cardVisible: true });
              }}
            />
          )}
      </div>

      {coachTarget === 'mapButtons' && <div className="lg-coach-ring lg-coach-ring--mapbtns" aria-hidden="true" />}

      <TroopTransferReceivedPanel invoke={invoke} />
      <FieldBattleInvitePanel invoke={invoke} onFleeBattle={onFleeBattle} />

      <PlayMenuSheet
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        state={state}
        myUserId={myUserId}
        playerDisplayPrefs={playerDisplayPrefs}
        onPlayerDisplayPrefsChange={onPlayerDisplayPrefsChange}
        onShowRules={() => { setMenuOpen(false); setRulesOpen(true); }}
        onReplayTips={() => { setMenuOpen(false); setCoachOpen(true); }}
        onSetObserverMode={onSetObserverMode}
        onLeave={onReturnToLobby}
        onTitleTap={handleSecretTap}
        devTools={devOpen ? debugToggle : null}
      />

      {rulesOpen && (
        <div className="lg-rules-overlay">
          <GameRulesPage gameState={state} onContinue={() => setRulesOpen(false)} isModal />
        </div>
      )}

      {coachOpen && !menuOpen && (
        <CoachTips
          onStep={setCoachTarget}
          onDone={() => { setCoachOpen(false); setCoachTarget(null); }}
        />
      )}

      {devOpen && !menuOpen && debugPanel}
    </div>
  );
}

function RaidWarning({ deadline }: { deadline: string }) {
  const { t } = useTranslation();
  const [, setTick] = useState(0);
  useSecondTick(() => setTick((value) => value + 1));
  const time = formatCountdown(deadline);
  return (
    <span className="lg-chip lg-chip--warn" role="status">
      <span className="lg-chip__dot" aria-hidden="true" />
      {t('ui.play.chips.raidIncoming')}
      {time && <span className="lg-chip__time">{time}</span>}
    </span>
  );
}

/** Team share of the map, the goal line, and time left in a timed game. */
function ScoreBar({ state, me, onOpen }: { state: GameState; me: Player | null; onOpen: () => void }) {
  const { t } = useTranslation();
  const [now, setNow] = useState(() => Date.now());
  const isTimed = state.winConditionType === 'TimedGame' && state.gameStartedAt && state.gameDurationMinutes;
  useSecondTick(() => {
    if (isTimed) setNow(Date.now());
  });

  const claimable = Math.max(1, Object.values(state.grid).filter((cell) => !cell.isMasterTile).length);
  const teams = state.alliances.length > 0
    ? state.alliances.map((alliance) => ({ id: alliance.id, name: alliance.name, color: alliance.color, tiles: alliance.territoryCount }))
    : state.players.map((player) => ({ id: player.id, name: player.name, color: player.color, tiles: player.territoryCount }));
  const myId = state.alliances.length > 0 ? me?.allianceId : me?.id;
  const mine = teams.find((team) => team.id === myId) ?? teams[0];
  const rival = teams
    .filter((team) => team.id !== mine?.id)
    .sort((a, b) => b.tiles - a.tiles)[0];
  const pct = (tiles: number) => Math.round((tiles / claimable) * 100);

  let goal: string;
  if (isTimed) {
    const end = new Date(state.gameStartedAt!).getTime() + state.gameDurationMinutes! * 60000;
    const left = Math.max(0, end - now);
    const minutes = Math.floor(left / 60000);
    const seconds = Math.floor((left % 60000) / 1000);
    goal = t('ui.play.timeLeft', { time: `${minutes}:${seconds.toString().padStart(2, '0')}` });
  } else if (state.winConditionType === 'Elimination') {
    goal = t('ui.play.goalElimination');
  } else {
    goal = t('ui.play.goalTerritory', { pct: state.winConditionValue });
  }

  const ordered = [mine, ...teams.filter((team) => team.id !== mine?.id && team.id !== rival?.id), rival].filter(Boolean) as typeof teams;

  return (
    <button type="button" className="lg-score" onClick={onOpen} data-testid="play-score-bar" aria-label={t('ui.menu.scores')}>
      <div className="lg-score__row">
        {mine && (
          <span className="lg-score__team">
            <span className="lg-score__pct" style={{ color: mine.color }}>{pct(mine.tiles)}%</span>
            <span className="lg-score__name">{mine.name}</span>
          </span>
        )}
        <span className="lg-score__goal">{goal}</span>
        {rival && (
          <span className="lg-score__team lg-score__team--end">
            <span className="lg-score__name">{rival.name}</span>
            <span className="lg-score__pct" style={{ color: rival.color }}>{pct(rival.tiles)}%</span>
          </span>
        )}
      </div>
      <div className="lg-score__bar" aria-hidden="true">
        {ordered.map((team, index) => (
          <span
            key={team.id}
            className="lg-score__fill"
            style={{
              width: `${pct(team.tiles)}%`,
              background: team.color,
              marginLeft: index === ordered.length - 1 && ordered.length > 1 ? 'auto' : undefined,
            }}
          />
        ))}
        {state.winConditionType === 'TerritoryPercent' && (
          <span className="lg-score__goalmark" style={{ left: `${state.winConditionValue}%` }} />
        )}
      </div>
    </button>
  );
}
