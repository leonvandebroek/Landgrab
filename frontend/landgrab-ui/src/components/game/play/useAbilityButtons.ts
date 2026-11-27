import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { GameState, Player } from '../../../types/game';
import type { AbilityKey, AbilityMode, MapFocusPreset } from '../../../types/abilities';
import { useGameplayStore } from '../../../stores/gameplayStore';
import { useSecondTick } from '../../../hooks/useSecondTick';
import type { IconName } from '../../ui/Icon';

export type AbilityTone = 'ready' | 'running' | 'targeting' | 'cooldown' | 'alert';

export interface AbilityButton {
  key: AbilityKey;
  icon: IconName;
  /** One short word for the button. */
  label: string;
  /** Short second line: "Ready", "4:12", "4 of 6". */
  stateText: string;
  tone: AbilityTone;
  disabled: boolean;
  onClick: () => void;
  /** Text for the mission chip under the score bar, when the ability is running. */
  chip?: string;
  chipTime?: string | null;
}

export function formatCountdown(until: string | null | undefined, now = Date.now()): string | null {
  if (!until) return null;
  const remaining = new Date(until).getTime() - now;
  if (!Number.isFinite(remaining) || remaining <= 0) return null;
  const minutes = Math.floor(remaining / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

interface Spec {
  key: AbilityKey;
  icon: IconName;
  running: boolean;
  cooldownUntil?: string | null;
  initialMode: AbilityMode;
  focus: MapFocusPreset;
  runningText?: string | null;
  chip?: string;
  chipTime?: string | null;
  alert?: boolean;
}

/**
 * The role abilities a player can use right now, as short buttons for the
 * ability dock. Tapping one opens its card in the bottom sheet.
 */
export function useAbilityButtons(player: Player | null | undefined, state: GameState | null): AbilityButton[] {
  const { t } = useTranslation();
  const abilityUi = useGameplayStore((store) => store.abilityUi);
  const enterAbilityMode = useGameplayStore((store) => store.enterAbilityMode);
  const showAbilityCard = useGameplayStore((store) => store.showAbilityCard);
  const [now, setNow] = useState(() => Date.now());
  useSecondTick(() => setNow(Date.now()));

  if (!player || !state?.dynamics?.playerRolesEnabled || !player.role || player.role === 'None') {
    return [];
  }

  const specs: Spec[] = [];
  const of = (done: number, total: number) => t('ui.play.progress', { done, total });

  if (player.role === 'Commander') {
    const strikeTime = formatCountdown(player.tacticalStrikeExpiry, now);
    const strikeOn = Boolean(player.tacticalStrikeActive && strikeTime);
    specs.push({
      key: 'tacticalStrike', icon: 'bolt', running: strikeOn,
      cooldownUntil: strikeOn ? null : player.tacticalStrikeCooldownUntil,
      initialMode: 'confirming', focus: 'none',
      runningText: strikeTime, chip: t('ui.play.chips.strike'), chipTime: strikeTime,
    });
    const rallyOn = Boolean(player.rallyPointActive);
    const rallyTime = formatCountdown(player.rallyPointDeadline, now);
    specs.push({
      key: 'rallyPoint', icon: 'rally', running: rallyOn,
      cooldownUntil: rallyOn ? null : player.rallyPointCooldownUntil,
      initialMode: 'confirming', focus: 'none',
      runningText: rallyTime, chip: t('ui.play.chips.rally'), chipTime: rallyTime,
    });
    const raid = state.activeRaids?.find((item) => item.initiatorPlayerId === player.id
      || (player.allianceId != null && item.initiatorAllianceId === player.allianceId));
    const raidTime = raid ? formatCountdown(raid.deadline, now) : null;
    specs.push({
      key: 'commandoRaid', icon: 'target', running: Boolean(raid),
      cooldownUntil: raid ? null : player.commandoRaidCooldownUntil,
      initialMode: 'targeting', focus: 'strategicTargeting',
      runningText: raidTime, chip: t('ui.play.chips.raid'), chipTime: raidTime,
    });
  }

  if (player.role === 'Engineer') {
    const fortOn = player.fortTargetQ != null && player.fortTargetR != null;
    const fortDone = player.fortPerimeterVisited?.length ?? 0;
    specs.push({
      key: 'fortConstruction', icon: 'fort', running: fortOn,
      initialMode: 'targeting', focus: 'localTracking',
      runningText: fortOn ? of(fortDone, 6) : null,
      chip: t('ui.play.chips.fort'), chipTime: of(fortDone, 6),
    });
    const sabotageOn = player.sabotageTargetQ != null && player.sabotageTargetR != null;
    const sabotageDone = player.sabotagePerimeterVisited?.length ?? 0;
    specs.push({
      key: 'sabotage', icon: 'wrench', running: sabotageOn,
      cooldownUntil: sabotageOn ? null : player.sabotageCooldownUntil,
      initialMode: 'targeting', focus: 'localTracking',
      runningText: sabotageOn ? of(sabotageDone, 3) : null,
      chip: t('ui.play.chips.sabotage'), chipTime: of(sabotageDone, 3),
    });
    const demolishOn = player.demolishTargetKey != null;
    const demolishDone = player.demolishApproachDirectionsMade?.length ?? 0;
    specs.push({
      key: 'demolish', icon: 'hammer', running: demolishOn,
      cooldownUntil: demolishOn ? null : player.demolishCooldownUntil,
      initialMode: 'targeting', focus: 'localTracking',
      runningText: demolishOn ? of(demolishDone, 3) : null,
      chip: t('ui.play.chips.demolish'), chipTime: of(demolishDone, 3),
    });
  }

  if (player.role === 'Scout') {
    if (state.dynamics.beaconEnabled) {
      specs.push({
        key: 'beacon', icon: 'radio', running: Boolean(player.isBeacon),
        initialMode: 'confirming', focus: 'none',
        runningText: t('ui.play.on'), chip: t('ui.play.chips.beacon'),
      });
      specs.push({
        key: 'shareIntel', icon: 'share', running: false,
        cooldownUntil: player.shareIntelCooldownUntil,
        initialMode: 'confirming', focus: 'none',
      });
    }
    const alert = Boolean(player.sabotageAlertNearby);
    specs.push({
      key: 'intercept', icon: 'eye', running: false, alert,
      initialMode: 'confirming', focus: 'none',
      chip: alert ? t('ui.play.chips.sabotageNearby') : undefined,
    });
  }

  return specs.map((spec): AbilityButton => {
    const isOpen = abilityUi.activeAbility === spec.key;
    const cooldown = formatCountdown(spec.cooldownUntil, now);
    let tone: AbilityTone = 'ready';
    if (spec.alert) tone = 'alert';
    else if (spec.running || (isOpen && (abilityUi.mode === 'active' || abilityUi.mode === 'inProgress'))) tone = 'running';
    else if (isOpen && (abilityUi.mode === 'targeting' || abilityUi.mode === 'confirming')) tone = 'targeting';
    else if (cooldown) tone = 'cooldown';

    const stateText = tone === 'running'
      ? (spec.runningText ?? t('ui.play.on'))
      : tone === 'targeting'
        ? t('ui.play.choosing')
        : tone === 'cooldown'
          ? cooldown!
          : tone === 'alert'
            ? t('ui.play.now')
            : t('ui.play.ready');

    const onClick = () => {
      if (tone === 'cooldown') return;
      if (isOpen) {
        showAbilityCard();
        return;
      }
      if (tone === 'running') {
        const mode: AbilityMode = spec.key === 'fortConstruction' || spec.key === 'sabotage' || spec.key === 'demolish'
          ? 'inProgress'
          : 'active';
        enterAbilityMode(spec.key, mode, spec.focus, { cardVisible: true });
        return;
      }
      enterAbilityMode(spec.key, spec.initialMode, spec.focus);
    };

    return {
      key: spec.key,
      icon: spec.icon,
      label: t(`ui.play.abilities.${spec.key}` as 'ui.play.abilities.beacon'),
      stateText,
      tone,
      disabled: tone === 'cooldown',
      onClick,
      chip: tone === 'running' || tone === 'alert' ? spec.chip : undefined,
      chipTime: tone === 'running' ? spec.chipTime ?? null : null,
    };
  });
}
