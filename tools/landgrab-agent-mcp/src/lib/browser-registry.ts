import { chromium, type Browser, type BrowserContext, type Page, type BrowserContextOptions } from 'playwright';

export interface PlayerSession {
  id: string;
  context: BrowserContext;
  page: Page;
  username: string;
  userId?: string;
  token?: string;
}

const FRONTEND_URL = process.env.LANDGRAB_FRONTEND_URL ?? 'http://localhost:5173';

// iPhone 17 Pro — matches iPhone 16 Pro form factor (6.3", 393×852 logical px, 3× DPR).
// Playwright doesn't have 17 Pro yet so we base it on the 15 Pro descriptor with an iOS 18 UA.
const IPHONE_17_PRO_CONTEXT: BrowserContextOptions = {
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  viewport: { width: 393, height: 659 },
  screen: { width: 393, height: 852 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
};

let browser: Browser | null = null;
const sessions = new Map<string, PlayerSession>();

export async function ensureBrowser(): Promise<Browser> {
  if (!browser || !browser.isConnected()) {
    browser = await chromium.launch({ headless: process.env.LANDGRAB_HEADLESS === 'true' });
  }
  return browser;
}

export async function createSession(id: string, viewport?: { width: number; height: number }): Promise<PlayerSession> {
  if (sessions.has(id)) {
    throw new Error(`Session "${id}" already exists`);
  }
  const b = await ensureBrowser();
  const contextOptions: BrowserContextOptions = viewport
    ? { ...IPHONE_17_PRO_CONTEXT, viewport }
    : IPHONE_17_PRO_CONTEXT;
  const context = await b.newContext(contextOptions);
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
