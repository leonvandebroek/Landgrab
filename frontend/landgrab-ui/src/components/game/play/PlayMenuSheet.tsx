import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { GameState } from '../../../types/game';
import type { MarkerSize, MarkerStyle, PlayerDisplayPreferences } from '../../../types/playerPreferences';
import { useSound } from '../../../hooks/useSound';
import { Icon } from '../../ui/Icon';
import { Button, Segmented, Sheet, SheetHeader, SwitchRow, cx } from '../../ui/kit';
import { formatGameLogEntry } from '../gameLogFormat';
import { SpectatorsRow, SpectatorsSheet } from '../../spectators/SpectatorsSheet';

export type MenuTab = 'scores' | 'feed' | 'settings';

interface Props {
  open: boolean;
  onClose: () => void;
  state: GameState;
  myUserId: string;
  initialTab?: MenuTab;
  playerDisplayPrefs: PlayerDisplayPreferences;
  onPlayerDisplayPrefsChange: (prefs: PlayerDisplayPreferences) => void;
  onShowRules: () => void;
  onReplayTips: () => void;
  onSetObserverMode?: (enabled: boolean) => void;
  onLeave: () => void;
  devTools?: React.ReactNode;
  /** Three taps on the title open the developer tools in a dev build. */
  onTitleTap?: () => void;
}

