import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AuthPage, LandgrabMark } from '../components/auth/AuthPage';
import { Icon } from '../components/ui/Icon';
import { Button, Screen } from '../components/ui/kit';
import { useAuth } from '../hooks/useAuth';
import { useSignalR } from '../hooks/useSignalR';
import type { GameEvents } from '../hooks/useSignalR';
import { useGameStore } from '../stores/gameStore';
import { useEffectsStore } from '../stores/effectsStore';
import type { AuthState, GameState } from '../types/game';
import { normalizeGameState } from '../utils/gameHelpers';
import '../styles/index.css';
import '../styles/tricorder-v2.css';
// The field kit goes after the legacy styles so it wins, and the observer styles build on it.
import '../styles/lg.css';
import '../styles/observer.css';

const ObserverScreen = lazy(() => import('../components/observer/ObserverScreen').then((m) => ({ default: m.ObserverScreen })));

const WATCH_CODE_KEY = 'landgrab_watch_code';
const CODE_LENGTH = 8;

type ErrorKey = 'invalid' | 'rateLimited' | 'playerBlocked' | 'full' | 'alreadyPlaying' | 'generic';

const ERROR_KEYS: Record<string, ErrorKey> = {
  WATCH_CODE_INVALID: 'invalid',
  WATCH_RATE_LIMITED: 'rateLimited',
  WATCH_PLAYER_BLOCKED: 'playerBlocked',
  WATCH_FULL: 'full',
  WATCH_ALREADY_PLAYING: 'alreadyPlaying',
};

function cleanCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LENGTH);
}

function readStoredCode(): string {
  try {
    return cleanCode(window.sessionStorage.getItem(WATCH_CODE_KEY) ?? '');
  } catch {
    return '';
  }
}

function storeCode(code: string | null) {
  try {
    if (code) window.sessionStorage.setItem(WATCH_CODE_KEY, code);
    else window.sessionStorage.removeItem(WATCH_CODE_KEY);
  } catch {
    // Private mode without storage: watching still works, only a reload forgets the code.
  }
}

function readCodeFromAddress(): string {
  return cleanCode(new URLSearchParams(window.location.search).get('code') ?? '');
}

/** The spectator side of Landgrab, at /watch. Sign in, type a watch code, watch. */
export default function WatchApp() {
  const { auth, authReady, login, register, logout } = useAuth();

  if (!authReady) return null;
  if (!auth) return <AuthPage onLogin={login} onRegister={register} />;
  return <WatchSession auth={auth} onLogout={logout} />;
}

