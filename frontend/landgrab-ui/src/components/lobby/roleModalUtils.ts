import type { PlayerRole } from '../../types/game';

export type RoleModalRole = Exclude<PlayerRole, 'None'>;

export interface RoleAbility {
    key: string;
    icon: string;
    type: 'passive' | 'active';
}

export const ROLE_EMOJIS: Record<RoleModalRole, string> = {
    Commander: '🫡',
    Scout: '🧭',
    Defender: '🛡️',
    Engineer: '🛠️',
};

export const ROLE_ABILITIES: Record<RoleModalRole, RoleAbility[]> = {
    Commander: [
        { key: 'warBonus', icon: '🎖️', type: 'passive' },
        { key: 'tacticalStrike', icon: '⚡', type: 'active' },
        { key: 'reinforce', icon: '🔄', type: 'active' },
    ],
    Scout: [
        { key: 'extendedVision', icon: '👁️', type: 'passive' },
        { key: 'firstStrike', icon: '🎯', type: 'passive' },
        { key: 'commandoRaid', icon: '🏹', type: 'active' },
    ],
    Defender: [
        { key: 'presenceShield', icon: '🔁', type: 'passive' },
        { key: 'shieldWall', icon: '🛡️', type: 'active' },
        { key: 'lastStand', icon: '🏃', type: 'passive' },
    ],
    Engineer: [
        { key: 'fortConstruction', icon: '🏗️', type: 'passive' },
        { key: 'emergencyRepair', icon: '🔧', type: 'active' },
        { key: 'demolish', icon: '💣', type: 'active' },
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