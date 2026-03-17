import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { GameIcon } from '../common/GameIcon';
import type { PlayerRole } from '../../types/game';
import type { GameIconName } from '../../utils/gameIcons';

const ROLES: PlayerRole[] = ['None', 'Commander', 'Scout', 'Defender', 'Engineer'];

const ROLE_META: Record<PlayerRole, { emoji: GameIconName | null; labelKey: string; descriptionKey?: string }> = {
  None: {
    emoji: null,
    labelKey: 'phase4.roleNone'
  },
  Commander: {
    emoji: 'rallyTroops',
    labelKey: 'phase4.roleCommander',
    descriptionKey: 'phase4.roleCommanderDesc'
  },
  Scout: {
    emoji: 'compass',
    labelKey: 'phase4.roleScout',
    descriptionKey: 'phase4.roleScoutDesc'
  },
  Defender: {
    emoji: 'barricade',
    labelKey: 'phase4.roleDefender',
    descriptionKey: 'phase4.roleDefenderDesc'
  },
  Engineer: {
    emoji: 'gearHammer',
    labelKey: 'phase4.roleEngineer',
    descriptionKey: 'phase4.roleEngineerDesc'
  }
};

interface RoleSelectorProps {
  currentRole: PlayerRole;
  onSelectRole: (role: string) => void;
}

const containerStyle: CSSProperties = {
  marginTop: '1.5rem',
  padding: '1rem',
  borderRadius: '1rem',
  border: '1px solid rgba(255,255,255,0.12)',
  background: 'rgba(7, 11, 20, 0.35)',
  backdropFilter: 'blur(10px)',
  WebkitBackdropFilter: 'blur(10px)'
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: '1rem',
  fontWeight: 700,
  color: '#f8fafc'
};

const gridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
  gap: '0.75rem',
  marginTop: '0.85rem'
};

const cardBaseStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: '0.45rem',
  padding: '0.9rem',
  borderRadius: '0.9rem',
  border: '1px solid rgba(255,255,255,0.14)',
  background: 'rgba(255,255,255,0.04)',
  color: '#f8fafc',
  textAlign: 'left',
  cursor: 'pointer',
  transition: 'transform 0.18s ease, border-color 0.18s ease, background 0.18s ease, box-shadow 0.18s ease',
  boxShadow: '0 10px 24px rgba(15, 23, 42, 0.18)'
};

const emojiStyle: CSSProperties = {
  fontSize: '1.4rem',
  lineHeight: 1
};

const roleNameStyle: CSSProperties = {
  fontSize: '0.95rem',
  fontWeight: 700
};

const roleDescriptionStyle: CSSProperties = {
  fontSize: '0.8rem',
  lineHeight: 1.4,
  color: 'rgba(226, 232, 240, 0.82)'
};

function getCardStyle(isActive: boolean): CSSProperties {
  return {
    ...cardBaseStyle,
    borderColor: isActive ? 'rgba(96, 165, 250, 0.7)' : 'rgba(255,255,255,0.14)',
    background: isActive ? 'linear-gradient(180deg, rgba(59, 130, 246, 0.18), rgba(15, 23, 42, 0.7))' : cardBaseStyle.background,
    boxShadow: isActive ? '0 14px 30px rgba(37, 99, 235, 0.22)' : cardBaseStyle.boxShadow,
    transform: isActive ? 'translateY(-1px)' : 'none'
  };
}

export function RoleSelector({ currentRole, onSelectRole }: RoleSelectorProps) {
  const { t } = useTranslation();

  return (
    <section style={containerStyle}>
      <h3 style={titleStyle}>{t('phase4.selectRole' as never)}</h3>
      <div style={gridStyle}>
        {ROLES.map(role => {
          const meta = ROLE_META[role];
          const isActive = currentRole === role;

          return (
            <button
              key={role}
              type="button"
              style={getCardStyle(isActive)}
              aria-pressed={isActive}
              onClick={() => onSelectRole(role)}
            >
              <span style={emojiStyle}>{meta.emoji ? <GameIcon name={meta.emoji} /> : <span aria-hidden="true">-</span>}</span>
              <span style={roleNameStyle}>{t(meta.labelKey as never)}</span>
              <span style={roleDescriptionStyle}>
                {meta.descriptionKey ? t(meta.descriptionKey as never) : t('phase4.roleNone' as never)}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
