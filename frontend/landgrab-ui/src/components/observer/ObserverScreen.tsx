import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import type { GameState, Player } from '../../types/game';
import { useSecondTick } from '../../hooks/useSecondTick';
import { useUiStore } from '../../stores/uiStore';
import { formatGameLogEntry } from '../game/gameLogFormat';
import { roomHexToLatLng } from '../map/HexMath';
import { Icon } from '../ui/Icon';
import { Button, Segmented, cx } from '../ui/kit';
import {
  buildFeed,
  buildHappenings,
  buildStats,
  elapsedMs,
  eventTeamColor,
  formatClock,
  projectForTeam,
  timeLeftMs,
} from './observerModel';
import type { FeedFilter, Happening, ObserverPlayer, ObserverStats } from './observerModel';
import { HostToolsSheet } from './HostToolsSheet';
import type { ObserverHostControls } from './HostToolsSheet';
import '../../styles/observer.css';

const GameMap = lazy(() => import('../map/GameMap').then((m) => ({ default: m.GameMap })));

const COMPACT_QUERY = '(max-width: 1099px)';
const FOLLOW_ZOOM = 17;

function useCompactLayout(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia(COMPACT_QUERY);
      query.addEventListener('change', onChange);
      return () => query.removeEventListener('change', onChange);
    },
    () => window.matchMedia(COMPACT_QUERY).matches,
  );
}

function playerLatLng(player: Player, state: GameState): [number, number] | null {
  if (player.currentLat != null && player.currentLng != null) return [player.currentLat, player.currentLng];
  if (player.currentHexQ != null && player.currentHexR != null && state.mapLat != null && state.mapLng != null) {
    return roomHexToLatLng(player.currentHexQ, player.currentHexR, state.mapLat, state.mapLng, state.tileSizeMeters);
  }
  return null;
}

type PanelTab = 'teams' | 'now' | 'feed';

interface Props {
  state: GameState;
  /** The account that is watching, or empty for a host who watches their own game. */
  viewerId: string;
  reconnecting: boolean;
  /** Spectators leave with this. A host has host tools instead. */
  onLeave?: () => void;
  /** Present when the host watches their own game: pause, message, rules. */
  host?: ObserverHostControls;
  /** Something the host tried did not work. */
  error?: string;
  /** Start in big screen mode, for a TV that opens a saved link. */
  initialBig?: boolean;
}

/**
 * The whole game on one screen, for a tablet, laptop or TV: the full map
 * without fog, the score, who is where and what is happening right now.
 */
