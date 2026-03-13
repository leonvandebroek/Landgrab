import { useState, useCallback } from 'react';
import i18n from '../i18n';
import type { AuthState } from '../types/game';

export interface AuthApiErrorShape {
  message: string;
  fieldErrors?: Record<string, string>;
}

export class AuthApiError extends Error {
  readonly fieldErrors?: Record<string, string>;

  constructor({ message, fieldErrors }: AuthApiErrorShape) {
    super(message);
    this.name = 'AuthApiError';
    this.fieldErrors = fieldErrors;
  }
}

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
      throw await parseAuthApiError(res, i18n.t('auth.loginFailed'));
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
      throw await parseAuthApiError(res, i18n.t('auth.registrationFailed'));
    }
    const data: AuthState & { token: string; username: string; userId: string } = await res.json();
    setAuth({ token: data.token, username: data.username, userId: data.userId });
    return data;
  }, [setAuth]);

  const logout = useCallback(() => setAuth(null), [setAuth]);

  return { auth, login, register, logout };
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