/** Scores, the event feed and settings in one sheet behind the menu button. */
export function PlayMenuSheet({
  open,
  onClose,
  state,
  myUserId,
  initialTab = 'scores',
  playerDisplayPrefs,
  onPlayerDisplayPrefsChange,
  onShowRules,
  onReplayTips,
  onSetObserverMode,
  onLeave,
  devTools,
  onTitleTap,
}: Props) {
  const { t, i18n } = useTranslation();
  const [tab, setTab] = useState<MenuTab>(initialTab);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [spectatorsOpen, setSpectatorsOpen] = useState(false);
  const { soundEnabled, toggleSound } = useSound();
  const me = state.players.find((player) => player.id === myUserId);

  const teams = useMemo(() => {
    const list = state.alliances.map((alliance) => ({
      id: alliance.id,
      name: alliance.name,
      color: alliance.color,
      tiles: alliance.territoryCount,
      players: state.players
        .filter((player) => player.allianceId === alliance.id)
        .sort((a, b) => b.territoryCount - a.territoryCount),
    }));
    list.sort((a, b) => {
      if (a.id === me?.allianceId) return -1;
      if (b.id === me?.allianceId) return 1;
      return b.tiles - a.tiles;
    });
    return list;
  }, [me?.allianceId, state.alliances, state.players]);

  const unassigned = state.players.filter((player) => !player.allianceId || !state.alliances.some((a) => a.id === player.allianceId));

  const events = useMemo(() => [...(state.eventLog ?? [])]
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, 80), [state.eventLog]);

  const timeFormat = useMemo(() => new Intl.DateTimeFormat(i18n.resolvedLanguage, { hour: '2-digit', minute: '2-digit' }), [i18n.resolvedLanguage]);

  const close = () => {
    setConfirmLeave(false);
    onClose();
  };

  const tileCount = (count: number) => t('ui.play.tiles', { count });

  return (
    <>
    <Sheet open={open && !spectatorsOpen} onClose={close} labelledBy="play-menu-title" tall testId="play-menu-sheet">
      <SheetHeader
        title={<span onClick={onTitleTap}>{t('ui.menu.title')}</span>}
        titleId="play-menu-title"
        onClose={close}
        closeLabel={t('ui.common.close')}
      />
      <Segmented<MenuTab>
        value={tab}
        onChange={setTab}
        label={t('ui.menu.title')}
        options={[
          { value: 'scores', label: t('ui.menu.scores') },
          { value: 'feed', label: t('ui.menu.feed') },
          { value: 'settings', label: t('ui.menu.settings') },
        ]}
      />

      {tab === 'scores' && (
        <div className="lg-stack">
          {teams.map((team) => (
            <section key={team.id} className="lg-scoreteam">
              <div className="lg-scoreteam__head">
                <span className="lg-dot" style={{ background: team.color }} aria-hidden="true" />
                <span className="lg-scoreteam__name">{team.name}</span>
                {team.id === me?.allianceId && <span className="lg-pill lg-pill--ready">{t('ui.menu.yourTeam')}</span>}
                <span className="lg-scoreteam__tiles">{tileCount(team.tiles)}</span>
              </div>
              {team.players.map((player) => (
                <div key={player.id} className={cx('lg-scorerow', player.id === myUserId && 'is-me')}>
                  <span className="lg-scorerow__name">
                    {player.name}{player.id === myUserId ? ` ${t('ui.menu.youSuffix')}` : ''}
                    {!player.isConnected && !player.isVirtual ? ` · ${t('ui.room.tagOffline')}` : ''}
                  </span>
                  <span className="lg-scorerow__tiles">{tileCount(player.territoryCount)}</span>
                </div>
              ))}
            </section>
          ))}
          {unassigned.length > 0 && (
            <section className="lg-scoreteam">
              <div className="lg-scoreteam__head"><span className="lg-scoreteam__name">{t('ui.menu.noTeam')}</span></div>
              {unassigned.map((player) => (
                <div key={player.id} className={cx('lg-scorerow', player.id === myUserId && 'is-me')}>
                  <span className="lg-scorerow__name">{player.name}</span>
                  <span className="lg-scorerow__tiles">{tileCount(player.territoryCount)}</span>
                </div>
              ))}
            </section>
          )}
        </div>
      )}

      {tab === 'feed' && (
        events.length === 0
          ? <p className="lg-muted lg-center">{t('ui.menu.feedEmpty')}</p>
          : (
            <ul className="lg-feed" data-testid="play-feed">
              {events.map((event, index) => (
                <li key={`${event.createdAt}-${event.type}-${index}`}>
                  <span className="lg-feed__time">{timeFormat.format(new Date(event.createdAt))}</span>
                  <span>{formatGameLogEntry(event, t)}</span>
                </li>
              ))}
            </ul>
          )
      )}

      {tab === 'settings' && (
        <div className="lg-stack">
          <div className="lg-section__box">
            <SwitchRow label={t('ui.menu.sound')} checked={soundEnabled} onChange={() => toggleSound()} />
            <SwitchRow
              label={t('ui.menu.showName')}
              description={t('ui.menu.showNameHelp')}
              checked={playerDisplayPrefs.showNameLabel}
              onChange={(checked) => onPlayerDisplayPrefsChange({ ...playerDisplayPrefs, showNameLabel: checked })}
            />
            {me?.isHost && onSetObserverMode && (
              <SwitchRow
                label={t('ui.settings.observer')}
                description={t('ui.settings.observerHelp')}
                checked={false}
                onChange={(checked) => { if (checked) onSetObserverMode(true); }}
              />
            )}
          </div>
          <section className="lg-section">
            <h3 className="lg-section__title">{t('ui.menu.marker')}</h3>
            <Segmented<MarkerStyle>
              value={playerDisplayPrefs.markerStyle}
              onChange={(markerStyle) => onPlayerDisplayPrefsChange({ ...playerDisplayPrefs, markerStyle })}
              label={t('ui.menu.marker')}
              options={(['dot', 'pin', 'avatar', 'flag'] as const).map((value) => ({ value, label: t(`ui.menu.markers.${value}`) }))}
            />
          </section>
          <section className="lg-section">
            <h3 className="lg-section__title">{t('ui.menu.markerSize')}</h3>
            <Segmented<MarkerSize>
              value={playerDisplayPrefs.markerSize}
              onChange={(markerSize) => onPlayerDisplayPrefsChange({ ...playerDisplayPrefs, markerSize })}
              label={t('ui.menu.markerSize')}
              options={(['small', 'medium', 'large'] as const).map((value) => ({ value, label: t(`ui.menu.sizes.${value}`) }))}
            />
          </section>
          <section className="lg-section">
            <h3 className="lg-section__title">{t('ui.settings.language')}</h3>
            <Segmented<'en' | 'nl'>
              value={i18n.resolvedLanguage === 'nl' ? 'nl' : 'en'}
              onChange={(language) => { void i18n.changeLanguage(language); }}
              label={t('ui.settings.language')}
              options={[{ value: 'en', label: 'English' }, { value: 'nl', label: 'Nederlands' }]}
            />
          </section>
          {devTools}
        </div>
      )}

      {me?.isHost && tab === 'settings' && (
        <SpectatorsRow enabled={Boolean(state.spectatorsEnabled)} onOpen={() => setSpectatorsOpen(true)} />
      )}

      <div className="lg-section__box">
        <button type="button" className="lg-listrow" onClick={onShowRules}>
          <Icon name="info" />
          <span className="lg-listrow__copy"><span className="lg-listrow__title">{t('ui.menu.howToPlay')}</span></span>
          <Icon name="chevronRight" size={20} className="lg-listrow__chev" />
        </button>
        <button type="button" className="lg-listrow" onClick={onReplayTips}>
          <Icon name="bolt" />
          <span className="lg-listrow__copy"><span className="lg-listrow__title">{t('ui.menu.replayTips')}</span></span>
          <Icon name="chevronRight" size={20} className="lg-listrow__chev" />
        </button>
      </div>

      {confirmLeave ? (
        <div className="lg-card lg-stack">
          <p className="lg-h3">{t('ui.menu.leaveConfirm')}</p>
          <p className="lg-muted">{t('ui.menu.leaveConfirmHelp')}</p>
          <div className="lg-actions lg-actions--row">
            <Button variant="secondary" onClick={() => setConfirmLeave(false)}>{t('ui.menu.stay')}</Button>
            <Button variant="danger" onClick={onLeave} testId="play-leave-confirm">{t('ui.menu.leave')}</Button>
          </div>
        </div>
      ) : (
        <Button variant="outline" icon="logout" onClick={() => setConfirmLeave(true)} testId="play-leave-btn">
          {t('ui.menu.leaveGame')}
        </Button>
      )}
    </Sheet>
    <SpectatorsSheet open={spectatorsOpen} onClose={() => setSpectatorsOpen(false)} />
    </>
  );
}
