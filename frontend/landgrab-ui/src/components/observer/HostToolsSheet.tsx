import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { GameDynamics, GameState } from '../../types/game';
import { FEATURE_KEYS, featureField } from '../../utils/dynamics';
import { SpectatorsRow, SpectatorsSheet } from '../spectators/SpectatorsSheet';
import { Icon } from '../ui/Icon';
import { Button, Sheet, SheetHeader, SwitchRow, cx } from '../ui/kit';

/** What only the host can do while watching their own game. */
export interface ObserverHostControls {
  onPauseGame: (paused: boolean) => void;
  onSendMessage: (message: string, allianceIds?: string[]) => void;
  onUpdateDynamics: (dynamics: GameDynamics) => void;
  onBackToPlaying: () => void;
  onReturnToLobby: () => void;
}

interface Props {
  open: boolean;
  onClose: () => void;
  state: GameState;
  host: ObserverHostControls;
}

const MAX_MESSAGE_LENGTH = 200;

/** Message the players, change rules during the game, invite spectators, go back to playing. */
export function HostToolsSheet({ open, onClose, state, host }: Props) {
  const { t } = useTranslation();
  const [message, setMessage] = useState('');
  const [teamIds, setTeamIds] = useState<string[]>([]);
  const [sent, setSent] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [spectatorsOpen, setSpectatorsOpen] = useState(false);

  useEffect(() => {
    if (!sent) return undefined;
    const timer = window.setTimeout(() => setSent(false), 2500);
    return () => window.clearTimeout(timer);
  }, [sent]);

  const close = () => {
    setConfirmLeave(false);
    onClose();
  };

  const send = (event: React.FormEvent) => {
    event.preventDefault();
    const text = message.trim();
    if (!text) return;
    host.onSendMessage(text, teamIds.length > 0 ? teamIds : undefined);
    setMessage('');
    setTeamIds([]);
    setSent(true);
  };

  const toggleTeam = (id: string) => {
    setTeamIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  };

  return (
    <>
      <Sheet open={open && !spectatorsOpen} onClose={close} labelledBy="host-tools-title" tall testId="host-tools-sheet">
        <SheetHeader title={t('ui.watch.host.tools')} titleId="host-tools-title" onClose={close} closeLabel={t('ui.common.close')} />

        <form className="lg-card" onSubmit={send}>
          <label htmlFor="host-message" className="lg-h3">{t('ui.watch.host.message')}</label>
          <textarea
            id="host-message"
            className="lg-textarea"
            rows={2}
            maxLength={MAX_MESSAGE_LENGTH}
            placeholder={t('ui.watch.host.messagePlaceholder')}
            value={message}
            data-testid="host-message-input"
            onChange={(event) => setMessage(event.target.value)}
          />
          <div className="lg-obs-chips" role="group" aria-label={t('ui.watch.host.messageTo')}>
            <button type="button" className={cx('lg-obs-chip', teamIds.length === 0 && 'is-active')} aria-pressed={teamIds.length === 0} onClick={() => setTeamIds([])}>
              {t('ui.watch.everyone')}
            </button>
            {state.alliances.map((alliance) => (
              <button
                key={alliance.id}
                type="button"
                className={cx('lg-obs-chip', teamIds.includes(alliance.id) && 'is-active')}
                aria-pressed={teamIds.includes(alliance.id)}
                onClick={() => toggleTeam(alliance.id)}
              >
                <span className="lg-dot" style={{ background: alliance.color }} aria-hidden="true" />
                {alliance.name}
              </button>
            ))}
          </div>
          <Button type="submit" size="md" icon={sent ? 'check' : undefined} disabled={!message.trim()} testId="host-message-send">
            {sent ? t('ui.watch.host.sent') : t('ui.watch.host.send')}
          </Button>
        </form>

        <section className="lg-section">
          <h3 className="lg-section__title">{t('ui.watch.host.rules')}</h3>
          <div className="lg-section__box">
            {FEATURE_KEYS.map((key) => (
              <SwitchRow
                key={key}
                label={t(`dynamics.feature.${key}`)}
                description={t(`dynamics.feature.${key}Desc`)}
                checked={Boolean(state.dynamics[featureField(key)])}
                onChange={(checked) => host.onUpdateDynamics({ ...state.dynamics, [featureField(key)]: checked })}
              />
            ))}
          </div>
        </section>

        <SpectatorsRow enabled={Boolean(state.spectatorsEnabled)} onOpen={() => setSpectatorsOpen(true)} />

        <button type="button" className="lg-listrow" onClick={() => { close(); host.onBackToPlaying(); }} data-testid="host-back-to-playing">
          <Icon name="user" />
          <span className="lg-listrow__copy">
            <span className="lg-listrow__title">{t('ui.watch.host.backToPlaying')}</span>
            <span className="lg-listrow__sub">{t('ui.watch.host.backToPlayingHelp')}</span>
          </span>
          <Icon name="chevronRight" size={20} className="lg-listrow__chev" />
        </button>

        {confirmLeave ? (
          <div className="lg-card lg-stack">
            <p className="lg-h3">{t('ui.menu.leaveConfirm')}</p>
            <p className="lg-muted">{t('ui.menu.leaveConfirmHelp')}</p>
            <div className="lg-actions lg-actions--row">
              <Button variant="secondary" onClick={() => setConfirmLeave(false)}>{t('ui.menu.stay')}</Button>
              <Button variant="danger" onClick={host.onReturnToLobby}>{t('ui.menu.leave')}</Button>
            </div>
          </div>
        ) : (
          <Button variant="outline" size="md" icon="logout" onClick={() => setConfirmLeave(true)}>{t('ui.menu.leaveGame')}</Button>
        )}
      </Sheet>
      <SpectatorsSheet open={spectatorsOpen} onClose={() => setSpectatorsOpen(false)} />
    </>
  );
}