export function ObserverScreen({ state, viewerId, reconnecting, onLeave, host, error, initialBig = false }: Props) {
  const { t, i18n } = useTranslation();
  const compact = useCompactLayout();
  const camera = useUiStore((ui) => ui.mapCameraController);
  const [now, setNow] = useState(() => Date.now());
  const [followId, setFollowId] = useState<string | null>(null);
  const [viewTeamId, setViewTeamId] = useState<string | null>(null);
  const [filter, setFilter] = useState<FeedFilter>('all');
  const [tab, setTab] = useState<PanelTab>('teams');
  const [big, setBig] = useState(initialBig);
  const [awake, setAwake] = useState(true);
  const [toolsOpen, setToolsOpen] = useState(false);
  const wakeTimer = useRef<number | null>(null);

  // Big screen: nobody holds a mouse, so the one button hides until someone moves it.
  const wake = useCallback(() => {
    setAwake(true);
    if (wakeTimer.current !== null) window.clearTimeout(wakeTimer.current);
    wakeTimer.current = window.setTimeout(() => setAwake(false), 3000);
  }, []);
  useEffect(() => {
    // A screen that starts in big mode has had no mouse movement to start the timer.
    if (initialBig) wakeTimer.current = window.setTimeout(() => setAwake(false), 3000);
    return () => {
      if (wakeTimer.current !== null) window.clearTimeout(wakeTimer.current);
    };
  }, [initialBig]);

  const enterBig = useCallback(() => {
    setFollowId(null);
    setViewTeamId(null);
    setBig(true);
    wake();
    void document.documentElement.requestFullscreen?.().catch(() => undefined);
  }, [wake]);

  const exitBig = useCallback(() => {
    setBig(false);
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!big) return undefined;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') exitBig(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [big, exitBig]);

  useSecondTick(() => setNow(Date.now()));

  const stats = useMemo(() => buildStats(state), [state]);
  const happenings = useMemo(() => buildHappenings(state, now), [state, now]);
  const feed = useMemo(() => buildFeed(state.eventLog, filter), [state.eventLog, filter]);
  const latest = useMemo(() => buildFeed(state.eventLog, 'all', 1)[0] ?? null, [state.eventLog]);
  const timeFormat = useMemo(
    () => new Intl.DateTimeFormat(i18n.resolvedLanguage, { hour: '2-digit', minute: '2-digit' }),
    [i18n.resolvedLanguage],
  );

  // A team that no longer exists cannot be looked through.
  const viewTeam = state.alliances.find((alliance) => alliance.id === viewTeamId) ?? null;
  const teamView = useMemo(() => (viewTeam ? projectForTeam(state, viewTeam.id) : null), [state, viewTeam]);
  const mapState = useMemo(() => (teamView ? { ...state, players: teamView.players } : state), [state, teamView]);

  const followed = followId ? state.players.find((player) => player.id === followId) ?? null : null;
  const followPosition = followed ? playerLatLng(followed, state) : null;
  const followLat = followPosition?.[0] ?? null;
  const followLng = followPosition?.[1] ?? null;

  useEffect(() => {
    if (!camera || followLat == null || followLng == null) return;
    camera.setView(followLat, followLng, Math.max(camera.getZoom(), FOLLOW_ZOOM));
  }, [camera, followLat, followLng]);

  const showWholeMap = useCallback(() => {
    setFollowId(null);
    if (!camera || state.mapLat == null || state.mapLng == null) return;
    const points = Object.values(state.grid ?? {})
      .map((cell) => roomHexToLatLng(cell.q, cell.r, state.mapLat!, state.mapLng!, state.tileSizeMeters));
    if (points.length > 0) camera.fitBounds(points);
  }, [camera, state.grid, state.mapLat, state.mapLng, state.tileSizeMeters]);

  // When the screen turns or the window changes size, show the whole map
  // again, unless the observer is following someone.
  const mapBoxRef = useRef<HTMLElement>(null);
  const refitRef = useRef<() => void>(() => undefined);
  useEffect(() => {
    refitRef.current = () => { if (!followId) showWholeMap(); };
  });
  useEffect(() => {
    const box = mapBoxRef.current;
    if (!box || typeof ResizeObserver === 'undefined') return undefined;
    let timer: number | null = null;
    let first = true;
    const observer = new ResizeObserver(() => {
      if (first) { first = false; return; }
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => refitRef.current(), 250);
    });
    observer.observe(box);
    return () => {
      observer.disconnect();
      if (timer !== null) window.clearTimeout(timer);
    };
  }, []);

  const showTile = useCallback((q: number | null, r: number | null) => {
    if (!camera || q == null || r == null || state.mapLat == null || state.mapLng == null) return;
    setFollowId(null);
    const [lat, lng] = roomHexToLatLng(q, r, state.mapLat, state.mapLng, state.tileSizeMeters);
    camera.setView(lat, lng, Math.max(camera.getZoom(), FOLLOW_ZOOM));
  }, [camera, state.mapLat, state.mapLng, state.tileSizeMeters]);

  const toggleFollow = useCallback((playerId: string) => {
    setFollowId((current) => (current === playerId ? null : playerId));
  }, []);

  const left = timeLeftMs(state, now);
  const played = elapsedMs(state, now);
  const isOver = state.phase === 'GameOver';
  const isLobby = state.phase === 'Lobby';
  const status = isOver ? 'over' : isLobby ? 'lobby' : state.isPaused ? 'paused' : 'live';
  const statusLabel = {
    over: t('ui.watch.statusOver'),
    lobby: t('ui.watch.statusLobby'),
    paused: t('ui.watch.statusPaused'),
    live: t('ui.watch.statusLive'),
  }[status];
  const hasMap = !isLobby && state.mapLat != null && state.mapLng != null;

  const teamsSection = (
    <TeamsList stats={stats} followId={followId} canFollow={hasMap} onToggleFollow={toggleFollow} />
  );

  const nowSection = happenings.length === 0
    ? <p className="lg-obs-empty">{t('ui.watch.nowEmpty')}</p>
    : (
      <ul className="lg-obs-now" data-testid="observer-now">
        {happenings.map((item) => (
          <HappeningCard key={item.id} item={item} now={now} canShow={hasMap} onShow={showTile} />
        ))}
      </ul>
    );

  const feedSection = (
    <>
      <div className="lg-obs-chips" role="group" aria-label={t('ui.watch.filterLabel')}>
        {(['all', 'battles', 'abilities'] as const).map((value) => (
          <button
            key={value}
            type="button"
            className={cx('lg-obs-chip', filter === value && 'is-active')}
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
          >
            {t(value === 'all' ? 'ui.watch.filterAll' : value === 'battles' ? 'ui.watch.filterBattles' : 'ui.watch.filterAbilities')}
          </button>
        ))}
      </div>
      {feed.length === 0
        ? <p className="lg-obs-empty">{t('ui.watch.feedEmpty')}</p>
        : (
          <ul className="lg-obs-feed" data-testid="observer-feed">
            {feed.map((event, index) => (
              <li key={`${event.createdAt}-${event.type}-${index}`}>
                <span className="lg-obs-feed__mark" style={{ background: eventTeamColor(event, state) ?? 'var(--lg-line-2)' }} aria-hidden="true" />
                <span className="lg-obs-feed__text">{formatGameLogEntry(event, t)}</span>
                <time className="lg-obs-feed__time" dateTime={event.createdAt}>{timeFormat.format(new Date(event.createdAt))}</time>
              </li>
            ))}
          </ul>
        )}
    </>
  );

  return (
    <div
      className={cx('lg-obs', compact && !big && 'lg-obs--compact', big && 'lg-obs--big', big && !awake && 'is-asleep')}
      data-testid="observer-screen"
      onPointerMove={big ? wake : undefined}
    >
      {!big && (
      <header className="lg-obs__top">
        <div className="lg-obs__brand">
          <span className="lg-obs__logo">Landgrab</span>
          <span className="lg-pill lg-pill--ready"><Icon name="eye" size={14} />{t('ui.watch.observing')}</span>
          <span className={cx('lg-obs__status', `lg-obs__status--${status}`)} data-testid="observer-status">
            <span className="lg-obs__statusdot" aria-hidden="true" />{statusLabel}
          </span>
        </div>

        <div className="lg-obs__score" data-testid="observer-score">
          <div className="lg-obs__scoreteams">
            {stats.teams.map((team) => (
              <span key={team.id} className="lg-obs__scoreteam">
                <span className="lg-dot" style={{ background: team.color }} aria-hidden="true" />
                <span className="lg-obs__scorename">{team.name}</span>
                <span className="lg-obs__scorepct">{team.pct}%</span>
              </span>
            ))}
          </div>
          <div className="lg-obs__bar" aria-hidden="true">
            {stats.teams.map((team) => (
              <span
                key={team.id}
                style={{ width: `${stats.totalTiles > 0 ? (100 * team.tiles) / stats.totalTiles : 0}%`, background: team.color }}
              />
            ))}
          </div>
        </div>

        <div className="lg-obs__end">
          {!isLobby && (left != null || played != null) && (
            <div className="lg-obs__clock" data-testid="observer-clock">
              <span className="lg-obs__clocktime">{formatClock(left ?? played ?? 0)}</span>
              <span className="lg-obs__clocklabel">{left != null ? t('ui.watch.timeLeft') : t('ui.watch.timePlayed')}</span>
            </div>
          )}
          {host && !isLobby && !isOver && (
            <Button variant="secondary" size="sm" block={false} icon={state.isPaused ? 'play' : 'pause'} onClick={() => host.onPauseGame(!state.isPaused)} testId="observer-pause">
              <span className="lg-obs__leavetext">{state.isPaused ? t('ui.watch.host.resume') : t('ui.watch.host.pause')}</span>
            </Button>
          )}
          {hasMap && (
            <Button variant="secondary" size="sm" block={false} icon="screen" onClick={enterBig} testId="observer-big" aria-label={t('ui.watch.bigScreen')}>
              <span className="lg-obs__leavetext">{t('ui.watch.bigScreen')}</span>
            </Button>
          )}
          {host && (
            <Button variant="secondary" size="sm" block={false} icon="wrench" onClick={() => setToolsOpen(true)} testId="observer-host-tools" aria-label={t('ui.watch.host.tools')}>
              <span className="lg-obs__leavetext">{t('ui.watch.host.tools')}</span>
            </Button>
          )}
          {onLeave && (
            <Button variant="secondary" size="sm" block={false} icon="logout" onClick={onLeave} testId="observer-leave" aria-label={t('ui.watch.leave')}>
              <span className="lg-obs__leavetext">{t('ui.watch.leave')}</span>
            </Button>
          )}
        </div>
      </header>
      )}

      {big && (
        <aside className="lg-big" data-testid="observer-board">
          <div className="lg-big__head">
            <span className="lg-big__logo">Landgrab</span>
            <span className={cx('lg-obs__status', `lg-obs__status--${status}`)}>
              <span className="lg-obs__statusdot" aria-hidden="true" />{statusLabel}
            </span>
          </div>
          {(left != null || played != null) && (
            <div className="lg-big__clock">
              <span className="lg-big__time">{formatClock(left ?? played ?? 0)}</span>
              <span className="lg-big__label">{left != null ? t('ui.watch.timeLeft') : t('ui.watch.timePlayed')}</span>
            </div>
          )}
          <div className="lg-big__teams">
            {stats.teams.map((team) => (
              <div key={team.id} className="lg-big__team">
                <div className="lg-big__teamhead">
                  <span className="lg-big__teamname">{team.name}</span>
                  <span className="lg-big__teampct" style={{ color: team.color }}>{team.pct}%</span>
                </div>
                <div className="lg-big__bar" aria-hidden="true">
                  <span style={{ width: `${stats.teams[0].tiles > 0 ? (100 * team.tiles) / stats.teams[0].tiles : 0}%`, background: team.color }} />
                </div>
                <span className="lg-big__sub">
                  {t('ui.play.tiles', { count: team.tiles })} · {t('ui.watch.troops', { count: team.troops })} · {team.players.map((player) => player.name).join(', ')}
                </span>
              </div>
            ))}
          </div>
          <span className="lg-big__label lg-big__room">{t('ui.watch.room', { code: state.roomCode })}</span>
        </aside>
      )}

      {!compact && !big && (
        <aside className="lg-obs__rail" aria-label={t('ui.watch.teams')}>
          <h2 className="lg-obs__h">{t('ui.watch.teams')}</h2>
          <div className="lg-obs__scroll">{teamsSection}</div>
        </aside>
      )}

      <main className="lg-obs__map" ref={mapBoxRef}>
        {hasMap ? (
          <Suspense fallback={null}>
            <GameMap
              state={mapState}
              myUserId={viewerId}
              currentLocation={null}
              constrainViewportToGrid
              gridOverride={teamView?.grid}
              controlsVariant="none"
            />
          </Suspense>
        ) : (
          <div className="lg-obs__wait" role="status">
            <Icon name="clock" size={32} />
            <h2 className="lg-h2">{t('ui.watch.lobbyTitle')}</h2>
            <p className="lg-muted">{t('ui.watch.lobbyHelp')}</p>
            <p className="lg-small">{t('ui.watch.room', { code: state.roomCode })}</p>
          </div>
        )}

        {hasMap && big && latest && (
          <div className="lg-big__ticker" data-testid="observer-ticker">
            <span className="lg-big__tickermark" style={{ background: eventTeamColor(latest, state) ?? 'var(--lg-line-2)' }} aria-hidden="true" />
            <span className="lg-big__tickertext">{formatGameLogEntry(latest, t)}</span>
            {happenings[0] && (
              <span className="lg-big__tickernext">
                {t('ui.watch.next', { text: t(`ui.watch.happening.${happenings[0].kind}`, { name: happenings[0].playerName }) })}
              </span>
            )}
          </div>
        )}

        {hasMap && big && isOver && state.winnerName && (
          <div className="lg-obs__over lg-obs__over--big" role="status">
            <Icon name="trophy" size={40} />
            <span>{t('ui.watch.winner', { name: state.winnerName })}</span>
          </div>
        )}

        {hasMap && !big && (
          <>
            <div className="lg-obs__maptop">
              {followed ? (
                <button type="button" className="lg-obs__follow" onClick={() => setFollowId(null)} aria-label={t('ui.watch.stopFollowing', { name: followed.name })}>
                  <Icon name="target" size={16} />
                  <span>{t('ui.watch.following')} {followed.name}</span>
                  <Icon name="close" size={16} />
                </button>
              ) : <span />}
              <Button variant="secondary" size="sm" block={false} icon="map" onClick={showWholeMap} testId="observer-whole-map">
                {t('ui.watch.wholeMap')}
              </Button>
            </div>

            {isOver && (
              <div className="lg-obs__over" role="status" data-testid="observer-over">
                <Icon name="trophy" size={28} />
                <div className="lg-stack lg-stack--sm">
                  {state.winnerName && <span className="lg-h2">{t('ui.watch.winner', { name: state.winnerName })}</span>}
                  <span className="lg-muted">{t('ui.watch.overHelp')}</span>
                </div>
              </div>
            )}

            {state.alliances.length > 1 && (
              <div className="lg-obs__viewas">
                <span className="lg-obs__viewaslabel" id="observer-viewas">{t('ui.watch.viewAs')}</span>
                <div className="lg-obs-chips" role="group" aria-labelledby="observer-viewas" data-testid="observer-viewas">
                  <button type="button" className={cx('lg-obs-chip', !viewTeam && 'is-active')} aria-pressed={!viewTeam} onClick={() => setViewTeamId(null)}>
                    {t('ui.watch.everyone')}
                  </button>
                  {state.alliances.map((alliance) => (
                    <button
                      key={alliance.id}
                      type="button"
                      className={cx('lg-obs-chip', viewTeam?.id === alliance.id && 'is-active')}
                      aria-pressed={viewTeam?.id === alliance.id}
                      onClick={() => setViewTeamId(alliance.id)}
                    >
                      <span className="lg-dot" style={{ background: alliance.color }} aria-hidden="true" />
                      {alliance.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {error && !reconnecting && !big && (
          <div className="lg-obs__offline lg-obs__offline--error" role="alert">{error}</div>
        )}

        {reconnecting && (
          <div className="lg-obs__offline" role="status"><Icon name="radio" size={18} />{t('ui.watch.reconnecting')}</div>
        )}
      </main>

      {!compact && !big && (
        <aside className="lg-obs__rail lg-obs__rail--right">
          <section className="lg-obs__block" aria-labelledby="observer-now-title">
            <h2 className="lg-obs__h" id="observer-now-title">{t('ui.watch.now')}</h2>
            {nowSection}
          </section>
          <section className="lg-obs__block lg-obs__block--grow" aria-labelledby="observer-feed-title">
            <h2 className="lg-obs__h" id="observer-feed-title">{t('ui.watch.feed')}</h2>
            <div className="lg-obs__scroll">{feedSection}</div>
          </section>
        </aside>
      )}

      {compact && !big && (
        <section className="lg-obs__panel">
          <Segmented<PanelTab>
            value={tab}
            onChange={setTab}
            options={[
              { value: 'teams', label: t('ui.watch.teams') },
              { value: 'now', label: happenings.length > 0 ? `${t('ui.watch.now')} · ${happenings.length}` : t('ui.watch.now') },
              { value: 'feed', label: t('ui.watch.feed') },
            ]}
          />
          <div className="lg-obs__scroll">
            {tab === 'teams' && teamsSection}
            {tab === 'now' && nowSection}
            {tab === 'feed' && feedSection}
          </div>
        </section>
      )}

      {big && (
        <button type="button" className="lg-big__exit" onClick={exitBig} data-testid="observer-big-exit">
          <Icon name="close" size={18} />{t('ui.watch.exitBigScreen')}
        </button>
      )}

      {host && <HostToolsSheet open={toolsOpen} onClose={() => setToolsOpen(false)} state={state} host={host} />}
    </div>
  );
}

interface TeamsListProps {
  stats: ObserverStats;
  followId: string | null;
  canFollow: boolean;
  onToggleFollow: (playerId: string) => void;
}

function TeamsList({ stats, followId, canFollow, onToggleFollow }: TeamsListProps) {
  const { t } = useTranslation();
  const row = (player: ObserverPlayer, color: string) => {
    const isFollowed = player.id === followId;
    const details = [
      t('ui.play.tiles', { count: player.tiles }),
      player.carrying > 0 ? t('ui.watch.carrying', { count: player.carrying }) : null,
      player.isVirtual ? t('ui.watch.tagBot') : null,
      player.isOffline ? t('ui.watch.tagOffline') : null,
      !player.hasPosition && canFollow ? t('ui.watch.noPosition') : null,
    ].filter(Boolean).join(' · ');
    return (
      <li key={player.id}>
        <button
          type="button"
          className={cx('lg-obs-player', isFollowed && 'is-followed')}
          disabled={!canFollow || !player.hasPosition}
          aria-pressed={isFollowed}
          aria-label={isFollowed ? t('ui.watch.stopFollowing', { name: player.name }) : t('ui.watch.follow', { name: player.name })}
          onClick={() => onToggleFollow(player.id)}
          data-testid={`observer-player-${player.name}`}
        >
          <span className="lg-obs-player__badge" style={{ borderColor: color }} aria-hidden="true">{player.name.charAt(0).toUpperCase()}</span>
          <span className="lg-obs-player__copy">
            <span className="lg-obs-player__name">{player.name}</span>
            <span className="lg-obs-player__sub">{details}</span>
          </span>
          {isFollowed && <span className="lg-obs-player__state">{t('ui.watch.following')}</span>}
        </button>
      </li>
    );
  };

  return (
    <div className="lg-obs-teams" data-testid="observer-teams">
      {stats.teams.map((team) => (
        <section key={team.id} className="lg-obs-team">
          <div className="lg-obs-team__head">
            <span className="lg-obs-team__name">{team.name}</span>
            <span className="lg-obs-team__pct" style={{ color: team.color }}>{team.pct}%</span>
          </div>
          <div className="lg-obs-team__bar" aria-hidden="true">
            <span style={{ width: `${team.pct}%`, background: team.color }} />
          </div>
          <span className="lg-obs-team__sub">
            {t('ui.play.tiles', { count: team.tiles })} · {t('ui.watch.troops', { count: team.troops })}
          </span>
          <ul className="lg-obs-team__players">{team.players.map((player) => row(player, team.color))}</ul>
        </section>
      ))}
      {stats.loose.length > 0 && (
        <section className="lg-obs-team">
          <div className="lg-obs-team__head"><span className="lg-obs-team__name">{t('ui.watch.noTeam')}</span></div>
          <ul className="lg-obs-team__players">{stats.loose.map((player) => row(player, 'var(--lg-line-2)'))}</ul>
        </section>
      )}
    </div>
  );
}

interface HappeningCardProps {
  item: Happening;
  now: number;
  canShow: boolean;
  onShow: (q: number | null, r: number | null) => void;
}

function HappeningCard({ item, now, canShow, onShow }: HappeningCardProps) {
  const { t } = useTranslation();
  const details = [
    item.endsAt != null ? t('ui.watch.endsIn', { time: formatClock(item.endsAt - now) }) : null,
    item.kind === 'fieldBattle' && item.joined > 0 ? t('ui.watch.joined', { count: item.joined }) : null,
  ].filter(Boolean).join(' · ');
  const icon = item.kind === 'fieldBattle' ? 'sword'
    : item.kind === 'raid' || item.kind === 'hqRaid' ? 'target'
      : item.kind === 'rally' ? 'rally'
        : item.kind === 'fort' ? 'fort'
          : item.kind === 'sabotage' ? 'wrench'
            : item.kind === 'demolish' ? 'hammer'
              : 'radio';
  const canJump = canShow && item.q != null && item.r != null;
  return (
    <li className="lg-obs-nowcard" style={{ borderLeftColor: item.teamColor ?? 'var(--lg-line-2)' }}>
      <Icon name={icon} size={20} className="lg-obs-nowcard__icon" />
      <span className="lg-obs-nowcard__copy">
        <span className="lg-obs-nowcard__title">{t(`ui.watch.happening.${item.kind}`, { name: item.playerName })}</span>
        {details && <span className="lg-obs-nowcard__sub">{details}</span>}
      </span>
      {canJump && (
        <button type="button" className="lg-obs-nowcard__go" onClick={() => onShow(item.q, item.r)} aria-label={t('ui.watch.showOnMap')} title={t('ui.watch.showOnMap')}>
          <Icon name="locate" size={18} />
        </button>
      )}
    </li>
  );
}
