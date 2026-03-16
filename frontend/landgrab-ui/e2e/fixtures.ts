/* eslint-disable react-hooks/rules-of-hooks */
import { test as base, type Page, type BrowserContext } from '@playwright/test';
import fs from 'node:fs';
import { PLAYER_AUTH_FILES, USERS_META_FILE } from './helpers/auth-paths.js';
import type { TestUser } from './helpers/auth.js';

const BASE_URL = 'http://localhost:5173';

export interface PlayerSession {
  context: BrowserContext;
  page: Page;
  user: TestUser;
}

interface MultiplayerFixtures {
  host: PlayerSession;
  guest: PlayerSession;
  createPlayerSession: (prefix?: string) => Promise<PlayerSession>;
}

function loadStoredUsers(): TestUser[] {
  try {
    return JSON.parse(fs.readFileSync(USERS_META_FILE, 'utf-8'));
  } catch {
    throw new Error('Auth setup not run. Execute: npx playwright test --project=setup');
  }
}

export const test = base.extend<MultiplayerFixtures>({
  // Each test gets a slot counter that increments as players are created.
  // host → slot 0, guest → slot 1, any additional createPlayerSession call → slot 2+
  createPlayerSession: async ({ browser }, use) => {
    let slotIndex = 0;
    const sessions: PlayerSession[] = [];
    const storedUsers = loadStoredUsers();

    const factory = async (_prefix?: string) => {
      const index = slotIndex++;
      if (index >= PLAYER_AUTH_FILES.length) {
        throw new Error(`Player pool exhausted (max ${PLAYER_AUTH_FILES.length} players per test)`);
      }

      // Restore the saved cookie jar — no auth API calls needed
      const context = await browser.newContext({ baseURL: BASE_URL, storageState: PLAYER_AUTH_FILES[index] });
      const page = await context.newPage();

      await page.goto('/');
      await page.getByTestId('lobby-create-room-btn').waitFor({ state: 'visible', timeout: 15000 });

      const session: PlayerSession = { context, page, user: storedUsers[index] as TestUser };
      sessions.push(session);
      return session;
    };

    await use(factory);
    for (const s of sessions) await s.context.close();
  },

  host: async ({ createPlayerSession }, use) => {
    await use(await createPlayerSession('host'));
  },

  guest: async ({ createPlayerSession }, use) => {
    await use(await createPlayerSession('guest'));
  },
});

export { expect } from '@playwright/test';
