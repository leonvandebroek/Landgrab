import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { AuthApiError } from '../../hooks/useAuth';

interface Props {
  onLogin: (usernameOrEmail: string, password: string) => Promise<unknown>;
  onRegister: (username: string, email: string, password: string) => Promise<unknown>;
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

  return (
    <div className="auth-page">
      <div className="auth-card auth-shell">
        <div className="auth-hero-panel">
          <div className="auth-hero-copy">
            <span className="section-kicker">{t('auth.leadBadge')}</span>
            <div className="auth-logo">
              <span className="logo-icon">🗺️</span>
              <div>
                <h1>Landgrab</h1>
                <p>{t('auth.tagline')}</p>
              </div>
            </div>

            <h2>{t('auth.leadTitle')}</h2>
            <p className="subtitle auth-subtitle">{t('auth.leadBody')}</p>
          </div>

          <div className="auth-benefit-list" aria-label={t('auth.trustTitle')}>
            <div className="auth-benefit-card">
              <strong>{t('auth.trustTitle')}</strong>
              <span>{t('auth.trustBody')}</span>
            </div>
            <div className="auth-benefit-card compact">
              <strong>{t('auth.playTitle')}</strong>
              <span>{t('auth.playBody')}</span>
            </div>
          </div>
        </div>

        <div className="auth-form-panel">
          <div className="auth-tabs">
            <button
              type="button"
              data-testid="auth-sign-in-tab"
              className={mode === 'login' ? 'active' : ''}
              onClick={() => {
                setMode('login');
                setError('');
                setFieldErrors({});
              }}
            >
              {t('auth.signIn')}
            </button>
            <button
              type="button"
              data-testid="auth-sign-up-tab"
              className={mode === 'register' ? 'active' : ''}
              onClick={() => {
                setMode('register');
                setError('');
                setFieldErrors({});
              }}
            >
              {t('auth.signUp')}
            </button>
          </div>

          <div className="auth-form-header">
            <h3>{mode === 'login' ? t('auth.signInTitle') : t('auth.signUpTitle')}</h3>
            <p className="section-note">{mode === 'login' ? t('auth.signInBody') : t('auth.signUpBody')}</p>
          </div>

          <form onSubmit={submit} className="auth-form">
            <div className="field">
              <label>{mode === 'login' ? t('auth.usernameOrEmail') : t('auth.username')}</label>
              <input
                type="text"
                data-testid="auth-username-input"
                value={username}
                onChange={e => {
                  setUsername(e.target.value);
                  setFieldErrors(prev => ({ ...prev, username: '' }));
                }}
                placeholder={mode === 'login' ? t('auth.usernameOrEmailPlaceholder') : t('auth.usernamePlaceholder')}
                required
                autoComplete="username"
              />
              {fieldErrors.username && <p className="error-msg field-error">{fieldErrors.username}</p>}
            </div>

            {mode === 'register' && (
              <div className="field">
                <label>{t('auth.email')}</label>
                <input
                  type="email"
                  data-testid="auth-email-input"
                  value={email}
                  onChange={e => {
                    setEmail(e.target.value);
                    setFieldErrors(prev => ({ ...prev, email: '' }));
                  }}
                  placeholder={t('auth.emailPlaceholder')}
                  required
                  autoComplete="email"
                />
                {fieldErrors.email && <p className="error-msg field-error">{fieldErrors.email}</p>}
              </div>
            )}

            <div className="field">
              <label>{t('auth.password')}</label>
              <input
                type="password"
                data-testid="auth-password-input"
                value={password}
                onChange={e => {
                  setPassword(e.target.value);
                  setFieldErrors(prev => ({ ...prev, password: '' }));
                }}
                placeholder="••••••••"
                required
                minLength={8}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              />
              {fieldErrors.password && <p className="error-msg field-error">{fieldErrors.password}</p>}
            </div>

            {error && <p className="error-msg">{error}</p>}

            <button type="submit" className="btn-primary auth-submit" data-testid="auth-submit-btn" disabled={loading}>
              {loading ? t('auth.pleaseWait') : mode === 'login' ? t('auth.signIn') : t('auth.createAccount')}
            </button>
          </form>

          <p className="auth-footer">
            {t('auth.footer')}
          </p>
        </div>
      </div>
    </div>
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
