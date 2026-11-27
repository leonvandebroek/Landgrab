import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { PlayerRole } from '../../types/game';
import { Icon } from '../ui/Icon';
import type { IconName } from '../ui/Icon';
import { Button, Sheet, SheetHeader, cx } from '../ui/kit';

type PickableRole = Exclude<PlayerRole, 'None'>;

const ROLES: Array<{ role: PickableRole; icon: IconName; lines: string[] }> = [
  { role: 'Commander', icon: 'flag', lines: ['warBonus', 'tacticalStrike', 'rallyPoint', 'commandoRaid'] },
  { role: 'Scout', icon: 'eye', lines: ['extendedVision', 'firstStrike', 'beacon', 'intercept'] },
  { role: 'Engineer', icon: 'fort', lines: ['fortConstruction', 'sabotage', 'demolish'] },
];

// eslint-disable-next-line react-refresh/only-export-components
export function roleTitleKey(role: PlayerRole) {
  switch (role) {
    case 'Commander': return 'ui.roles.Commander.title' as const;
    case 'Scout': return 'ui.roles.Scout.title' as const;
    case 'Engineer': return 'ui.roles.Engineer.title' as const;
    default: return 'ui.roles.none' as const;
  }
}

interface Props {
  currentRole: PlayerRole;
  onPick: (role: PickableRole) => void;
  onClose: () => void;
}

export function RolePickerSheet({ currentRole, onPick, onClose }: Props) {
  const { t } = useTranslation();
  const [choice, setChoice] = useState<PickableRole>(currentRole === 'None' ? 'Commander' : currentRole);

  return (
    <Sheet open onClose={onClose} labelledBy="role-picker-title" tall>
      <SheetHeader
        title={t('ui.roles.pickTitle')}
        kicker={t('ui.roles.pickHelp')}
        titleId="role-picker-title"
        onClose={onClose}
        closeLabel={t('ui.common.close')}
      />
      <div className="lg-stack">
        {ROLES.map(({ role, icon, lines }) => (
          <button
            key={role}
            type="button"
            className={cx('lg-rolecard', choice === role && 'is-selected')}
            aria-pressed={choice === role}
            onClick={() => setChoice(role)}
            data-testid={`role-card-${role}`}
          >
            <span className="lg-rolecard__head">
              <span className="lg-rolecard__icon"><Icon name={icon} /></span>
              <span className="lg-stack lg-stack--sm lg-grow">
                <span className="lg-rolecard__title">{t(`ui.roles.${role}.title`)}</span>
                <span className="lg-rolecard__sub">{t(`ui.roles.${role}.tagline`)}</span>
              </span>
              {currentRole === role && <span className="lg-pill lg-pill--ready">{t('ui.roles.yours')}</span>}
            </span>
            <ul>
              {lines.map((line) => (
                <li key={line}>
                  <strong>{t(`ui.roles.lines.${line}.name` as never)}</strong> {t(`ui.roles.lines.${line}.text` as never)}
                </li>
              ))}
            </ul>
          </button>
        ))}
      </div>
      <Button onClick={() => onPick(choice)} testId="role-pick-confirm">
        {t('ui.roles.playAs', { role: t(`ui.roles.${choice}.title`) })}
      </Button>
    </Sheet>
  );
}
