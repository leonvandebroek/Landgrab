import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getSession } from '../lib/browser-registry.js';
import { getAgentSnapshot, pollAgentBridge } from '../lib/agent-bridge.js';

function jsonResult(payload: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(payload) }] };
}

// Default map seed location (Brussels) used when no location has been set yet.
const DEFAULT_LAT = 50.8503;
const DEFAULT_LNG = 4.3517;

export function registerMovementTools(server: McpServer): void {
  server.tool(
    'player_enable_debug_gps',
    [
      'Open the debug GPS panel and activate simulated GPS for this session.',
      'If the room has no map location set yet, a default location (Brussels) is sent via the LocationStep manual form first.',
      'Steps: 1) open dev-tools panel, 2) ensure map location exists, 3) activate debug GPS.',
    ].join(' '),
    { sessionId: z.string() },
    async ({ sessionId }) => {
      const session = getSession(sessionId);
      const page = session.page;
      const panel = page.locator('[data-testid="debug-gps-panel"]');

      // ── Step 1: open the dev-tools panel ──────────────────────────────────
      // Class is debug-tools-toggle in wizard/lobby, debug-toggle-ingame in game view.
      const panelVisible = await panel.isVisible().catch(() => false);
      if (!panelVisible) {
        const devToggle = page.locator('.debug-tools-toggle, .debug-toggle-ingame').first();
        await devToggle.waitFor({ state: 'visible', timeout: 10_000 });
        await devToggle.dispatchEvent('click');
        await panel.waitFor({ state: 'visible', timeout: 5_000 });
      }

      // ── Step 2: ensure a map location is set ──────────────────────────────
      // debug-gps-toggle is disabled while mapCenter (gameState.mapLat/Lng) is null.
      const applyBtn = page.locator('[data-testid="debug-gps-toggle"]');
      await applyBtn.waitFor({ state: 'visible', timeout: 5_000 });
      const applyDisabled = await applyBtn.isDisabled();

      if (applyDisabled) {
        // Open the manual coordinate form using its stable testid.
        const manualToggle = page.locator('[data-testid="location-manual-toggle"]');
        await manualToggle.waitFor({ state: 'visible', timeout: 5_000 });

        // Open the form only if not already shown.
        const formAlreadyOpen = await page.locator('[data-testid="location-manual-form"]').isVisible().catch(() => false);
        if (!formAlreadyOpen) {
          await manualToggle.click();
          await page.locator('[data-testid="location-manual-form"]').waitFor({ state: 'visible', timeout: 3_000 });
        }

        await page.locator('[data-testid="location-manual-lat"]').fill(String(DEFAULT_LAT));
        await page.locator('[data-testid="location-manual-lng"]').fill(String(DEFAULT_LNG));
        await page.locator('[data-testid="location-manual-apply"]').click();

        // Wait for the server to echo back mapLat/Lng (Apply GPS button becomes enabled).
        await page.waitForFunction(
          () => !(document.querySelector('[data-testid="debug-gps-toggle"]') as HTMLButtonElement | null)?.disabled,
          { timeout: 10_000 },
        );
      }

      // ── Step 3: activate debug GPS ────────────────────────────────────────
      const isActive = await panel.evaluate(el => el.classList.contains('is-active')).catch(() => false);
      if (!isActive) {
        await applyBtn.dispatchEvent('click');
        await page.waitForFunction(
          () => document.querySelector('[data-testid="debug-gps-panel"]')?.classList.contains('is-active'),
          { timeout: 5_000 },
        );
      }

      return {
        content: [{ type: 'text', text: JSON.stringify({ status: 'debug_gps_enabled', lat: DEFAULT_LAT, lng: DEFAULT_LNG }) }],
      };
    },
  );

  server.tool(
    'player_step_hex',
    'Move the player one hex step in a cardinal direction using debug GPS. Call player_enable_debug_gps first.',
    {
      sessionId: z.string(),
      direction: z.enum(['north', 'south', 'east', 'west']),
    },
    async ({ sessionId, direction }) => {
      const session = getSession(sessionId);
      const page = session.page;
      const btn = page.locator(`[data-testid="debug-gps-step-${direction}"]`);
      await btn.waitFor({ state: 'visible', timeout: 5_000 });
      await page.waitForFunction(
        (sel: string) => !(document.querySelector(sel) as HTMLButtonElement | null)?.disabled,
        `[data-testid="debug-gps-step-${direction}"]`,
        { timeout: 5_000 },
      );
      await btn.click();
      await page.waitForTimeout(500);
      return {
        content: [{ type: 'text', text: JSON.stringify({ direction, status: 'stepped' }) }],
      };
    },
  );

  server.tool(
    'player_move_steps',
    'Move multiple hex steps in one direction. Call player_enable_debug_gps first.',
    {
      sessionId: z.string(),
      direction: z.enum(['north', 'south', 'east', 'west']),
      count: z.number().int().min(1).max(20),
    },
    async ({ sessionId, direction, count }) => {
      const session = getSession(sessionId);
      const page = session.page;
      const btn = page.locator(`[data-testid="debug-gps-step-${direction}"]`);
      await page.waitForFunction(
        (sel: string) => !(document.querySelector(sel) as HTMLButtonElement | null)?.disabled,
        `[data-testid="debug-gps-step-${direction}"]`,
        { timeout: 5_000 },
      );
      for (let i = 0; i < count; i++) {
        await btn.click();
        await page.waitForTimeout(300);
      }
      return {
        content: [{ type: 'text', text: JSON.stringify({ direction, count, status: 'moved' }) }],
      };
    },
  );

  server.tool(
    'player_navigate_to_hex',
    [
      'Navigate the player to a target hex (q, r) by automatically computing and executing the required step sequence.',
      'Derives the current hex from the bridge, calculates delta_q/delta_r, moves east/west then north/south,',
      'and waits until the bridge confirms arrival. Call player_enable_debug_gps first.',
    ].join(' '),
    {
      sessionId: z.string(),
      q: z.number().int(),
      r: z.number().int(),
    },
    async ({ sessionId, q: targetQ, r: targetR }) => {
      const { page } = getSession(sessionId);

      const initialSnapshot = await getAgentSnapshot<any>(page);
      const currentHex = initialSnapshot?.currentHex;
      if (!Array.isArray(currentHex) || currentHex.length !== 2) {
        throw new Error('Current player hex is not available. Call player_enable_debug_gps first.');
      }

      const [cq, cr] = currentHex.map(Number);
      const dq = targetQ - cq;
      const dr = targetR - cr;

      if (dq === 0 && dr === 0) {
        return jsonResult({ sessionId, from: [cq, cr], to: [targetQ, targetR], steps: [], status: 'already_there' });
      }

      const stepsExecuted: Array<{ direction: string; count: number }> = [];

      const moveAxis = async (direction: 'north' | 'south' | 'east' | 'west', count: number) => {
        if (count <= 0) return;
        stepsExecuted.push({ direction, count });
        const btn = page.locator(`[data-testid="debug-gps-step-${direction}"]`);
        await page.waitForFunction(
          (sel: string) => !(document.querySelector(sel) as HTMLButtonElement | null)?.disabled,
          `[data-testid="debug-gps-step-${direction}"]`,
          { timeout: 5_000 },
        );
        for (let i = 0; i < count; i++) {
          await btn.click();
          await page.waitForTimeout(300);
        }
      };

      // Axial mapping: east = +q, west = -q, north = +r, south = -r
      if (dq > 0) await moveAxis('east', dq);
      else if (dq < 0) await moveAxis('west', -dq);
      if (dr > 0) await moveAxis('north', dr);
      else if (dr < 0) await moveAxis('south', -dr);

      // Wait for bridge to confirm arrival
      const finalSnapshot = await pollAgentBridge<any>(
        page,
        () => getAgentSnapshot(page),
        (snap) => snap?.currentHex?.[0] === targetQ && snap?.currentHex?.[1] === targetR,
        { timeoutMs: 8_000, intervalMs: 300 },
      ).catch((err: Error) => ({ error: err.message, currentHex: null }));

      const arrivedAt = finalSnapshot?.currentHex ?? null;
      return jsonResult({
        sessionId,
        from: [cq, cr],
        to: [targetQ, targetR],
        steps: stepsExecuted,
        arrivedAt,
        success: Array.isArray(arrivedAt) && arrivedAt[0] === targetQ && arrivedAt[1] === targetR,
      });
    },
  );
}