function WatchSession({ auth, onLogout }: { auth: AuthState; onLogout: () => Promise<void> }) {
  const { t } = useTranslation();
  const gameState = useGameStore((state) => state.gameState);
  const [input, setInput] = useState(() => readCodeFromAddress() || readStoredCode());
  // The code we are watching with, or trying to. Empty means the entry screen.
  const [activeCode, setActiveCode] = useState(() => readCodeFromAddress() || readStoredCode());
  const [errorKey, setErrorKey] = useState<ErrorKey | null>(null);
  const [removed, setRemoved] = useState(false);
  // A TV can open /watch?code=…&screen=big and go straight to the scoreboard.
  const [startBig] = useState(() => new URLSearchParams(window.location.search).get('screen') === 'big');
  const lastErrorCode = useRef<string | null>(null);

  const stop = useCallback((options: { removed?: boolean; error?: ErrorKey | null } = {}) => {
    storeCode(null);
    setActiveCode('');
    setRemoved(Boolean(options.removed));
    setErrorKey(options.error ?? null);
    useGameStore.getState().setGameState(null);
  }, []);

  const events = useMemo<GameEvents>(() => {
    const apply = (state: GameState) => {
      const store = useGameStore.getState();
      const next = normalizeGameState(state, store.gameState);
      store.setGameState(next);
      useEffectsStore.getState().setEffects({ contestedEdges: next.contestedEdges ?? [] });
    };
    return {
      onStateUpdated: apply,
      onGameStarted: apply,
      onPlayerJoined: apply,
      onPlayersMoved: (players) => {
        useGameStore.getState().updateGameState((prev) => (prev ? { ...prev, players } : prev));
      },
      onDynamicsChanged: (dynamics) => {
        useGameStore.getState().updateGameState((prev) => (prev ? { ...prev, dynamics } : prev));
      },
      onError: (payload) => {
        const code = (payload as unknown as { code?: string } | null)?.code;
        lastErrorCode.current = typeof code === 'string' ? code : null;
      },
      onSpectatorRemoved: () => stop({ removed: true }),
    };
  }, [stop]);

  const { connected, reconnecting, invoke } = useSignalR(auth.token, events);

  // Join when a code is set, and again after every reconnect: a new
  // connection is not a spectator until it says the code.
  useEffect(() => {
    if (!connected || !activeCode) return;
    let cancelled = false;
    lastErrorCode.current = null;
    invoke<{ roomCode: string }>('SpectateRoom', activeCode)
      .then(() => {
        if (cancelled) return;
        storeCode(activeCode);
        setErrorKey(null);
        setRemoved(false);
        // Keep the code out of the address bar, where it is easy to leak on a shared screen.
        if (window.location.search) window.history.replaceState(null, '', window.location.pathname);
      })
      .catch(() => {
        if (cancelled) return;
        stop({ error: ERROR_KEYS[lastErrorCode.current ?? ''] ?? 'generic' });
      });
    return () => { cancelled = true; };
  }, [activeCode, connected, invoke, stop]);

  const leave = useCallback(() => {
    if (connected) void invoke('LeaveSpectating').catch(() => undefined);
    stop();
    setInput('');
  }, [connected, invoke, stop]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const code = cleanCode(input);
    if (code.length !== CODE_LENGTH || !connected) return;
    setErrorKey(null);
    setRemoved(false);
    setActiveCode(code);
  };

  if (activeCode && gameState) {
    return (
      <Suspense fallback={<WatchSplash text={t('ui.watch.joining')} />}>
        <ObserverScreen
          state={gameState}
          viewerId={auth.userId}
          reconnecting={!connected}
          initialBig={startBig}
          onLeave={leave}
        />
      </Suspense>
    );
  }

  if (activeCode) {
    return <WatchSplash text={connected || !reconnecting ? t('ui.watch.joining') : t('ui.watch.reconnecting')} />;
  }

  const code = cleanCode(input);
  const shown = code.length > 4 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;

  return (
    <Screen testId="watch-entry" className="lg-watch-entry">
      <div className="lg-watch-entry__inner">
        <div className="lg-watch-entry__brand">
          <LandgrabMark size={48} />
          <span className="lg-pill lg-pill--ready"><Icon name="eye" size={16} /> {t('ui.watch.observing')}</span>
        </div>
        <div className="lg-stack lg-stack--sm">
          <h1 className="lg-h1">{t('ui.watch.title')}</h1>
          <p className="lg-muted">{t('ui.watch.help')}</p>
        </div>

        {removed && <div className="lg-banner" role="status"><Icon name="info" size={18} />{t('ui.watch.removed')}</div>}
        {!connected && <div className="lg-banner" role="status"><Icon name="radio" size={18} />{t('ui.watch.connecting')}</div>}

        <form className="lg-card" onSubmit={submit}>
          <label htmlFor="watch-code" className="lg-muted">{t('ui.watch.codeLabel')}</label>
          <input
            id="watch-code"
            className="lg-code-input lg-code-input--watch"
            type="text"
            autoCapitalize="characters"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
            maxLength={CODE_LENGTH + 1}
            placeholder="ABCD-2345"
            value={shown}
            data-testid="watch-code-input"
            onChange={(event) => { setInput(cleanCode(event.target.value)); setErrorKey(null); }}
          />
          {errorKey && <p className="lg-error" role="alert" data-testid="watch-error">{t(`ui.watch.errors.${errorKey}`)}</p>}
          <Button type="submit" icon="eye" disabled={!connected || code.length !== CODE_LENGTH} testId="watch-start-btn">
            {t('ui.watch.start')}
          </Button>
        </form>

        <div className="lg-watch-entry__foot">
          <span className="lg-small">{t('ui.watch.signedInAs', { name: auth.username })}</span>
          <div className="lg-row">
            <a className="lg-btn lg-btn--quiet lg-btn--sm" href="/">{t('ui.watch.backToPlaying')}</a>
            <Button variant="quiet" size="sm" block={false} onClick={() => { void onLogout(); }}>{t('ui.watch.signOut')}</Button>
          </div>
        </div>
      </div>
    </Screen>
  );
}

function WatchSplash({ text }: { text: string }) {
  return (
    <div className="lg-watch-splash" role="status">
      <LandgrabMark size={56} />
      <span className="lg-muted">{text}</span>
    </div>
  );
}
