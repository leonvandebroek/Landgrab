import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { GameState, Player, PlayerRole } from '../../types/game';
import { Icon } from '../ui/Icon';
import { Button, Screen, TopBar, cx } from '../ui/kit';
import { RolePickerSheet, roleTitleKey } from './RolePickerSheet';

const MAX_TEAMS = 8;
const MAX_BOTS = 8;

interface Props {
  gameState: GameState;
  myUserId: string;
  error: string;
  onSetAlliance: (name: string) => void;
  onConfigureAlliances: (names: string[]) => void;
  onDistributePlayers: () => void;
  onSetVirtualPlayerCount: (count: number) => void;
  onSetPlayerRole?: (role: string) => void;
  onNext: () => void;
  onLeave: () => void;
}

/**
 * Game room: screen 1 of 2 for the host, the whole lobby for guests.
 * Replaces the old wizard steps for location and teams.
 */
export function RoomScreen({
  gameState,
  myUserId,
  error,
  onSetAlliance,
  onConfigureAlliances,
  onDistributePlayers,
  onSetVirtualPlayerCount,
  onSetPlayerRole,
  onNext,
  onLeave,
}: Props) {
  const { t } = useTranslation();
  const me = gameState.players.find((player) => player.id === myUserId);
  const isHost = me?.isHost ?? false;
  const host = gameState.players.find((player) => player.isHost);
  const rolesEnabled = gameState.dynamics?.playerRolesEnabled === true;
  const [copied, setCopied] = useState(false);
  const [addingTeam, setAddingTeam] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [rolePickerOpen, setRolePickerOpen] = useState(false);
  const didCreateDefaultTeams = useRef(false);
  const didJoinFirstTeam = useRef(false);

  const botCount = gameState.players.filter((player) => player.isVirtual).length;
  const unassigned = gameState.players.filter((player) => !player.allianceId);
  const offline = gameState.players.filter((player) => !player.isConnected && !player.isVirtual);

  // Teams exist from the start: two by default.
  useEffect(() => {
    if (!isHost || gameState.alliances.length > 0 || didCreateDefaultTeams.current) return;
    didCreateDefaultTeams.current = true;
    onConfigureAlliances([t('ui.room.defaultTeamA'), t('ui.room.defaultTeamB')]);
  }, [gameState.alliances.length, isHost, onConfigureAlliances, t]);

  // The host lands in the first team so a game can start without extra taps.
  useEffect(() => {
    if (!isHost || me?.allianceId || gameState.alliances.length === 0 || didJoinFirstTeam.current) return;
    didJoinFirstTeam.current = true;
    onSetAlliance(gameState.alliances[0].name);
  }, [gameState.alliances, isHost, me?.allianceId, onSetAlliance]);

  const readiness = useMemo(() => {
    if (gameState.players.length < 2) return { ok: false, text: t('ui.room.needTwoPlayers') };
    if (unassigned.length > 0) return { ok: false, text: t('ui.room.needTeams', { count: unassigned.length }) };
    if (offline.length > 0) return { ok: false, text: t('ui.room.waitingOffline', { count: offline.length }) };
    return { ok: true, text: t('ui.room.ready') };
  }, [gameState.players.length, offline.length, t, unassigned.length]);

  const share = async () => {
    const text = t('ui.room.shareText', { code: gameState.roomCode });
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Landgrab', text });
        return;
      }
    } catch {
      // The share sheet was closed; fall back to copying.
    }
    try {
      await navigator.clipboard.writeText(gameState.roomCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard is not available here.
    }
  };

  const addTeam = (event: React.FormEvent) => {
    event.preventDefault();
    const name = newTeamName.trim();
    const names = gameState.alliances.map((alliance) => alliance.name);
    if (!name || names.length >= MAX_TEAMS || names.some((existing) => existing.toLowerCase() === name.toLowerCase())) return;
    onConfigureAlliances([...names, name]);
    didJoinFirstTeam.current = false;
    setNewTeamName('');
    setAddingTeam(false);
  };

  const removeTeam = (name: string) => {
    const names = gameState.alliances.map((alliance) => alliance.name).filter((existing) => existing !== name);
    if (names.length === 0) return;
    didJoinFirstTeam.current = false;
    onConfigureAlliances(names);
  };

  const myAlliance = gameState.alliances.find((alliance) => alliance.id === me?.allianceId);
  const hostStatus = gameState.currentWizardStep != null && gameState.currentWizardStep >= 2
    ? t('ui.room.hostOnRules', { name: host?.name ?? '' })
    : t('ui.room.hostOnTeams', { name: host?.name ?? '' });

  const footer = isHost ? (
    <>
      <p className="lg-small lg-center" data-testid="room-readiness">{readiness.text}</p>
      <Button onClick={onNext} disabled={!readiness.ok} testId="wizard-next-btn">{t('ui.room.next')}</Button>
    </>
  ) : (
    <div className="lg-card lg-card--tight">
      <div className="lg-row">
        <span className="lg-dot" style={{ animation: 'lg-pulse 1.4s infinite' }} aria-hidden="true" />
        <div className="lg-stack lg-stack--sm lg-grow">
          <span className="lg-h3">{t('ui.room.waitingStart')}</span>
          <span className="lg-small">
            {myAlliance ? t('ui.room.youAreIn', { team: myAlliance.name }) : t('ui.room.pickTeamFirst')}
          </span>
        </div>
      </div>
    </div>
  );

  return (
    <Screen footer={footer} testId="setup-wizard">
      <TopBar
        title={t('ui.room.title')}
        onBack={onLeave}
        backLabel={isHost ? t('ui.room.backHome') : t('ui.room.leave')}
        right={isHost ? t('ui.room.stepOf', { current: 1, total: 2 }) : null}
      />

      <div className="lg-codecard">
        <div className="lg-stack lg-stack--sm">
          <span className="lg-eyebrow">{t('ui.room.inviteCode')}</span>
          <span className="lg-codecard__code" data-testid="wizard-room-code">{gameState.roomCode}</span>
        </div>
        <Button variant="light" size="sm" block={false} icon="share" onClick={() => void share()}>
          {copied ? t('ui.room.copied') : t('ui.room.share')}
        </Button>
      </div>

      {!isHost && (
        <div className="lg-note" role="status">
          <strong className="lg-h3" style={{ display: 'block', marginBottom: 2 }}>{hostStatus}</strong>
          {gameState.currentWizardStep != null && gameState.currentWizardStep >= 2
            ? t('ui.room.hostOnRulesHelp')
            : t('ui.room.hostOnTeamsHelp')}
        </div>
      )}

      <div className="lg-row lg-row--between">
        <h2 className="lg-h2">{isHost ? t('ui.room.teams') : t('ui.room.pickTeam')}</h2>
        {isHost && gameState.alliances.length >= 2 && (
          <Button variant="secondary" size="sm" block={false} icon="shuffle" onClick={onDistributePlayers}>
            {t('ui.room.shuffle')}
          </Button>
        )}
      </div>

      <div className={cx('lg-teams', gameState.alliances.length === 1 && 'lg-teams--one')}>
        {gameState.alliances.map((alliance) => {
          const members = alliance.memberIds
            .map((id) => gameState.players.find((player) => player.id === id))
            .filter((player): player is Player => Boolean(player));
          const isMine = alliance.id === me?.allianceId;
          return (
            <div
              key={alliance.id}
              className={cx('lg-team', isMine && 'is-mine')}
              style={{ '--team': alliance.color } as React.CSSProperties}
              data-testid={`room-team-${alliance.name}`}
            >
              <div className="lg-team__head">
                <span className="lg-team__name">{alliance.name}</span>
                <span className="lg-team__count">{t('ui.room.playerCount', { count: members.length })}</span>
              </div>
              {members.map((player) => (
                <div
                  key={player.id}
                  className={cx('lg-team__player', player.id === myUserId && 'is-me', !player.isConnected && !player.isVirtual && 'is-offline')}
                >
                  <span>{player.name}</span>
                  <span className="lg-team__tag">{playerTag(player, myUserId, t)}</span>
                </div>
              ))}
              {members.length === 0 && <span className="lg-team__empty">{t('ui.room.emptyTeam')}</span>}
              {!isMine && (
                <button
                  type="button"
                  className="lg-team__join"
                  onClick={() => onSetAlliance(alliance.name)}
                  aria-label={t('ui.room.switchTo', { team: alliance.name })}
                >
                  {me?.allianceId ? t('ui.room.switchTo', { team: alliance.name }) : t('ui.room.joinTeam', { team: alliance.name })}
                </button>
              )}
              {isHost && gameState.alliances.length > 2 && (
                <div className="lg-team__tools">
                  <button type="button" onClick={() => removeTeam(alliance.name)} aria-label={t('ui.room.removeTeam', { team: alliance.name })}>
                    <Icon name="trash" size={14} /> {t('ui.room.remove')}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {isHost && unassigned.length > 0 && gameState.alliances.length > 0 && (
        <div className="lg-stack lg-stack--sm">
          <span className="lg-eyebrow">{t('ui.room.noTeamYet')}</span>
          <div className="lg-unassigned">
            {unassigned.map((player) => <span key={player.id}>{player.name}</span>)}
          </div>
        </div>
      )}

      {isHost && gameState.alliances.length < MAX_TEAMS && (
        addingTeam ? (
          <form className="lg-inline-form" onSubmit={addTeam}>
            <label htmlFor="new-team-name" className="sr-only">{t('ui.room.teamName')}</label>
            <input
              id="new-team-name"
              className="lg-input"
              value={newTeamName}
              maxLength={30}
              autoFocus
              placeholder={t('ui.room.teamName')}
              onChange={(event) => setNewTeamName(event.target.value)}
            />
            <Button type="submit" size="md" block={false} disabled={!newTeamName.trim()}>{t('ui.room.add')}</Button>
            <Button variant="secondary" size="md" block={false} onClick={() => { setAddingTeam(false); setNewTeamName(''); }}>
              {t('ui.common.cancel')}
            </Button>
          </form>
        ) : (
          <button type="button" className="lg-dashed" onClick={() => setAddingTeam(true)}>
            <Icon name="plus" size={18} /> {t('ui.room.addTeam')}
          </button>
        )
      )}

      {isHost && (
        <div className="lg-card lg-card--tight">
          <div className="lg-row lg-row--between">
            <div className="lg-stack lg-stack--sm lg-grow">
              <span className="lg-h3">{t('ui.room.bots')}</span>
              <span className="lg-small">{t('ui.room.botsHelp')}</span>
            </div>
            <div className="lg-stepper lg-stepper--inline" data-testid="room-bot-stepper">
              <button
                type="button"
                className="lg-stepper__btn"
                aria-label={t('ui.room.botFewer')}
                disabled={botCount <= 0}
                onClick={() => onSetVirtualPlayerCount(botCount - 1)}
              >
                <Icon name="minus" size={20} strokeWidth={2.4} />
              </button>
              <span className="lg-stepper__number" style={{ minWidth: 20, textAlign: 'center' }} data-testid="room-bot-count">{botCount}</span>
              <button
                type="button"
                className="lg-stepper__btn"
                aria-label={t('ui.room.botMore')}
                disabled={botCount >= MAX_BOTS}
                onClick={() => onSetVirtualPlayerCount(botCount + 1)}
              >
                <Icon name="plus" size={20} strokeWidth={2.4} />
              </button>
            </div>
          </div>
        </div>
      )}

      {rolesEnabled && onSetPlayerRole && (
        <button type="button" className="lg-listrow" onClick={() => setRolePickerOpen(true)} data-testid="room-role-btn">
          <Icon name="user" />
          <span className="lg-listrow__copy">
            <span className="lg-listrow__title">{t('ui.room.yourRole')}</span>
            <span className="lg-listrow__sub">
              {me?.role && me.role !== 'None' ? t(roleTitleKey(me.role as PlayerRole)) : t('ui.room.pickRole')}
            </span>
          </span>
          <Icon name="chevronRight" size={20} className="lg-listrow__chev" />
        </button>
      )}

      {error && <p className="lg-error" role="alert">{error}</p>}

      {rolePickerOpen && onSetPlayerRole && (
        <RolePickerSheet
          currentRole={(me?.role as PlayerRole | undefined) ?? 'None'}
          onPick={(role) => { onSetPlayerRole(role); setRolePickerOpen(false); }}
          onClose={() => setRolePickerOpen(false)}
        />
      )}
    </Screen>
  );
}

function playerTag(player: Player, myUserId: string, t: (key: never, options?: Record<string, unknown>) => string): string {
  if (player.id === myUserId) return t('ui.room.tagYou' as never);
  if (player.isHost) return t('ui.room.tagHost' as never);
  if (player.isVirtual) return t('ui.room.tagBot' as never);
  if (!player.isConnected) return t('ui.room.tagOffline' as never);
  return '';
}
