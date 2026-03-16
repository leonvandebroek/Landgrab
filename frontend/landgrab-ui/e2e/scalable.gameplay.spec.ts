import { test, expect } from '@playwright/test';
import { createPlayerPool } from './helpers/player-pool.js';

test.describe('Scalable Multiplayer', () => {
  test('player pool supports indexed player creation', async ({ browser }) => {
    const pool = await createPlayerPool(browser, 'http://localhost:5173');

    try {
      // Create 3 players by index
      const p1 = await pool.createPlayer('player-1');
      const p2 = await pool.createPlayer('player-2');
      const p3 = await pool.createPlayer('player-3');

      expect(pool.size).toBe(3);
      expect(p1.username).toBeTruthy();
      expect(p2.username).toBeTruthy();
      expect(p3.username).toBeTruthy();

      // Verify p1 can be retrieved from pool
      expect(pool.getPlayer('player-1')).toBe(p1);

      // All usernames should be unique
      const usernames = new Set([p1.username, p2.username, p3.username]);
      expect(usernames.size).toBe(3);

      // Can retrieve players by ID
      expect(pool.getPlayer('player-1').username).toBe(p1.username);
      expect(pool.getPlayer('player-2').username).toBe(p2.username);

      // All players should be in the lobby
      await p1.page.waitForTimeout(1000);
      await p2.page.waitForTimeout(1000);
      await p3.page.waitForTimeout(1000);

    } finally {
      await pool.destroyAll();
      expect(pool.size).toBe(0);
    }
  });

  test('player pool handles individual player destruction', async ({ browser }) => {
    const pool = await createPlayerPool(browser, 'http://localhost:5173');

    try {
      const p1 = await pool.createPlayer('player-1');
      const p2 = await pool.createPlayer('player-2');

      expect(pool.size).toBe(2);

      // Verify p1 exists before destruction
      expect(p1.username).toBeTruthy();

      // Destroy one player
      await pool.destroyPlayer('player-1');
      expect(pool.size).toBe(1);

      // Remaining player should still be accessible
      expect(pool.getPlayer('player-2')).toBe(p2);

      // Attempting to get destroyed player should throw
      expect(() => pool.getPlayer('player-1')).toThrow('Player "player-1" not found in pool');

    } finally {
      await pool.destroyAll();
    }
  });

  test('player pool prevents duplicate player IDs', async ({ browser }) => {
    const pool = await createPlayerPool(browser, 'http://localhost:5173');

    try {
      await pool.createPlayer('player-1');

      // Attempting to create a player with the same ID should throw
      await expect(pool.createPlayer('player-1')).rejects.toThrow('Player "player-1" already exists in pool');

    } finally {
      await pool.destroyAll();
    }
  });
});
