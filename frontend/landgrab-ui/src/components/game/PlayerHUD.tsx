import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import type { GameDynamics, HexCell, Player } from '../../types/game';
import type { GameIconName } from '../../utils/gameIcons';
import type { AbilityKey, AbilityButtonState, AbilityMode } from '../../types/abilities';
import {
  getTileActionAttackRequirement,
  getTileActionDisabledReasonDetailText,
  getTileActionDisabledReasonText,
} from './tileInteraction';
import type { TileAction, TileActionType } from './tileInteraction';
import { useGameplayStore } from '../../stores/gameplayStore';
import { useUiStore } from '../../stores/uiStore';
import { useSecondTick } from '../../hooks/useSecondTick';
import { AbilityInfoSheet } from './AbilityInfoSheet';
import { GameIcon } from '../common/GameIcon';

/* ═══════════════════════════════════════════════════════════════════════
   PlayerHUD — Unified bottom-of-screen HUD
   ═══════════════════════════════════════════════════════════════════════
   Merges ActionDock (tile context + actions) and AbilityBar (beacon,
   commando) into one persistent bar. One-handed, thumb-friendly,
   designed for players walking around.
   ═══════════════════════════════════════════════════════════════════════ */

interface PlayerHUDProps {
  actions: TileAction[];
  onAction: (actionType: TileActionType) => void;
  currentHex: [number, number] | null;
  targetCell: HexCell | undefined;
  carriedTroops: number;
  playerColor: string;
  hasLocation: boolean;
  myUserId?: string;
  myAllianceId?: string;
  myAllianceName?: string;
  player?: Player;
  dynamics?: GameDynamics;
  onActivateBeacon: ((heading: number) => Promise<boolean> | void) | (() => Promise<boolean> | void);
  onDeactivateBeacon: () => Promise<boolean> | void;
  onActivateTacticalStrike: ((targetQ: number, targetR: number) => Promise<boolean> | void) | (() => Promise<boolean> | void);
  onActivateRallyPoint: () => Promise<boolean> | void;
  onActivateSabotage: () => Promise<boolean> | void;
  onStartDemolish: () => Promise<boolean> | void;
  onStartFortConstruction: () => Promise<boolean> | void;
  guidanceHint?: string | null;
  guidanceVisible?: boolean;
  interactionPrompt?: {
    tone: 'info' | 'error';
    message: string;
  } | null;
}

interface AbilityButtonConfig {
  key: string;
  icon: GameIconName;
  title: string;
  description: string;
  status: string;
  badgeText?: string | null;
  className: string;
  buttonState?: AbilityButtonState;
  accentClassName?: string;
  disabled?: boolean;
  onClick?: () => void;
  role?: AbilityRole;
  abilityKey?: string;
  isPressed?: boolean;
}

type AbilityRole = 'Commander' | 'Scout' | 'Engineer';

const ROLE_ACCENT_CLASSES: Record<AbilityRole, string> = {
  Commander: 'player-hud__ability--commander',
  Scout: 'player-hud__ability--scout',
  Engineer: 'player-hud__ability--engineer',
};

const PLAYER_HUD_TOKEN_STYLES = `
  .player-hud {
    --relation-own: rgba(46, 204, 113, 0.25);
    --relation-team: rgba(52, 152, 219, 0.25);
    --relation-enemy: rgba(231, 76, 60, 0.25);
    --relation-neutral: rgba(177, 204, 220, 0.12);
    --role-commander-accent: rgba(246, 196, 83, 0.82);
    --role-scout-accent: rgba(107, 197, 255, 0.78);
    --role-engineer-accent: rgba(255, 179, 102, 0.8);
    --owner-color-fallback: rgba(177, 204, 220, 0.5);
  }

  .player-hud--own {
    --dock-accent: var(--relation-own);
  }

  .player-hud--team {
    --dock-accent: var(--relation-team);
  }

  .player-hud--enemy {
    --dock-accent: var(--relation-enemy);
  }

  .player-hud--neutral {
    --dock-accent: var(--relation-neutral);
  }

  .player-hud__ability--commander {
    --ability-accent: var(--role-commander-accent);
  }

  .player-hud__ability--scout {
    --ability-accent: var(--role-scout-accent);
  }

  .player-hud__ability--engineer {
    --ability-accent: var(--role-engineer-accent);
  }

  .player-hud__ability--beacon {
    --ability-accent: rgba(120, 190, 255, 0.82);
  }

  .player-hud__ability--beacon-active {
    --ability-accent: rgba(46, 204, 113, 0.92);
  }

  .player-hud__owner-dot--fallback {
    background: var(--owner-color-fallback);
  }
`;

