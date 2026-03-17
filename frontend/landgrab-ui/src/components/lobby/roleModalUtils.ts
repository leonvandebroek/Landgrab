import type { PlayerRole } from '../../types/game';
import type { GameIconName } from '../../utils/gameIcons';

export type RoleModalRole = Exclude<PlayerRole, 'None'>;

export interface RoleAbility {
    key: string;
    icon: GameIconName;
    type: 'passive' | 'active';
}

export const ROLE_EMOJIS: Record<RoleModalRole, GameIconName> = {
    Commander: 'rallyTroops',
    Scout: 'compass',
    Defender: 'barricade',
    Engineer: 'gearHammer',
};

export const ROLE_ABILITIES: Record<RoleModalRole, RoleAbility[]> = {
    Commander: [
        { key: 'warBonus', icon: 'master', type: 'passive' },
        { key: 'tacticalStrike', icon: 'lightning', type: 'active' },
        { key: 'reinforce', icon: 'rallyTroops', type: 'active' },
    ],
    Scout: [
        { key: 'extendedVision', icon: 'compass', type: 'passive' },
        { key: 'firstStrike', icon: 'archeryTarget', type: 'passive' },
        { key: 'commandoRaid', icon: 'crossbow', type: 'active' },
    ],
    Defender: [
        { key: 'presenceShield', icon: 'shield', type: 'passive' },
        { key: 'shieldWall', icon: 'shieldWall', type: 'active' },
        { key: 'lastStand', icon: 'biceps', type: 'passive' },
    ],
    Engineer: [
        { key: 'fortConstruction', icon: 'gearHammer', type: 'passive' },
        { key: 'emergencyRepair', icon: 'wrench', type: 'active' },
        { key: 'demolish', icon: 'fist', type: 'active' },
    ],
};

export const ROLE_CARDS = [
    { role: 'Commander', emoji: ROLE_EMOJIS.Commander, abilities: ROLE_ABILITIES.Commander },
    { role: 'Scout', emoji: ROLE_EMOJIS.Scout, abilities: ROLE_ABILITIES.Scout },
    { role: 'Defender', emoji: ROLE_EMOJIS.Defender, abilities: ROLE_ABILITIES.Defender },
    { role: 'Engineer', emoji: ROLE_EMOJIS.Engineer, abilities: ROLE_ABILITIES.Engineer },
] as const;

export function isRoleModalRole(role: PlayerRole | null | undefined): role is RoleModalRole {
    return role === 'Commander' || role === 'Scout' || role === 'Defender' || role === 'Engineer';
}