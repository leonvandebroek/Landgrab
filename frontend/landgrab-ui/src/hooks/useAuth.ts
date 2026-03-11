import { useState, useCallback } from 'react';
import i18n from '../i18n';
import type { AuthState } from '../types/game';

const STORAGE_KEY = 'landgrab_auth';

function loadAuth(): AuthState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function useAuth() {
  const [auth, setAuthState] = useState<AuthState | null>(loadAuth);

  const setAuth = useCallback((next: AuthState | null) => {
    setAuthState(next);
    if (next) localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    else localStorage.removeItem(STORAGE_KEY);
  }, []);

  const login = useCallback(async (usernameOrEmail: string, password: string) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usernameOrEmail, password })
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || i18n.t('auth.loginFailed'));
    }
    const data: AuthState & { token: string; username: string; userId: string } = await res.json();
    setAuth({ token: data.token, username: data.username, userId: data.userId });
    return data;
  }, [setAuth]);

  const register = useCallback(async (username: string, email: string, password: string) => {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password })
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || i18n.t('auth.registrationFailed'));
    }
    const data: AuthState & { token: string; username: string; userId: string } = await res.json();
    setAuth({ token: data.token, username: data.username, userId: data.userId });
    return data;
  }, [setAuth]);

  const logout = useCallback(() => setAuth(null), [setAuth]);

  return { auth, login, register, logout };
}
