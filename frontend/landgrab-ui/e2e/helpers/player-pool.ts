import type { Browser, BrowserContext, Page } from '@playwright/test';
import { generateTestUser, registerViaPage } from './auth.js';

/**
 * Scalable player pool for multiplayer scenarios.
 * Supports N player contexts instead of hardcoded host/guest.
 */

export interface PlayerContext {
  id: string;
  context: BrowserContext;
  page: Page;
  username: string;
  token?: string;
  userId?: string;
}

export interface PlayerPool {
  players: Map<string, PlayerContext>;
  createPlayer(id: string): Promise<PlayerContext>;
  getPlayer(id: string): PlayerContext;
  destroyPlayer(id: string): Promise<void>;
  destroyAll(): Promise<void>;
  readonly size: number;
}

export async function createPlayerPool(browser: Browser, baseURL: string): Promise<PlayerPool> {
  const players = new Map<string, PlayerContext>();

  async function createPlayer(id: string): Promise<PlayerContext> {
    if (players.has(id)) {
      throw new Error(`Player "${id}" already exists in pool`);
    }

    const context = await browser.newContext({ baseURL });
    const page = await context.newPage();
    const testUser = generateTestUser();

    // Navigate first so page.request uses the Vite proxy for /api routes
    await page.goto(baseURL);
    // Register via page.request — Set-Cookie lands in the browser context's cookie jar
    const auth = await registerViaPage(page, testUser);
    await page.reload();
    await page.getByTestId('lobby-create-room-btn').waitFor({ state: 'visible', timeout: 15000 });

    const player: PlayerContext = {
      id,
      context,
      page,
      username: testUser.username,
      token: auth.token,
      userId: auth.userId,
    };

    players.set(id, player);
    return player;
  }

  function getPlayer(id: string): PlayerContext {
    const player = players.get(id);
    if (!player) {
      throw new Error(`Player "${id}" not found in pool`);
    }
    return player;
  }

  async function destroyPlayer(id: string): Promise<void> {
    const player = players.get(id);
    if (player) {
      await player.context.close();
      players.delete(id);
    }
  }

  async function destroyAll(): Promise<void> {
    for (const [, player] of players) {
      await player.context.close();
    }
    players.clear();
  }

  return {
    players,
    createPlayer,
    getPlayer,
    destroyPlayer,
    destroyAll,
    get size() { return players.size; },
  };
}
