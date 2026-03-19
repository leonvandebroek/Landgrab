import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';

export interface PlayerSession {
  id: string;
  context: BrowserContext;
  page: Page;
  username: string;
  userId?: string;
  token?: string;
}

const FRONTEND_URL = process.env.LANDGRAB_FRONTEND_URL ?? 'http://localhost:5173';

let browser: Browser | null = null;
const sessions = new Map<string, PlayerSession>();

export async function ensureBrowser(): Promise<Browser> {
  if (!browser || !browser.isConnected()) {
    browser = await chromium.launch({ headless: true });
  }
  return browser;
}

export async function createSession(id: string, viewport?: { width: number; height: number }): Promise<PlayerSession> {
  if (sessions.has(id)) {
    throw new Error(`Session "${id}" already exists`);
  }
  const b = await ensureBrowser();
  const context = await b.newContext(viewport ? { viewport } : undefined);
  const page = await context.newPage();
  const session: PlayerSession = { id, context, page, username: '' };
  sessions.set(id, session);
  return session;
}

export function getSession(id: string): PlayerSession {
  const session = sessions.get(id);
  if (!session) throw new Error(`Session "${id}" not found`);
  return session;
}

export async function destroySession(id: string): Promise<void> {
  const session = sessions.get(id);
  if (session) {
    await session.context.close();
    sessions.delete(id);
  }
}

export async function destroyAllSessions(): Promise<void> {
  for (const [id] of sessions) {
    await destroySession(id);
  }
  if (browser) {
    await browser.close();
    browser = null;
  }
}

export function listSessions(): string[] {
  return Array.from(sessions.keys());
}

export function getFrontendUrl(): string {
  return FRONTEND_URL;
}
