/**
 * Ability registry — maps every AbilityKey to its metadata and card component.
 *
 * Adding a new ability requires:
 *   1. Adding the AbilityKey union member in src/types/abilities.ts
 *   2. Creating the card component in src/components/game/abilities/
 *   3. Adding one entry here
 *
 * PlayingHud, GameView, and App.tsx require zero changes for new abilities.
 */
import type { ComponentType } from 'react';
import type { AbilityKey, AbilityCardProps, MapFocusPreset } from '../types/abilities';
import { BeaconCard } from '../components/game/abilities/BeaconCard';
import { ShareIntelCard } from '../components/game/abilities/ShareIntelCard';
import { TacticalStrikeCard } from '../components/game/abilities/TacticalStrikeCard';
import { RallyPointCard } from '../components/game/abilities/RallyPointCard';
import { CommandoRaidCard } from '../components/game/abilities/CommandoRaidCard';
import { FortConstructionCard } from '../components/game/abilities/FortConstructionCard';
import { SabotageCard } from '../components/game/abilities/SabotageCard';
import { DemolishCard } from '../components/game/abilities/DemolishCard';
import { InterceptCard } from '../components/game/abilities/InterceptCard';
import { TroopTransferCard } from '../components/game/abilities/TroopTransferCard';
import { FieldBattleCard } from '../components/game/abilities/FieldBattleCard';

export type PlayerRoleValue = 'None' | 'Commander' | 'Scout' | 'Engineer';

export interface AbilityRegistryEntry {
  /** The SignalR hub method name that activates this ability. */
  hubMethod: string;
  /** Roles for which this ability's card and button should appear. Empty = role-agnostic (all roles). */
  roles: PlayerRoleValue[];
  /** i18n translation key for the ability title. */
  titleKey: string;
  /** Map focus mode when this ability is active. */
  mapFocusPreset: MapFocusPreset;
  /** The card component. Receives AbilityCardProps; reads all other state from stores. */
  Card: ComponentType<AbilityCardProps>;
}

export const abilityRegistry: Record<AbilityKey, AbilityRegistryEntry> = {
  beacon: {
    hubMethod: 'ActivateBeacon',
    roles: ['Scout'],
    titleKey: 'abilities.beacon.title',
    mapFocusPreset: 'localTracking',
    Card: BeaconCard,
  },
  shareIntel: {
    hubMethod: 'ShareBeaconIntel',
    roles: ['Scout'],
    titleKey: 'abilities.shareIntel.title',
    mapFocusPreset: 'none',
    Card: ShareIntelCard,
  },
  tacticalStrike: {
    hubMethod: 'ActivateTacticalStrike',
    roles: ['Commander'],
    titleKey: 'abilities.tacticalStrike.title',
    mapFocusPreset: 'strategicTargeting',
    Card: TacticalStrikeCard,
  },
  rallyPoint: {
    hubMethod: 'ActivateRallyPoint',
    roles: ['Commander'],
    titleKey: 'abilities.rallyPoint.title',
    mapFocusPreset: 'localTracking',
    Card: RallyPointCard,
  },
  commandoRaid: {
    hubMethod: 'ActivateCommandoRaid',
    roles: ['Commander'],
    titleKey: 'abilities.commandoRaid.title',
    mapFocusPreset: 'strategicTargeting',
    Card: CommandoRaidCard,
  },
  fortConstruction: {
    hubMethod: 'StartFortConstruction',
    roles: ['Engineer'],
    titleKey: 'abilities.fortConstruction.title',
    mapFocusPreset: 'localTracking',
    Card: FortConstructionCard,
  },
  sabotage: {
    hubMethod: 'ActivateSabotage',
    roles: ['Engineer'],
    titleKey: 'abilities.sabotage.title',
    mapFocusPreset: 'localTracking',
    Card: SabotageCard,
  },
  demolish: {
    hubMethod: 'StartDemolish',
    roles: ['Engineer'],
    titleKey: 'abilities.demolish.title',
    mapFocusPreset: 'localTracking',
    Card: DemolishCard,
  },
  intercept: {
    hubMethod: 'AttemptIntercept',
    roles: ['Scout'],
    titleKey: 'abilities.intercept.title',
    mapFocusPreset: 'localTracking',
    Card: InterceptCard,
  },
  troopTransfer: {
    hubMethod: 'InitiateTroopTransfer',
    roles: [],  // role-agnostic
    titleKey: 'abilities.troopTransfer.title',
    mapFocusPreset: 'none',
    Card: TroopTransferCard,
  },
  fieldBattle: {
    hubMethod: 'InitiateFieldBattle',
    roles: [],  // role-agnostic
    titleKey: 'abilities.fieldBattle.title',
    mapFocusPreset: 'none',
    Card: FieldBattleCard,
  },
};

/** Returns the ability keys available to the given role (role-agnostic abilities always included). */
export function abilitiesForRole(role: PlayerRoleValue): AbilityKey[] {
  return (Object.keys(abilityRegistry) as AbilityKey[]).filter((key) => {
    const entry = abilityRegistry[key];
    return entry.roles.length === 0 || entry.roles.includes(role);
  });
}
