import { useCallback, useEffect, useState } from 'react';
import i18n from '../i18n';
import type { AuthState } from '../types/game';

export interface AuthApiErrorShape {
  message: string;
  fieldErrors?: Record<string, string>;
}

interface AuthIdentityResponse {
  username: string;
  userId: string;
}

interface AuthMutationResponse extends AuthIdentityResponse {
  token: string;
}

const AUTH_REFRESH_INTERVAL_MS = 15 * 60 * 1000;

export class AuthApiError extends Error {
  readonly fieldErrors?: Record<string, string>;

  constructor({ message, fieldErrors }: AuthApiErrorShape) {
    super(message);
    this.name = 'AuthApiError';
    this.fieldErrors = fieldErrors;
  }
}

export function useAuth() {
  const [auth, setAuthState] = useState<AuthState | null>(null);
  const [authReady, setAuthReady] = useState(false);

  const clearAuth = useCallback(() => {
    setAuthState(null);
  }, []);

  const loadCurrentUser = useCallback(async () => {
    const res = await fetch('/api/auth/me', {
      credentials: 'include',
    });

    if (res.status === 401) {
      clearAuth();
      return null;
    }

    if (!res.ok) {
      throw new Error(i18n.t('auth.loginFailed'));
    }

    const data = await res.json() as AuthIdentityResponse;
    setAuthState(current => ({
      token: current?.token ?? '',
      username: data.username,
      userId: data.userId,
    }));

    return data;
  }, [clearAuth]);

  const refreshAuthCookie = useCallback(async () => {
    const res = await fetch('/api/auth/refresh', {
      method: 'POST',
      credentials: 'include',
    });

    if (res.status === 401) {
      clearAuth();
      return false;
    }

    if (!res.ok) {
      throw new Error(`Token refresh failed with status ${res.status}`);
    }

    return true;
  }, [clearAuth]);

  useEffect(() => {
    let cancelled = false;

    void Promise.resolve().then(async () => {
      try {
        await loadCurrentUser();
      } catch {
        if (!cancelled) {
          clearAuth();
        }
      } finally {
        if (!cancelled) {
          setAuthReady(true);
        }
      }
    });

    return () => {
      cancelled = true;
    };
  }, [clearAuth, loadCurrentUser]);

  useEffect(() => {
    if (!auth) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void Promise.resolve().then(async () => {
        try {
          await refreshAuthCookie();
        } catch {
          // Ignore transient refresh failures; a later refresh or auth action will recover.
        }
      });
    }, AUTH_REFRESH_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [auth, refreshAuthCookie]);

  const login = useCallback(async (usernameOrEmail: string, password: string) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usernameOrEmail, password })
    });

    if (!res.ok) {
      throw await parseAuthApiError(res, i18n.t('auth.loginFailed'));
    }

    const data = await res.json() as AuthMutationResponse;
    setAuthState({ token: data.token, username: data.username, userId: data.userId });
    setAuthReady(true);
    return data;
  }, []);

  const register = useCallback(async (username: string, email: string, password: string) => {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password })
    });

    if (!res.ok) {
      throw await parseAuthApiError(res, i18n.t('auth.registrationFailed'));
    }

    const data = await res.json() as AuthMutationResponse;
    setAuthState({ token: data.token, username: data.username, userId: data.userId });
    setAuthReady(true);
    return data;
  }, []);

  const logout = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });

      if (!res.ok && res.status !== 401) {
        throw new Error(`Logout failed with status ${res.status}`);
      }
    } finally {
      clearAuth();
      setAuthReady(true);
    }
  }, [clearAuth]);

  return { auth, authReady, login, register, logout };
}

async function parseAuthApiError(response: Response, fallbackMessage: string): Promise<AuthApiError> {
  const data = await response.json().catch(() => ({})) as Record<string, unknown>;
  const message = getFirstString(data.error)
    ?? getFirstString(data.message)
    ?? fallbackMessage;
  const fieldErrors = normalizeFieldErrors(data.errors);

  return new AuthApiError({
    message,
    fieldErrors: Object.keys(fieldErrors).length > 0 ? fieldErrors : undefined
  });
}

function normalizeFieldErrors(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {};
  }

  const fieldErrors: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    const normalizedKey = normalizeFieldKey(String(key));
    const message = getFirstString(value);
    if (message) {
      fieldErrors[normalizedKey] = message;
    }
  }

  return fieldErrors;
}

function getFirstString(value: unknown): string | null {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === 'string' && item.trim().length > 0) {
        return item;
      }
    }
  }

  return null;
}

function normalizeFieldKey(rawKey: string): string {
  const compact = rawKey.toLowerCase().replace(/[^a-z]/g, '');
  if (compact.includes('username') || compact.includes('user')) {
    return 'username';
  }
  if (compact.includes('email')) {
    return 'email';
  }
  if (compact.includes('password')) {
    return 'password';
  }

  return rawKey.toLowerCase();
}
