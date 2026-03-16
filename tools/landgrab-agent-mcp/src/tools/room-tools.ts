import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getSession } from '../lib/browser-registry.js';

export function registerRoomTools(server: McpServer): void {
  server.tool(
    'room_create',
    'Create a new game room. Returns the room code.',
    { sessionId: z.string() },
    async ({ sessionId }) => {
      const session = getSession(sessionId);
      const page = session.page;
      await page.locator('[data-testid="lobby-create-room-btn"]').click();
      const roomCodeEl = page.locator('[data-testid="wizard-room-code"]');
      await roomCodeEl.waitFor({ state: 'visible', timeout: 10000 });
      const roomCode = await roomCodeEl.textContent() ?? '';
      return {
        content: [{ type: 'text', text: JSON.stringify({ roomCode, status: 'room_created' }) }],
      };
    },
  );

  server.tool(
    'room_join',
    'Join an existing room by code.',
    { sessionId: z.string(), roomCode: z.string().length(6) },
    async ({ sessionId, roomCode }) => {
      const session = getSession(sessionId);
      const page = session.page;
      await page.locator('[data-testid="lobby-join-code-input"]').fill(roomCode);
      await page.locator('[data-testid="lobby-join-btn"]').click();
      await page.waitForTimeout(2000);
      return {
        content: [{ type: 'text', text: JSON.stringify({ roomCode, status: 'joined' }) }],
      };
    },
  );

  server.tool(
    'room_wizard_next',
    'Click the Next button in the setup wizard.',
    { sessionId: z.string() },
    async ({ sessionId }) => {
      const session = getSession(sessionId);
      await session.page.locator('[data-testid="wizard-next-btn"]').click();
      await session.page.waitForTimeout(500);
      return {
        content: [{ type: 'text', text: JSON.stringify({ status: 'wizard_advanced' }) }],
      };
    },
  );

  server.tool(
    'room_start',
    'Start the game (host only, from the Review step).',
    { sessionId: z.string() },
    async ({ sessionId }) => {
      const session = getSession(sessionId);
      const page = session.page;
      const startBtn = page.locator('[data-testid="wizard-start-game-btn"]');
      if (await startBtn.isVisible().catch(() => false)) {
        await startBtn.click();
      } else {
        await page.locator('button:has-text("Start")').first().click();
      }
      await page.waitForTimeout(2000);
      return {
        content: [{ type: 'text', text: JSON.stringify({ status: 'game_started' }) }],
      };
    },
  );
}
