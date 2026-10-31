import type { Page } from '@playwright/test';

export interface TestUser {
  username: string;
  email: string;
  password: string;
  token?: string;
  userId?: string;
}

export function generateTestUser(prefix: string = 'test'): TestUser {
  const suffix = Math.random().toString(36).substring(2, 8);
  return {
    username: `${prefix}_${suffix}`,
    email: `${prefix}_${suffix}@test.local`,
    password: 'TestPass123!',
  };
}

/** Register via Node.js fetch — returns auth data but does NOT set browser cookies. */
export async function registerUser(baseUrl: string, user: TestUser): Promise<TestUser> {
  const res = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: user.username, email: user.email, password: user.password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Register failed: ${res.status} ${JSON.stringify(err)}`);
  }
  const data = await res.json() as { token: string; userId: string };
  return { ...user, token: data.token, userId: data.userId };
}

/**
 * Register via browser-side fetch (page.evaluate) so the Set-Cookie response
 * lands in the browser's own cookie jar. No separate injectAuth call needed.
 */
export async function registerViaPage(page: Page, user: TestUser): Promise<TestUser> {
  const data = await page.evaluate(async ({ username, email, password }) => {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password }),
      credentials: 'include',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: res.statusText }));
      throw new Error(`Register failed: ${res.status} ${JSON.stringify(err)}`);
    }
    return res.json() as Promise<{ token: string; userId: string }>;
  }, { username: user.username, email: user.email, password: user.password });
  return { ...user, token: data.token, userId: data.userId };
}

/**
 * Login via browser-side fetch (page.evaluate) so the Set-Cookie response
 * lands in the browser's own cookie jar. No separate injectAuth call needed.
 */
export async function loginViaPage(page: Page, user: TestUser): Promise<TestUser> {
  const data = await page.evaluate(async ({ usernameOrEmail, password }) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usernameOrEmail, password }),
      credentials: 'include',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: res.statusText }));
      throw new Error(`Login failed: ${res.status} ${JSON.stringify(err)}`);
    }
    return res.json() as Promise<{ token: string; userId: string }>;
  }, { usernameOrEmail: user.username, password: user.password });
  return { ...user, token: data.token, userId: data.userId };
}

export async function loginUser(baseUrl: string, user: TestUser): Promise<TestUser> {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usernameOrEmail: user.username, password: user.password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Login failed: ${res.status} ${JSON.stringify(err)}`);
  }
  const data = await res.json() as { token: string; userId: string };
  return { ...user, token: data.token, userId: data.userId };
}

/** @deprecated Use registerViaPage or loginViaPage instead — cookie injection via addCookies is unreliable. */
export async function injectAuth(page: Page, user: TestUser): Promise<void> {
  if (!user.token || !user.userId) throw new Error('User must be authenticated first');
  await page.context().addCookies([{
    name: 'landgrab_token',
    value: user.token,
    domain: 'localhost',
    path: '/',
    httpOnly: true,
    secure: false,
    sameSite: 'Strict',
  }]);
}

export async function registerViaUI(page: Page, user: TestUser): Promise<void> {
  await page.getByTestId('auth-sign-up-tab').click();
  await page.getByTestId('auth-username-input').fill(user.username);
  await page.getByTestId('auth-email-input').fill(user.email);
  await page.getByTestId('auth-password-input').fill(user.password);
  await page.getByTestId('auth-submit-btn').click();
}

export async function loginViaUI(page: Page, user: TestUser): Promise<void> {
  await page.getByTestId('auth-sign-in-tab').click();
  await page.getByTestId('auth-username-input').fill(user.username);
  await page.getByTestId('auth-password-input').fill(user.password);
  await page.getByTestId('auth-submit-btn').click();
}
