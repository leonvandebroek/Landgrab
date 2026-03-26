import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createSession, destroySession, listSessions, destroyAllSessions, getFrontendUrl, getSession } from '../lib/browser-registry.js';
import { startConsoleCapture } from '../lib/evidence.js';
import { getAgentSnapshot, waitForAgentBridge } from '../lib/agent-bridge.js';

export function registerSessionTools(server: McpServer): void {
  server.tool(
    'session_create',
    'Create a new browser session for a player. Returns the session ID.',
    {
      sessionId: z.string().describe('Unique identifier for this player session'),
      viewportWidth: z.number().optional().describe('Viewport width in pixels'),
      viewportHeight: z.number().optional().describe('Viewport height in pixels'),
    },
    async ({ sessionId, viewportWidth, viewportHeight }) => {
      const viewport = viewportWidth && viewportHeight ? { width: viewportWidth, height: viewportHeight } : undefined;
      const session = await createSession(sessionId, viewport);
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

  server.tool(
    'session_smart_click',
    'Click an element with automatic scroll-into-view. Falls back to a force-click with diagnostics if needed.',
    {
      sessionId: z.string(),
      selector: z.string().describe('CSS selector, e.g. [data-testid="foo"] or .btn-primary'),
      force: z.boolean().optional().describe('Skip smart scroll and always use dispatchEvent click'),
    },
    async ({ sessionId, selector, force }) => {
      const { page } = getSession(sessionId);
      const locator = page.locator(selector).first();
      await locator.waitFor({ state: 'visible', timeout: 10_000 });

      const viewportSize = page.viewportSize()
        ?? await page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }));
      const initialBoundingBox = await locator.boundingBox();

      if (force) {
        await locator.dispatchEvent('click');
        await page.waitForTimeout(300);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              status: 'clicked',
              selector,
              method: 'forced',
              boundingBox: await locator.boundingBox(),
              viewportSize,
            }),
          }],
        };
      }

      await locator.scrollIntoViewIfNeeded();
      const boundingBox = await locator.boundingBox();
      const wasOutsideViewport = initialBoundingBox !== null && (
        initialBoundingBox.x < 0
        || initialBoundingBox.y < 0
        || initialBoundingBox.x + initialBoundingBox.width > viewportSize.width
        || initialBoundingBox.y + initialBoundingBox.height > viewportSize.height
      );

      try {
        await locator.click();
        await page.waitForTimeout(300);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              status: 'clicked',
              selector,
              method: wasOutsideViewport ? 'scrolled' : 'normal',
              boundingBox,
              viewportSize,
            }),
          }],
        };
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        const isRecoverableClickFailure = /outside of the viewport|outside the viewport|intercept|another element would receive the click|not receiving pointer events/i.test(message);

        if (!isRecoverableClickFailure) {
          throw new Error(
            `Failed to click selector "${selector}": ${message}. Diagnostics: ${JSON.stringify({ boundingBox, viewportSize })}`,
          );
        }

        await locator.dispatchEvent('click');
        await page.waitForTimeout(300);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              status: 'clicked',
              selector,
              method: 'forced',
              boundingBox,
              viewportSize,
            }),
          }],
        };
      }
    },
  );

  server.tool(
    'session_smart_click_testid',
    'Click an element by data-testid with automatic scroll-into-view and force-click fallback diagnostics.',
    {
      sessionId: z.string(),
      testId: z.string(),
      force: z.boolean().optional().describe('Skip smart scroll and always use dispatchEvent click'),
    },
    async ({ sessionId, testId, force }) => {
      const { page } = getSession(sessionId);
      const locator = page.getByTestId(testId).first();
      await locator.waitFor({ state: 'visible', timeout: 10_000 });

      const viewportSize = page.viewportSize()
        ?? await page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }));
      const initialBoundingBox = await locator.boundingBox();

      if (force) {
        await locator.dispatchEvent('click');
        await page.waitForTimeout(300);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              status: 'clicked',
              testId,
              method: 'forced',
              boundingBox: await locator.boundingBox(),
              viewportSize,
            }),
          }],
        };
      }

      await locator.scrollIntoViewIfNeeded();
      const boundingBox = await locator.boundingBox();
      const wasOutsideViewport = initialBoundingBox !== null && (
        initialBoundingBox.x < 0
        || initialBoundingBox.y < 0
        || initialBoundingBox.x + initialBoundingBox.width > viewportSize.width
        || initialBoundingBox.y + initialBoundingBox.height > viewportSize.height
      );

      try {
        await locator.click();
        await page.waitForTimeout(300);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              status: 'clicked',
              testId,
              method: wasOutsideViewport ? 'scrolled' : 'normal',
              boundingBox,
              viewportSize,
            }),
          }],
        };
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        const isRecoverableClickFailure = /outside of the viewport|outside the viewport|intercept|another element would receive the click|not receiving pointer events/i.test(message);

        if (!isRecoverableClickFailure) {
          throw new Error(
            `Failed to click testId "${testId}": ${message}. Diagnostics: ${JSON.stringify({ boundingBox, viewportSize })}`,
          );
        }

        await locator.dispatchEvent('click');
        await page.waitForTimeout(300);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              status: 'clicked',
              testId,
              method: 'forced',
              boundingBox,
              viewportSize,
            }),
          }],
        };
      }
    },
  );

  server.tool(
    'session_select_option',
    'Select an option in a native <select> element by value or visible label.',
    {
      sessionId: z.string(),
      selector: z.string(),
      value: z.string().optional().describe('Option value attribute'),
      label: z.string().optional().describe('Visible option text used when value is not provided'),
    },
    async ({ sessionId, selector, value, label }) => {
      if (value === undefined && label === undefined) {
        throw new Error('session_select_option requires either "value" or "label".');
      }

      const { page } = getSession(sessionId);
      const locator = page.locator(selector).first();
      await locator.waitFor({ state: 'visible', timeout: 10_000 });
      await locator.selectOption(value !== undefined ? { value } : { label: label as string });
      const selectedValue = await locator.inputValue();
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            status: 'selected',
            selector,
            value,
            label,
            selectedValue,
          }),
        }],
      };
    },
  );

  server.tool(
    'session_select_option_testid',
    'Select an option in a native <select> element by data-testid using value or visible label.',
    {
      sessionId: z.string(),
      testId: z.string(),
      value: z.string().optional().describe('Option value attribute'),
      label: z.string().optional().describe('Visible option text used when value is not provided'),
    },
    async ({ sessionId, testId, value, label }) => {
      if (value === undefined && label === undefined) {
        throw new Error('session_select_option_testid requires either "value" or "label".');
      }

      const { page } = getSession(sessionId);
      const locator = page.getByTestId(testId).first();
      await locator.waitFor({ state: 'visible', timeout: 10_000 });
      await locator.selectOption(value !== undefined ? { value } : { label: label as string });
      const selectedValue = await locator.inputValue();
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            status: 'selected',
            testId,
            value,
            label,
            selectedValue,
          }),
        }],
      };
    },
  );

  server.tool(
    'session_get_input_value',
    'Get the current value of a form control (input, select, textarea) in a named session.',
    {
      sessionId: z.string(),
      selector: z.string(),
    },
    async ({ sessionId, selector }) => {
      const { page } = getSession(sessionId);
      const locator = page.locator(selector).first();
      await locator.waitFor({ state: 'attached', timeout: 5_000 });

      const inputType = await locator.evaluate((element) => {
        if (!(element instanceof HTMLInputElement)) {
          return undefined;
        }

        return element.type;
      });

      const value = await locator.inputValue();
      const checked = inputType === 'checkbox' ? await locator.isChecked() : null;
      return { content: [{ type: 'text', text: JSON.stringify({ selector, value, checked }) }] };
    },
  );

  server.tool(
    'session_get_input_value_testid',
    'Get the current value of a form control (input, select, textarea) in a named session by data-testid.',
    {
      sessionId: z.string(),
      testId: z.string(),
    },
    async ({ sessionId, testId }) => {
      const { page } = getSession(sessionId);
      const locator = page.getByTestId(testId).first();
      await locator.waitFor({ state: 'attached', timeout: 5_000 });

      const inputType = await locator.evaluate((element) => {
        if (!(element instanceof HTMLInputElement)) {
          return undefined;
        }

        return element.type;
      });

      const value = await locator.inputValue();
      const checked = inputType === 'checkbox' ? await locator.isChecked() : null;
      return { content: [{ type: 'text', text: JSON.stringify({ testId, value, checked }) }] };
    },
  );

  server.tool(
    'session_wait_until_ready',
    'Wait until the Landgrab agent bridge is available in the specified session.',
    {
      sessionId: z.string(),
      timeoutMs: z.number().int().min(500).max(60_000).optional().default(15_000),
    },
    async ({ sessionId, timeoutMs }) => {
      const { page } = getSession(sessionId);
      await waitForAgentBridge(page, timeoutMs);
      const snapshot = await getAgentSnapshot<Record<string, unknown>>(page);
      const snapshotKeys = Object.keys(snapshot);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ sessionId, status: 'ready', snapshotKeys }),
        }],
      };
    },
  );

  server.tool(
    'session_recover',
    'Recover a stuck or stale browser session by reloading and waiting for the Landgrab agent bridge to return.',
    {
      sessionId: z.string(),
      timeoutMs: z.number().int().min(500).max(60_000).optional().default(15_000),
    },
    async ({ sessionId, timeoutMs }) => {
      const { page } = getSession(sessionId);
      await page.reload();
      await waitForAgentBridge(page, timeoutMs);
      const snapshot = await getAgentSnapshot<Record<string, unknown>>(page);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ sessionId, status: 'recovered', snapshot }),
        }],
      };
    },
  );
}
