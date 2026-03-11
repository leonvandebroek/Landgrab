import { useState } from 'react';
import { useTranslation } from 'react-i18next';

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
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'login') {
        await onLogin(username, password);
      } else {
        await onRegister(username, email, password);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.somethingWentWrong'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <span className="logo-icon">🗺️</span>
          <h1>Landgrab</h1>
          <p>{t('auth.tagline')}</p>
        </div>

        <div className="auth-tabs">
          <button
            className={mode === 'login' ? 'active' : ''}
            onClick={() => setMode('login')}
          >
            {t('auth.signIn')}
          </button>
          <button
            className={mode === 'register' ? 'active' : ''}
            onClick={() => setMode('register')}
          >
            {t('auth.signUp')}
          </button>
        </div>

        <form onSubmit={submit} className="auth-form">
          <div className="field">
            <label>{mode === 'login' ? t('auth.usernameOrEmail') : t('auth.username')}</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder={mode === 'login' ? t('auth.usernameOrEmailPlaceholder') : t('auth.usernamePlaceholder')}
              required
              autoComplete="username"
            />
          </div>

          {mode === 'register' && (
            <div className="field">
              <label>{t('auth.email')}</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder={t('auth.emailPlaceholder')}
                required
                autoComplete="email"
              />
            </div>
          )}

          <div className="field">
            <label>{t('auth.password')}</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              minLength={8}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
          </div>

          {error && <p className="error-msg">{error}</p>}

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? t('auth.pleaseWait') : mode === 'login' ? t('auth.signIn') : t('auth.createAccount')}
          </button>
        </form>

        <p className="auth-footer">
          {t('auth.footer')}
        </p>
      </div>
    </div>
  );
}