type HexRelation = 'own' | 'team' | 'enemy' | 'neutral';

function getHexRelation(
  cell: HexCell | undefined,
  myUserId?: string,
  myAllianceId?: string,
): HexRelation {
  if (!cell || !cell.ownerId) return 'neutral';
  if (myAllianceId && cell.ownerAllianceId === myAllianceId) return 'team';
  if (cell.ownerId === myUserId) return 'own';
  return 'enemy';
}

const STRATEGIC_ZOOM_THRESHOLD = 14;
const STRATEGIC_ZOOM_DEBOUNCE_MS = 160;

function formatTimeRemaining(until: string | undefined): string | null {
  if (!until) return null;

  const remaining = new Date(until).getTime() - Date.now();
  if (remaining <= 0) return null;

  const minutes = Math.floor(remaining / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function PlayerHUD({
  actions,
  onAction,
  currentHex,
  targetCell,
  carriedTroops,
  playerColor,
  hasLocation,
  myUserId,
  myAllianceId,
  player,
  dynamics,
  onActivateBeacon,
  onActivateTacticalStrike,
  onActivateRallyPoint,
  onActivateSabotage,
  onStartDemolish,
  onStartFortConstruction,
  guidanceHint,
  guidanceVisible = false,
  interactionPrompt,
}: PlayerHUDProps) {
  const { t, i18n } = useTranslation();
  const abilityUi = useGameplayStore((state) => state.abilityUi);
  const enterAbilityMode = useGameplayStore((state) => state.enterAbilityMode);
  const showAbilityCard = useGameplayStore((state) => state.showAbilityCard);
  const zoomLevel = useUiStore((state) => state.zoomLevel);
  const [, setTick] = useState(0);
  const [infoSheet, setInfoSheet] = useState<{ role: AbilityRole; abilityKey: string } | null>(null);
  const [isStrategicZoom, setIsStrategicZoom] = useState(() => zoomLevel < STRATEGIC_ZOOM_THRESHOLD);
  const [isStrategicExpanded, setIsStrategicExpanded] = useState(false);
  const longPressTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const longPressTriggeredRef = useRef(false);

  const showBeacon = Boolean(dynamics?.beaconEnabled);
  const rolesEnabled = Boolean(dynamics?.playerRolesEnabled);
  const currentPlayer = player ?? null;
  const selectedCell = targetCell;
  const tacticalStrikeTime = formatTimeRemaining(player?.tacticalStrikeExpiry);
  const tacticalStrikeCooldownTime = formatTimeRemaining(player?.tacticalStrikeCooldownUntil);
  const rallyPointCooldownTime = formatTimeRemaining(player?.rallyPointCooldownUntil);
  const commandoCooldownTime = formatTimeRemaining(player?.commandoRaidCooldownUntil);
  const sabotageCooldownTime = formatTimeRemaining(player?.sabotageCooldownUntil);
  const demolishCooldownTime = formatTimeRemaining(player?.demolishCooldownUntil);
  const demolishProgressTime = null; // Physical presence moves away from time based tracking
  const hasActiveCountdown = [
    tacticalStrikeTime,
    tacticalStrikeCooldownTime,
    rallyPointCooldownTime,
    commandoCooldownTime,
    sabotageCooldownTime,
    demolishProgressTime,
    demolishCooldownTime,
  ].some((value) => value !== null);

  useSecondTick(() => {
    if (!hasActiveCountdown) {
      return;
    }

    setTick((tick) => tick + 1);
  });

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      const nextIsStrategicZoom = zoomLevel < STRATEGIC_ZOOM_THRESHOLD;
      setIsStrategicZoom(nextIsStrategicZoom);

      if (!nextIsStrategicZoom) {
        setIsStrategicExpanded(false);
      }
    }, STRATEGIC_ZOOM_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [zoomLevel]);

  const hasActions = actions.length > 0;
  const firstDisabledAction = actions.find((action) => !action.enabled && action.disabledReason);
  const disabledReasonText = getTileActionDisabledReasonText(
    t,
    firstDisabledAction?.disabledReason,
    firstDisabledAction?.disabledReasonParams,
  );
  const disabledReasonTitle = getTileActionDisabledReasonDetailText(
    t,
    firstDisabledAction?.disabledReason,
    firstDisabledAction?.disabledReasonParams,
  ) ?? disabledReasonText;
  const attackRequirement = getTileActionAttackRequirement(firstDisabledAction);
  const emptyReason: 'noLocation' | 'outsideGrid' | 'noActions' = !hasLocation
    ? 'noLocation'
    : !currentHex
      ? 'outsideGrid'
      : 'noActions';
  const selectedIsEnemy = Boolean(
    selectedCell?.ownerId != null
    && currentPlayer
    && selectedCell.ownerId !== currentPlayer.id
    && (!currentPlayer.allianceId || selectedCell.ownerAllianceId !== currentPlayer.allianceId)
  );

  const relation = getHexRelation(targetCell, myUserId, myAllianceId);

  const formatStatus = (statusKey: 'activate' | 'active' | 'cooldown' | 'inProgress', time?: string | null): string => {
    const label = t(`roles.status.${statusKey}` as never);
    return time ? `${label} (${time})` : label;
  };

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  useEffect(() => clearLongPressTimer, []);

  const handleAbilityPointerDown = (ability: AbilityButtonConfig) => {
    if (!ability.role || !ability.abilityKey) {
      return;
    }

    const { role, abilityKey } = ability;

    longPressTriggeredRef.current = false;
    clearLongPressTimer();
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTriggeredRef.current = true;
      setInfoSheet({ role, abilityKey });
    }, 500);
  };

  const handleAbilityPointerEnd = () => {
    clearLongPressTimer();
  };

  const handleAbilityClick = (ability: AbilityButtonConfig) => {
    if (longPressTriggeredRef.current) {
      longPressTriggeredRef.current = false;
      return;
    }

    if (ability.disabled || !ability.onClick) {
      return;
    }

    ability.onClick();
  };

  const getAbilityButtonState = (
    abilityKey: AbilityKey,
    isServerActive: boolean,
    isServerInProgress: boolean,
    isServerCooldown: boolean,
    isBlocked: boolean = false
  ): AbilityButtonState => {
    if (abilityUi.activeAbility === abilityKey) {
      if (abilityUi.mode === 'inProgress') return 'inProgress';
      if (abilityUi.mode === 'active') return 'active';
      if (abilityUi.mode === 'targeting' || abilityUi.mode === 'confirming') return 'targeting';
    }

    if (isServerInProgress) return 'inProgress';
    if (isServerActive) return 'active';
    if (isServerCooldown) return 'cooldown';
    if (isBlocked) return 'blocked';

    return 'ready';
  };

  const getAbilityAction = (
    abilityKey: AbilityKey,
    state: AbilityButtonState,
    fallbackAction: unknown,
    initialMode: AbilityMode,
    isToggle: boolean = false,
    focusPreset: 'none' | 'player' | 'strategicTargeting' | 'localTracking' = 'none'
  ) => {
    if (state === 'cooldown' || state === 'blocked') {
      return undefined;
    }

    if (state === 'active' || state === 'inProgress' || state === 'targeting') {
      return () => {
        if (abilityUi.activeAbility === abilityKey) {
          showAbilityCard();
          return;
        }

        const reopenMode: AbilityMode = state === 'inProgress'
          ? 'inProgress'
          : state === 'active'
            ? 'active'
            : 'targeting';

        enterAbilityMode(abilityKey, reopenMode, focusPreset, { cardVisible: true });
      };
    }

    return () => {
      if (isToggle) {
        enterAbilityMode(abilityKey, initialMode, focusPreset);
        (fallbackAction as () => void)();
      } else {
        enterAbilityMode(abilityKey, initialMode, focusPreset);
      }
    };
  };

  const abilityButtons: AbilityButtonConfig[] = [];

  if (rolesEnabled && player?.role === 'Commander') {
    const tacticalStrikeActive = Boolean(player.tacticalStrikeActive && tacticalStrikeTime);
    const tacticalStrikeOnCooldown = !tacticalStrikeActive && tacticalStrikeCooldownTime !== null;
    const tacticalStrikeState = getAbilityButtonState('tacticalStrike', tacticalStrikeActive, false, tacticalStrikeOnCooldown);

    abilityButtons.push({
      key: 'tactical-strike',
      icon: 'lightning',
      title: t('roles.Commander.abilities.tacticalStrike.title' as never),
      description: t('roles.Commander.abilities.tacticalStrike.description' as never),
      status: tacticalStrikeState === 'active'
        ? formatStatus('active', tacticalStrikeTime)
        : tacticalStrikeState === 'cooldown'
          ? formatStatus('cooldown', tacticalStrikeCooldownTime)
          : formatStatus('activate'),
      badgeText: tacticalStrikeState === 'active' ? tacticalStrikeTime : tacticalStrikeCooldownTime,
      className: `player-hud__ability ${tacticalStrikeState === 'active' ? 'player-hud__ability--active' : ''} ${tacticalStrikeState === 'cooldown' ? 'player-hud__ability--cooldown' : ''} ${tacticalStrikeState === 'targeting' ? 'player-hud__ability--targeting' : ''}`,
      buttonState: tacticalStrikeState,
      accentClassName: ROLE_ACCENT_CLASSES.Commander,
      disabled: tacticalStrikeState === 'cooldown' || tacticalStrikeState === 'blocked',
      onClick: getAbilityAction('tacticalStrike', tacticalStrikeState, onActivateTacticalStrike, 'confirming'),
      role: 'Commander',
      abilityKey: 'tacticalStrike',
    });

    const rallyActive = Boolean(player.rallyPointActive);
    const rallyOnCooldown = !rallyActive && rallyPointCooldownTime !== null;
    const rallyState = getAbilityButtonState('rallyPoint', rallyActive, false, rallyOnCooldown);

    abilityButtons.push({
      key: 'rally-point',
      icon: 'rallyTroops',
      title: t('roles.Commander.abilities.reinforce.title' as never),
      description: t('roles.Commander.abilities.reinforce.description' as never),
      status: rallyState === 'active'
        ? formatStatus('active', formatTimeRemaining(player.rallyPointDeadline))
        : rallyState === 'cooldown'
          ? formatStatus('cooldown', rallyPointCooldownTime)
          : formatStatus('activate'),
      badgeText: rallyState === 'active' ? formatTimeRemaining(player.rallyPointDeadline) : rallyPointCooldownTime,
      className: `player-hud__ability ${rallyState === 'active' ? 'player-hud__ability--active' : ''} ${rallyState === 'cooldown' ? 'player-hud__ability--cooldown' : ''} ${rallyState === 'targeting' ? 'player-hud__ability--targeting' : ''}`,
      buttonState: rallyState,
      accentClassName: ROLE_ACCENT_CLASSES.Commander,
      disabled: rallyState === 'cooldown' || rallyState === 'blocked',
      onClick: getAbilityAction('rallyPoint', rallyState, onActivateRallyPoint, 'confirming'),
      role: 'Commander',
      abilityKey: 'rallyPoint',
    });

    const commandoOnCooldown = commandoCooldownTime !== null;
    // We remove the old commandoTargetingMode override in favor of unified state
    const commandoState = getAbilityButtonState('commandoRaid', false, false, commandoOnCooldown);

    abilityButtons.push({
      key: 'commando-raid',
      icon: 'archeryTarget',
      title: t('roles.Commander.abilities.commandoRaid.title' as never),
      description: t('roles.Commander.abilities.commandoRaid.description' as never),
      status: commandoState === 'targeting'
        ? t('phase6.commandoSelectTarget' as never)
        : commandoState === 'cooldown'
          ? formatStatus('cooldown', commandoCooldownTime)
          : formatStatus('activate'),
      badgeText: commandoCooldownTime,
      className: `player-hud__ability ${commandoState === 'cooldown' ? 'player-hud__ability--cooldown' : ''} ${commandoState === 'targeting' ? 'player-hud__ability--targeting' : ''}`,
      buttonState: commandoState,
      accentClassName: ROLE_ACCENT_CLASSES.Commander,
      disabled: commandoState === 'cooldown' || commandoState === 'blocked',
      onClick: getAbilityAction('commandoRaid', commandoState, () => undefined, 'targeting', false, 'strategicTargeting'),
      role: 'Commander',
      abilityKey: 'commandoRaid',
    });
  }

  if (rolesEnabled && player?.role === 'Engineer') {
    const demolishInProgress = player.demolishTargetKey != null;
    const demolishOnCooldown = !demolishInProgress && demolishCooldownTime !== null;
    const demolishProgressText = demolishInProgress ? `${player.demolishApproachDirectionsMade?.length ?? 0}/3` : null;
    const demolishState = getAbilityButtonState('demolish', false, demolishInProgress, demolishOnCooldown);

    const sabotageInProgress = player.sabotageTargetQ != null && player.sabotageTargetR != null;
    const sabotageOnCooldown = !sabotageInProgress && sabotageCooldownTime !== null;
    const sabotageProgressText = sabotageInProgress ? `${player.sabotagePerimeterVisited?.length ?? 0}/3` : null;
    const sabotageState = getAbilityButtonState('sabotage', false, sabotageInProgress, sabotageOnCooldown);

    const fortInProgress = player.fortTargetQ != null && player.fortTargetR != null;
    const fortProgressText = fortInProgress ? `${player.fortPerimeterVisited?.length ?? 0}/6` : null;
    const fortState = getAbilityButtonState('fortConstruction', false, fortInProgress, false);

    abilityButtons.push({
      key: 'fortConstruction',
      icon: 'fort',
      title: t('roles.Engineer.abilities.fortConstruction.title' as never),
      description: t('roles.Engineer.abilities.fortConstruction.description' as never),
      status: fortState === 'inProgress' ? formatStatus('inProgress', fortProgressText) : formatStatus('activate'),
      badgeText: fortProgressText,
      className: `player-hud__ability ${fortState === 'inProgress' ? 'player-hud__ability--active' : ''} ${fortState === 'targeting' ? 'player-hud__ability--targeting' : ''}`,
      buttonState: fortState,
      accentClassName: ROLE_ACCENT_CLASSES.Engineer,
      disabled: fortState === 'blocked',
      onClick: getAbilityAction('fortConstruction', fortState, onStartFortConstruction, 'targeting', false, 'localTracking'),
      role: 'Engineer',
      abilityKey: 'fortConstruction',
    });

    abilityButtons.push({
      key: 'sabotage',
      icon: 'wrench',
      title: t('roles.Engineer.abilities.sabotage.title' as never),
      description: t('roles.Engineer.abilities.sabotage.description' as never),
      status: sabotageState === 'inProgress'
        ? formatStatus('inProgress', sabotageProgressText)
        : sabotageState === 'cooldown'
          ? formatStatus('cooldown', sabotageCooldownTime)
          : formatStatus('activate'),
      badgeText: sabotageInProgress ? sabotageProgressText : sabotageCooldownTime,
      className: `player-hud__ability ${sabotageState === 'inProgress' ? 'player-hud__ability--active' : ''} ${sabotageState === 'cooldown' ? 'player-hud__ability--cooldown' : ''} ${sabotageState === 'targeting' ? 'player-hud__ability--targeting' : ''}`,
      buttonState: sabotageState,
      accentClassName: ROLE_ACCENT_CLASSES.Engineer,
      disabled: sabotageState === 'cooldown' || sabotageState === 'blocked',
      onClick: getAbilityAction('sabotage', sabotageState, onActivateSabotage, 'targeting', false, 'localTracking'),
      role: 'Engineer',
      abilityKey: 'sabotage',
    });

    abilityButtons.push({
      key: 'demolish',
      icon: 'hammerDrop',
      title: t('roles.Engineer.abilities.demolish.title' as never),
      description: t('roles.Engineer.abilities.demolish.description' as never),
      status: demolishState === 'inProgress'
        ? formatStatus('inProgress', demolishProgressText)
        : demolishState === 'cooldown'
          ? formatStatus('cooldown', demolishCooldownTime)
          : formatStatus('activate'),
      badgeText: demolishInProgress ? demolishProgressText : demolishCooldownTime,
      className: `player-hud__ability ${demolishState === 'inProgress' ? 'player-hud__ability--active' : ''} ${demolishState === 'cooldown' ? 'player-hud__ability--cooldown' : ''} ${demolishState === 'targeting' ? 'player-hud__ability--targeting' : ''}`,
      buttonState: demolishState,
      accentClassName: ROLE_ACCENT_CLASSES.Engineer,
      disabled: demolishState === 'cooldown' || demolishState === 'blocked',
      onClick: getAbilityAction('demolish', demolishState, onStartDemolish, 'targeting', false, 'localTracking'),
      role: 'Engineer',
      abilityKey: 'demolish',
    });
  }

  if (player?.role === 'Scout') {
    const interceptState = getAbilityButtonState('intercept', false, false, false);
    
    // Check ambient alert for Scout
    const isSabotageAlert = !!player.sabotageAlertNearby; // ensure boolean

    abilityButtons.push({
      key: 'intercept',
      icon: 'radioTower',
      title: t('roles.Scout.abilities.intercept.title' as never, 'Intercept'),
      description: t('roles.Scout.abilities.intercept.description' as never, 'Scan for enemy signals'),
      status: isSabotageAlert ? t('abilities.intercept.alert', 'SIGNAL DETECTED!') : formatStatus('activate'),
      className: `player-hud__ability ${isSabotageAlert ? 'player-hud__ability--active' : ''}`,
      buttonState: interceptState,
      accentClassName: ROLE_ACCENT_CLASSES.Scout,
      disabled: false,
      onClick: getAbilityAction('intercept', interceptState, () => {}, 'confirming', false, 'none'),
      role: 'Scout',
      abilityKey: 'intercept',
    });
  }

  if (showBeacon && player) {
    const beaconState = getAbilityButtonState('beacon', player.isBeacon ?? false, false, false);
    
    abilityButtons.push({
      key: 'beacon',
      icon: 'radioTower',
      title: t('phase5.beacon' as never),
      description: t('phase5.beaconDesc' as never),
      status: beaconState === 'active' ? formatStatus('active') : formatStatus('activate'),
      className: `player-hud__ability player-hud__ability--beacon ${beaconState === 'active' ? 'player-hud__ability--active player-hud__ability--beacon-active' : ''}`,
      buttonState: beaconState,
      accentClassName: 'player-hud__ability--beacon',
      onClick: getAbilityAction('beacon', beaconState, onActivateBeacon, 'confirming'),
      isPressed: beaconState === 'active',
      role: undefined, // default
      abilityKey: 'beacon',
    });
  }

  const isCollapsedForZoom = isStrategicZoom && !isStrategicExpanded;
  const persistentAbilityButtons = abilityButtons.filter((ability) => (ability.buttonState ?? 'ready') !== 'ready');
  const visibleAbilityButtons = isCollapsedForZoom ? persistentAbilityButtons : abilityButtons;
  const hasAbilities = abilityButtons.length > 0;
  const hasVisibleAbilities = visibleAbilityButtons.length > 0;
  const showCompactIdle = !isCollapsedForZoom && !hasActions && !hasAbilities;
  const showIdlePrompt = !isCollapsedForZoom && !hasActions && Boolean(interactionPrompt?.message);
  const showIdleGuidance = !isCollapsedForZoom && !hasActions && !showIdlePrompt && Boolean(guidanceHint);
  const showIdleContext = showIdlePrompt || showIdleGuidance;
  const suppressTileActions = abilityUi.mode === 'targeting' || abilityUi.mode === 'confirming';
  const strategicToggleLabel = isCollapsedForZoom
    ? t('game.hudTapToExpand' as never)
    : t('game.hudTapToCollapse' as never);
  const numberFormatter = useMemo(() => new Intl.NumberFormat(i18n.resolvedLanguage, {
    notation: 'compact',
    compactDisplay: 'short',
    maximumFractionDigits: 1,
  }), [i18n.resolvedLanguage]);
  const formattedCarriedTroops = useMemo(() => numberFormatter.format(carriedTroops), [carriedTroops, numberFormatter]);
  const attackRequirementRatio = attackRequirement
    ? Math.max(0, Math.min(attackRequirement.current / attackRequirement.required, 1))
    : 0;
  const attackRequirementTone = attackRequirementRatio >= 1
    ? 'ready'
    : attackRequirementRatio >= 0.8
      ? 'close'
      : 'low';
  void playerColor;

  return (
    <>
      <style>{PLAYER_HUD_TOKEN_STYLES}</style>
      <div
        className={[
          'player-hud',
          hasActions ? 'player-hud--active' : 'player-hud--idle',
          showCompactIdle ? 'player-hud--compact' : '',
          isStrategicZoom ? 'player-hud--zoom-strategic' : '',
          isCollapsedForZoom ? 'player-hud--collapsed' : '',
          selectedIsEnemy ? 'player-hud--enemy' : '',
          `player-hud--${relation}`,
        ].filter(Boolean).join(' ')}
      >
        {isStrategicZoom && (
          <div className="player-hud__zoom-summary">
            {carriedTroops > 0 ? (
              <span
                className="player-hud__carried player-hud__carried--strategic"
                aria-label={t('game.carriedTroops')}
                title={t('game.carriedTroops')}
              >
                <span className="player-hud__carried-icon" aria-hidden="true">
                  <GameIcon name="chest" size="sm" />
                </span>
                <span className="player-hud__carried-count">{formattedCarriedTroops}</span>
              </span>
            ) : (
              <span className="player-hud__zoom-summary-spacer" aria-hidden="true" />
            )}

            <button
              type="button"
              className="player-hud__zoom-toggle"
              onClick={() => setIsStrategicExpanded((expanded) => !expanded)}
              aria-label={strategicToggleLabel}
              title={strategicToggleLabel}
            >
              <span className="player-hud__zoom-toggle-label">{strategicToggleLabel}</span>
              <span className="player-hud__zoom-toggle-chevron" aria-hidden="true">⌃</span>
            </button>
          </div>
        )}

        {!isCollapsedForZoom && hasVisibleAbilities && (
          <div className="player-hud__modules-row player-hud__abilities">
            {visibleAbilityButtons.map((ability) => (
              <button
                key={ability.key}
                type="button"
                className={`${ability.className} ${ability.accentClassName ?? ''}`.trim()}
                disabled={ability.disabled}
                onClick={() => handleAbilityClick(ability)}
                onPointerDown={() => handleAbilityPointerDown(ability)}
                onPointerUp={handleAbilityPointerEnd}
                onPointerCancel={handleAbilityPointerEnd}
                onPointerLeave={handleAbilityPointerEnd}
                onContextMenu={(e) => e.preventDefault()}
                aria-label={`${ability.role ? `${ability.role}: ` : ''}${ability.title}. ${ability.status}`}
                {...(ability.isPressed !== undefined ? { 'aria-pressed': ability.isPressed } : {})}
                title={`${ability.title} — ${ability.status}`}
              >
                <span className="player-hud__ability-circle" aria-hidden="true">
                  <span className="player-hud__ability-icon">
                    <GameIcon name={ability.icon} />
                  </span>
                  {ability.badgeText && (
                    <span className={`player-hud__ability-badge player-hud__ability-badge--${ability.buttonState ?? 'ready'}`}>
                      {ability.badgeText}
                    </span>
                  )}
                  {ability.buttonState === 'targeting' && <span className="player-hud__ability-targeting-indicator" />}
                </span>
                <span className="player-hud__ability-label">{ability.title}</span>
              </button>
            ))}
          </div>
        )}

        {!isCollapsedForZoom && !suppressTileActions && (hasActions || selectedCell) && (
          <div className="player-hud__primary-row player-hud__tile-actions">
            {actions.map((action) => (
              (() => {
                const actionTitle = !action.enabled
                  ? getTileActionDisabledReasonDetailText(t, action.disabledReason, action.disabledReasonParams)
                    ?? getTileActionDisabledReasonText(t, action.disabledReason, action.disabledReasonParams)
                    ?? undefined
                  : undefined;
                const actionDisabledReason = !action.enabled
                  ? getTileActionDisabledReasonText(t, action.disabledReason, action.disabledReasonParams)
                  : null;

                return (
                  <button
                    key={action.type}
                    className={`player-hud__btn tile-action-btn tone-${action.tone} player-hud__btn--${action.tone}`}
                    disabled={!action.enabled}
                    onClick={() => onAction(action.type)}
                    aria-label={t(action.label as never)}
                    title={actionTitle}
                  >
                    <span className="player-hud__btn-icon" aria-hidden>
                      <GameIcon name={action.icon} />
                    </span>
                    <span className="player-hud__btn-label">
                      {t(action.label as never)}
                    </span>
                    {!action.enabled && actionDisabledReason && (
                      <span className="btn-disabled-reason">
                        {actionDisabledReason}
                      </span>
                    )}
                    {!action.enabled && (
                      <span className={`player-hud__btn-locked ${action.type === 'attack' ? 'player-hud__btn-locked--attack' : ''}`} aria-hidden>
                        {action.type === 'attack' ? <AttackLockGlyph /> : <GameIcon name="shield" size="sm" />}
                      </span>
                    )}
                  </button>
                );
              })()
            ))}
          </div>
        )}

        {!isCollapsedForZoom && !suppressTileActions && hasActions && disabledReasonText && (
          attackRequirement ? (
            <div
              className={[
                'player-hud__disabled-reason',
                'player-hud__disabled-reason--comparison',
                `player-hud__disabled-reason--${attackRequirementTone}`,
              ].join(' ')}
              title={disabledReasonTitle ?? undefined}
            >
              <span className="player-hud__disabled-reason-title">{disabledReasonText}</span>
              <div className="player-hud__attack-comparison-summary" aria-hidden="true">
                <span className="player-hud__attack-comparison-metric player-hud__attack-comparison-metric--current">
                  <span className="player-hud__attack-comparison-icon">
                    <GameIcon name="helmet" size="sm" />
                  </span>
                  <span>{attackRequirement.current}</span>
                </span>
                <span className="player-hud__attack-comparison-separator">/</span>
                <span className="player-hud__attack-comparison-metric player-hud__attack-comparison-metric--required">
                  <span className="player-hud__attack-comparison-icon">
                    <GameIcon name="shield" size="sm" />
                  </span>
                  <span>{attackRequirement.required}</span>
                </span>
              </div>
              <meter
                className="player-hud__attack-comparison-meter"
                min={0}
                max={attackRequirement.required}
                value={attackRequirement.current}
              />
            </div>
          ) : (
            <div className="player-hud__disabled-reason" title={disabledReasonTitle ?? undefined}>
              {disabledReasonText}
            </div>
          )
        )}

        {!isCollapsedForZoom && !hasActions && showIdleContext && (
          <div
            className={[
              'player-hud__idle-context',
              showIdlePrompt ? 'player-hud__idle-context--prompt' : 'player-hud__idle-context--guidance',
              interactionPrompt?.tone === 'error' ? 'player-hud__idle-context--danger' : '',
              showIdlePrompt || guidanceVisible ? 'enter-active' : '',
            ].filter(Boolean).join(' ')}
          >
            <span className="player-hud__idle-icon" aria-hidden="true">
              <GameIcon name={showIdlePrompt ? (interactionPrompt?.tone === 'error' ? 'shield' : 'compass') : 'lightning'} size="sm" />
            </span>
            <span className="player-hud__idle-text">
              {showIdlePrompt ? interactionPrompt?.message : guidanceHint}
            </span>
          </div>
        )}

        {infoSheet && createPortal(
          (() => {
            const matchedAbility = abilityButtons.find(a => a.abilityKey === infoSheet.abilityKey);
            return (
              <AbilityInfoSheet
                role={infoSheet.role}
                abilityKey={infoSheet.abilityKey}
                onClose={() => setInfoSheet(null)}
                stateTone={(matchedAbility?.buttonState === 'ready' || matchedAbility?.buttonState === 'blocked') ? 'standby' : (matchedAbility?.buttonState ?? 'standby') as 'standby' | 'active' | 'cooldown' | 'targeting' | 'inProgress'}
                badgeText={matchedAbility?.badgeText}
                disabled={matchedAbility?.disabled ?? false}
                onActivate={matchedAbility?.onClick}
              />
            );
          })(),
          document.body
        )}

        {!isCollapsedForZoom && !hasActions && !hasAbilities && !showIdleContext && (
          <div className="player-hud__empty">
            {emptyReason === 'noLocation' && (
              <>
                <span className="player-hud__empty-icon"><GameIcon name="pin" /></span>
                <span>{t('game.dock.noLocation')}</span>
              </>
            )}
            {emptyReason === 'outsideGrid' && (
              <>
                <span className="player-hud__empty-icon"><GameIcon name="treasureMap" /></span>
                <span>{t('game.dock.outsideGrid')}</span>
              </>
            )}
            {emptyReason === 'noActions' && (
              <>
                <span className="player-hud__empty-icon"><GameIcon name="flag" /></span>
                <span>{t('game.dock.noActions')}</span>
              </>
            )}
          </div>
        )}
      </div>
    </>
  );
}

function AttackLockGlyph() {
  return (
    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className="player-hud__lock-glyph">
      <path d="M4.75 7V5.75a3.25 3.25 0 1 1 6.5 0V7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <rect x="3.25" y="7" width="9.5" height="6" rx="2" fill="currentColor" fillOpacity="0.18" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="8" cy="10" r="1" fill="currentColor" />
    </svg>
  );
}
