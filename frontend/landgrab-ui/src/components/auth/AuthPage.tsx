import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { AuthApiError } from '../../hooks/useAuth';
import { Button, Screen, cx } from '../ui/kit';

interface Props {
  onLogin: (usernameOrEmail: string, password: string) => Promise<unknown>;
  onRegister: (username: string, email: string, password: string) => Promise<unknown>;
}

export function LandgrabMark({ size = 64 }: { size?: number }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} role="img" aria-label="Landgrab">
      <path d="M32 4 56 18v28L32 60 8 46V18L32 4Z" fill="#C6F24E" />
      <path d="M24 44V20" fill="none" stroke="#0E1418" strokeWidth="4" strokeLinecap="round" />
      <path d="M24 21h18l-4 6.5 4 6.5H24" fill="none" stroke="#0E1418" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function AuthPage({ onLogin, onRegister }: Props) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const localFieldErrors = validateFields(mode, username, email, password, t);
    setFieldErrors(localFieldErrors);
    if (Object.keys(localFieldErrors).length > 0) {
      return;
    }

    setLoading(true);
    try {
      if (mode === 'login') {
        await onLogin(username, password);
      } else {
        await onRegister(username, email, password);
      }
    } catch (err) {
      if (err instanceof AuthApiError && err.fieldErrors) {
        setFieldErrors(err.fieldErrors);
      }
      setError(err instanceof Error ? err.message : t('auth.somethingWentWrong'));
    } finally {
      setLoading(false);
    }
  };

  const switchMode = (next: 'login' | 'register') => {
    setMode(next);
    setError('');
    setFieldErrors({});
  };

  return (
    <Screen testId="auth-page">
      <div className="lg-auth lg-stack">
        <div className="lg-auth__brand">
          <LandgrabMark />
          <div className="lg-stack lg-stack--sm">
            <h1 className="lg-auth__title">Landgrab</h1>
            <p className="lg-auth__tagline">{t('ui.auth.tagline')}</p>
          </div>
        </div>

        <div className="lg-seg" role="tablist" aria-label={t('ui.auth.modeLabel')}>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'login'}
            className={cx('lg-seg__item', mode === 'login' && 'is-active')}
            data-testid="auth-sign-in-tab"
            onClick={() => switchMode('login')}
          >
            {t('ui.auth.signIn')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'register'}
            className={cx('lg-seg__item', mode === 'register' && 'is-active')}
            data-testid="auth-sign-up-tab"
            onClick={() => switchMode('register')}
          >
            {t('ui.auth.createAccount')}
          </button>
        </div>

        <form onSubmit={submit} noValidate>
          <div className="lg-field">
            <label className="lg-label" htmlFor="auth-username">
              {mode === 'login' ? t('ui.auth.usernameOrEmail') : t('ui.auth.username')}
            </label>
            <input
              id="auth-username"
              className={cx('lg-input', fieldErrors.username && 'is-invalid')}
              type="text"
              data-testid="auth-username-input"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              aria-invalid={Boolean(fieldErrors.username)}
            />
            {fieldErrors.username && <span className="lg-field__error">{fieldErrors.username}</span>}
          </div>

          {mode === 'register' && (
            <div className="lg-field">
              <label className="lg-label" htmlFor="auth-email">{t('ui.auth.email')}</label>
              <input
                id="auth-email"
                className={cx('lg-input', fieldErrors.email && 'is-invalid')}
                type="email"
                data-testid="auth-email-input"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                autoCapitalize="none"
                aria-invalid={Boolean(fieldErrors.email)}
              />
              {fieldErrors.email && <span className="lg-field__error">{fieldErrors.email}</span>}
            </div>
          )}

          <div className="lg-field">
            <label className="lg-label" htmlFor="auth-password">{t('ui.auth.password')}</label>
            <input
              id="auth-password"
              className={cx('lg-input', fieldErrors.password && 'is-invalid')}
              type="password"
              data-testid="auth-password-input"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              aria-invalid={Boolean(fieldErrors.password)}
            />
            {fieldErrors.password && <span className="lg-field__error">{fieldErrors.password}</span>}
          </div>

          {error && <p className="lg-error" role="alert">{error}</p>}

          <Button type="submit" testId="auth-submit-btn" disabled={loading}>
            {loading ? t('auth.pleaseWait') : mode === 'login' ? t('ui.auth.signIn') : t('ui.auth.createAccount')}
          </Button>
        </form>

        <p className="lg-small lg-center">{t('ui.auth.privacy')}</p>
      </div>
    </Screen>
  );
}

function validateFields(
  mode: 'login' | 'register',
  username: string,
  email: string,
  password: string,
  t: TFunction
): Record<string, string> {
  const errors: Record<string, string> = {};

  if (!username.trim()) {
    errors.username = mode === 'login'
      ? t('auth.validation.usernameOrEmailRequired')
      : t('auth.validation.usernameRequired');
  }

  if (mode === 'register' && !email.trim()) {
    errors.email = t('auth.validation.emailRequired');
  } else if (mode === 'register' && !/^\S+@\S+\.\S+$/.test(email.trim())) {
    errors.email = t('auth.validation.emailInvalid');
  }

  if (!password.trim()) {
    errors.password = t('auth.validation.passwordRequired');
  } else if (password.trim().length < 8) {
    errors.password = t('auth.validation.passwordMinLength');
  }

  return errors;
}
