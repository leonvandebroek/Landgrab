import type { Page } from 'playwright';

const API_BASE = process.env.LANDGRAB_API_URL ?? 'http://localhost:5001';

export interface AuthResult {
  token: string;
  username: string;
  userId: string;
}

export async function registerUserApi(
  username: string,
  email: string,
  password: string,
): Promise<AuthResult> {
  const res = await fetch(`${API_BASE}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, email, password }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Registration failed (${res.status}): ${err}`);
  }
  return res.json() as Promise<AuthResult>;
}

export async function loginUserApi(
  usernameOrEmail: string,
  password: string,
): Promise<AuthResult> {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usernameOrEmail, password }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Login failed (${res.status}): ${err}`);
  }
  return res.json() as Promise<AuthResult>;
}

export async function injectAuthIntoPage(
  page: Page,
  auth: AuthResult,
): Promise<void> {
  // The backend uses an HttpOnly cookie named 'landgrab_token' for auth
  await page.context().addCookies([{
    name: 'landgrab_token',
    value: auth.token,
    domain: 'localhost',
    path: '/',
    httpOnly: true,
    secure: false,
    sameSite: 'Strict',
  }]);
}

export async function registerViaUI(
  page: Page,
  username: string,
  email: string,
  password: string,
): Promise<void> {
  await page.locator('[data-testid="auth-sign-up-tab"]').click();
  await page.locator('[data-testid="auth-username-input"]').fill(username);
  await page.locator('[data-testid="auth-email-input"]').fill(email);
  await page.locator('[data-testid="auth-password-input"]').fill(password);
  await page.locator('[data-testid="auth-submit-btn"]').click();
}

export async function loginViaUI(
  page: Page,
  usernameOrEmail: string,
  password: string,
): Promise<void> {
  await page.locator('[data-testid="auth-sign-in-tab"]').click();
  await page.locator('[data-testid="auth-username-input"]').fill(usernameOrEmail);
  await page.locator('[data-testid="auth-password-input"]').fill(password);
  await page.locator('[data-testid="auth-submit-btn"]').click();
}
