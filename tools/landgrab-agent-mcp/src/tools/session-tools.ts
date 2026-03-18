import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createSession, destroySession, listSessions, destroyAllSessions, getFrontendUrl, getSession } from '../lib/browser-registry.js';
import { startConsoleCapture } from '../lib/evidence.js';
import { waitForAgentBridge } from '../lib/agent-bridge.js';

export function registerSessionTools(server: McpServer): void {
  server.tool(
    'session_create',
    'Create a new browser session for a player. Returns the session ID.',
    { sessionId: z.string().describe('Unique identifier for this player session') },
    async ({ sessionId }) => {
      const session = await createSession(sessionId);
      startConsoleCapture(sessionId, session.page);
      await session.page.goto(getFrontendUrl());
      await waitForAgentBridge(session.page);
      return {
        content: [{ type: 'text', text: JSON.stringify({ sessionId, url: getFrontendUrl(), status: 'created' }) }],
      };
    },
  );

  server.tool(
    'session_destroy',
    'Destroy a browser session and close the browser context.',
    { sessionId: z.string() },
    async ({ sessionId }) => {
      await destroySession(sessionId);
      return { content: [{ type: 'text', text: JSON.stringify({ sessionId, status: 'destroyed' }) }] };
    },
  );

  server.tool(
    'session_list',
    'List all active browser sessions.',
    {},
    async () => {
      const ids = listSessions();
      return { content: [{ type: 'text', text: JSON.stringify({ sessions: ids }) }] };
    },
  );

  server.tool(
    'session_destroy_all',
    'Destroy all browser sessions and close the browser.',
    {},
    async () => {
      await destroyAllSessions();
      return { content: [{ type: 'text', text: JSON.stringify({ status: 'all_destroyed' }) }] };
    },
  );

  // ── Low-level page interaction tools ──────────────────────────────────────
  // Use these to fill gaps where high-level landgrab tools have no coverage.
  // All tools operate on an EXISTING named session (host, guest1, etc.).

  server.tool(
    'session_click',
    'Click an element in a named session by CSS selector. Use force:true if the element is covered by an overlay.',
    {
      sessionId: z.string(),
      selector: z.string().describe('CSS selector, e.g. [data-testid="foo"] or .btn-primary'),
      force: z.boolean().optional().describe('Use dispatchEvent click instead of real click (bypasses overlay intercepts)'),
    },
    async ({ sessionId, selector, force }) => {
      const { page } = getSession(sessionId);
      const locator = page.locator(selector).first();
      await locator.waitFor({ state: 'visible', timeout: 10_000 });
      if (force) {
        await locator.dispatchEvent('click');
      } else {
        await locator.click();
      }
      await page.waitForTimeout(300);
      return { content: [{ type: 'text', text: JSON.stringify({ status: 'clicked', selector }) }] };
    },
  );

  server.tool(
    'session_click_testid',
    'Click an element in a named session by data-testid.',
    {
      sessionId: z.string(),
      testId: z.string(),
      force: z.boolean().optional(),
    },
    async ({ sessionId, testId, force }) => {
      const { page } = getSession(sessionId);
      const locator = page.getByTestId(testId).first();
      await locator.waitFor({ state: 'visible', timeout: 10_000 });
      if (force) {
        await locator.dispatchEvent('click');
      } else {
        await locator.click();
      }

      return { content: [{ type: 'text', text: JSON.stringify({ status: 'clicked', testId }) }] };
    },
  );

  server.tool(
    'session_fill',
    'Fill a text or number input in a named session by CSS selector.',
    {
      sessionId: z.string(),
      selector: z.string().describe('CSS selector targeting the input element'),
      value: z.string(),
    },
    async ({ sessionId, selector, value }) => {
      const { page } = getSession(sessionId);
      const locator = page.locator(selector).first();
      await locator.waitFor({ state: 'visible', timeout: 10_000 });
      await locator.fill(value);
      return { content: [{ type: 'text', text: JSON.stringify({ status: 'filled', selector, value }) }] };
    },
  );

  server.tool(
    'session_fill_testid',
    'Fill a text or number input in a named session by data-testid.',
    {
      sessionId: z.string(),
      testId: z.string(),
      value: z.string(),
    },
    async ({ sessionId, testId, value }) => {
      const { page } = getSession(sessionId);
      const locator = page.getByTestId(testId).first();
      await locator.waitFor({ state: 'visible', timeout: 10_000 });
      await locator.fill(value);
      return { content: [{ type: 'text', text: JSON.stringify({ status: 'filled', testId, value }) }] };
    },
  );

  server.tool(
    'session_wait_for',
    'Wait for a CSS selector to reach a given visibility state in a named session.',
    {
      sessionId: z.string(),
      selector: z.string(),
      state: z.enum(['visible', 'hidden', 'attached', 'detached']).optional().default('visible'),
      timeout: z.number().int().min(500).max(30_000).optional().default(10_000),
    },
    async ({ sessionId, selector, state, timeout }) => {
      const { page } = getSession(sessionId);
      await page.locator(selector).first().waitFor({ state, timeout });
      return { content: [{ type: 'text', text: JSON.stringify({ status: 'found', selector, state }) }] };
    },
  );

  server.tool(
    'session_wait_for_text',
    'Wait for specific text to appear anywhere on the page in a named session.',
    {
      sessionId: z.string(),
      text: z.string(),
      timeout: z.number().int().min(500).max(30_000).optional().default(10_000),
    },
    async ({ sessionId, text, timeout }) => {
      const { page } = getSession(sessionId);
      await page.getByText(text, { exact: false }).first().waitFor({ state: 'visible', timeout });
      return { content: [{ type: 'text', text: JSON.stringify({ status: 'found', text }) }] };
    },
  );

  server.tool(
    'session_press_key',
    'Press a keyboard key in a named session.',
    {
      sessionId: z.string(),
      key: z.string(),
    },
    async ({ sessionId, key }) => {
      const { page } = getSession(sessionId);
      await page.keyboard.press(key);
      return { content: [{ type: 'text', text: JSON.stringify({ status: 'pressed', key }) }] };
    },
  );

  server.tool(
    'session_get_text',
    'Get the visible text content of the first matching element in a named session.',
    {
      sessionId: z.string(),
      selector: z.string(),
    },
    async ({ sessionId, selector }) => {
      const { page } = getSession(sessionId);
      const locator = page.locator(selector).first();
      await locator.waitFor({ state: 'visible', timeout: 10_000 });
      const text = await locator.textContent();
      return { content: [{ type: 'text', text: JSON.stringify({ selector, text }) }] };
    },
  );

  server.tool(
    'session_get_html',
    'Get the outer HTML of the first matching element. Useful for inspecting what is rendered in a named session.',
    {
      sessionId: z.string(),
      selector: z.string(),
    },
    async ({ sessionId, selector }) => {
      const { page } = getSession(sessionId);
      const locator = page.locator(selector).first();
      await locator.waitFor({ state: 'visible', timeout: 10_000 });
      const html = await locator.evaluate(el => el.outerHTML);
      return { content: [{ type: 'text', text: JSON.stringify({ selector, html }) }] };
    },
  );
}
