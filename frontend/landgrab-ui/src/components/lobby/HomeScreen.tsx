import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { RoomSummary } from '../../types/game';
import { useUiStore } from '../../stores/uiStore';
import { Icon } from '../ui/Icon';
import { Button, Screen, Segmented, Sheet, SheetHeader } from '../ui/kit';

interface Props {
  username: string;
  connected: boolean;
  recentRooms: RoomSummary[];
  error: string;
  onCreateRoom: () => void;
  onJoinRoom: (code: string) => void;
  onLogout: () => void;
}

export function HomeScreen({ username, connected, recentRooms, error, onCreateRoom, onJoinRoom, onLogout }: Props) {
  const { t, i18n } = useTranslation();
  const setView = useUiStore((state) => state.setView);
  const [joinCode, setJoinCode] = useState('');
  const [profileOpen, setProfileOpen] = useState(false);

  const code = joinCode.trim().toUpperCase();
  const canJoin = connected && code.length === 6;
  const initial = username.trim().charAt(0).toUpperCase() || '?';
  const activeRooms = recentRooms.filter((room) => room.phase !== 'GameOver');

  const submitJoin = (event: React.FormEvent) => {
    event.preventDefault();
    if (canJoin) onJoinRoom(code);
  };

  return (
    <Screen testId="lobby-entry">
      <div className="lg-home__head">
        <div className="lg-stack lg-stack--sm">
          <span className="lg-muted">{t('ui.home.welcome')}</span>
          <h1 className="lg-h1">{t('ui.home.hi', { name: username })}</h1>
        </div>
        <button
          type="button"
          className="lg-avatar"
          aria-label={t('ui.home.profileLabel')}
          onClick={() => setProfileOpen(true)}
          data-testid="lobby-profile-btn"
        >
          {initial}
        </button>
      </div>

      {!connected && (
        <div className="lg-banner" role="status">
          <Icon name="radio" size={18} />
          {t('ui.home.connecting')}
        </div>
      )}

      <form className="lg-card" onSubmit={submitJoin}>
        <div className="lg-stack lg-stack--sm">
          <h2 className="lg-h2">{t('ui.home.joinTitle')}</h2>
          <label htmlFor="home-code" className="lg-muted">{t('ui.home.joinHelp')}</label>
        </div>
        <input
          id="home-code"
          className="lg-code-input"
          type="text"
          inputMode="text"
          autoCapitalize="characters"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          maxLength={6}
          placeholder="ABC123"
          value={joinCode}
          data-testid="lobby-join-code-input"
          onChange={(event) => setJoinCode(event.target.value.replace(/\s/g, '').toUpperCase())}
        />
        <Button type="submit" disabled={!canJoin} testId="lobby-join-btn">{t('ui.home.join')}</Button>
      </form>

      <button
        type="button"
        className="lg-hostcard"
        onClick={onCreateRoom}
        disabled={!connected}
        data-testid="lobby-create-room-btn"
      >
        <span className="lg-hostcard__icon"><Icon name="plus" size={24} strokeWidth={2.2} /></span>
        <span className="lg-listrow__copy">
          <span className="lg-h2">{t('ui.home.hostTitle')}</span>
          <span className="lg-muted">{t('ui.home.hostHelp')}</span>
        </span>
        <Icon name="chevronRight" size={20} className="lg-listrow__chev" />
      </button>

      <a className="lg-listrow" href="/watch" data-testid="lobby-watch-link">
        <Icon name="eye" />
        <span className="lg-listrow__copy">
          <span className="lg-listrow__title">{t('ui.home.watchTitle')}</span>
          <span className="lg-listrow__sub">{t('ui.home.watchHelp')}</span>
        </span>
        <Icon name="chevronRight" size={20} className="lg-listrow__chev" />
      </a>

      {activeRooms.length > 0 && (
        <div className="lg-stack">
          <h2 className="lg-eyebrow">{t('ui.home.resumeTitle')}</h2>
          {activeRooms.map((room) => (
            <button
              key={room.code}
              type="button"
              className="lg-listrow"
              onClick={() => onJoinRoom(room.code.trim().toUpperCase())}
              disabled={!connected}
            >
              <span className="lg-dot" style={{ background: room.phase === 'Playing' ? 'var(--lg-accent)' : 'var(--lg-warn)' }} aria-hidden="true" />
              <span className="lg-listrow__copy">
                <span className="lg-listrow__title">
                  {t('ui.home.roomLine', { code: room.code, phase: t(room.phase === 'Playing' ? 'ui.home.phasePlaying' : 'ui.home.phaseLobby') })}
                </span>
                <span className="lg-listrow__sub">
                  {t('ui.home.roomDetail', { host: room.hostName, count: room.playerCount })}
                </span>
              </span>
              <span className="lg-listrow__end">{t('ui.home.rejoin')}</span>
            </button>
          ))}
        </div>
      )}

      {error && <p className="lg-error" role="alert">{error}</p>}

      <Sheet open={profileOpen} onClose={() => setProfileOpen(false)} labelledBy="profile-title">
        <SheetHeader
          title={username}
          kicker={t('ui.home.profileKicker')}
          titleId="profile-title"
          onClose={() => setProfileOpen(false)}
          closeLabel={t('ui.common.close')}
        />
        <div className="lg-section">
          <h3 className="lg-section__title">{t('ui.settings.language')}</h3>
          <Segmented
            value={i18n.resolvedLanguage === 'nl' ? 'nl' : 'en'}
            options={[{ value: 'en', label: 'English' }, { value: 'nl', label: 'Nederlands' }]}
            onChange={(lng) => { void i18n.changeLanguage(lng); }}
            label={t('ui.settings.language')}
          />
        </div>
        <button
          type="button"
          className="lg-listrow"
          data-testid="lobby-map-editor-toggle"
          onClick={() => { setProfileOpen(false); setView('mapEditor'); }}
        >
          <Icon name="map" />
          <span className="lg-listrow__copy">
            <span className="lg-listrow__title">{t('ui.home.mapEditor')}</span>
            <span className="lg-listrow__sub">{t('ui.home.mapEditorHelp')}</span>
          </span>
          <Icon name="chevronRight" size={20} className="lg-listrow__chev" />
        </button>
        <Button variant="danger" icon="logout" onClick={onLogout} testId="lobby-sign-out-btn">{t('ui.home.signOut')}</Button>
      </Sheet>
    </Screen>
  );
}
