import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getSession } from '../lib/browser-registry.js';
import { captureScreenshot, captureScreenshotBase64, getConsoleErrors, getConsoleEntries, generateEvidenceSummary } from '../lib/evidence.js';
import { getBasicState } from '../lib/state-helpers.js';

export function registerEvidenceTools(server: McpServer): void {
  server.tool(
    'evidence_screenshot',
    'Capture a screenshot of the current page state. Returns the file path.',
    {
      sessionId: z.string(),
      label: z.string().describe('Descriptive label for the screenshot'),
    },
    async ({ sessionId, label }) => {
      const session = getSession(sessionId);
      const filepath = await captureScreenshot(session.page, `${sessionId}_${label}`);
      return {
        content: [{ type: 'text', text: JSON.stringify({ filepath, status: 'captured' }) }],
      };
    },
  );

  server.tool(
    'evidence_screenshot_base64',
    'Capture a screenshot and return as base64-encoded PNG.',
    { sessionId: z.string() },
    async ({ sessionId }) => {
      const session = getSession(sessionId);
      const base64 = await captureScreenshotBase64(session.page);
      return {
        content: [{ type: 'image', data: base64, mimeType: 'image/png' }],
      };
    },
  );

  server.tool(
    'evidence_aria_snapshot',
    'Capture a Playwright ARIA snapshot for the current page or a specific selector. Returns the YAML accessibility tree for the matching element scope.',
    {
      sessionId: z.string(),
      selector: z.string().optional().describe('Optional CSS selector to scope the snapshot. Defaults to body.'),
      timeout: z.number().int().min(500).max(30_000).optional().default(10_000),
    },
    async ({ sessionId, selector = 'body', timeout }) => {
      const session = getSession(sessionId);
      const locator = session.page.locator(selector).first();
      await locator.waitFor({ state: 'attached', timeout });
      const snapshot = await locator.ariaSnapshot();
      return {
        content: [{ type: 'text', text: JSON.stringify({ sessionId, selector, snapshot }, null, 2) }],
      };
    },
  );

  server.tool(
    'evidence_console_errors',
    'Get all console errors captured for a session.',
    { sessionId: z.string() },
    async ({ sessionId }) => {
      const errors = getConsoleErrors(sessionId);
      return {
        content: [{ type: 'text', text: JSON.stringify({ errors, count: errors.length }) }] ,
      };
    },
  );

  server.tool(
    'evidence_console_all',
    'Get all console output captured for a session.',
    { sessionId: z.string() },
    async ({ sessionId }) => {
      const entries = getConsoleEntries(sessionId);
      return {
        content: [{ type: 'text', text: JSON.stringify({ entries, count: entries.length }) }],
      };
    },
  );

  server.tool(
    'evidence_summary',
    'Generate a markdown summary of all evidence for a session.',
    { sessionId: z.string() },
    async ({ sessionId }) => {
      const summary = generateEvidenceSummary(sessionId);
      return { content: [{ type: 'text', text: summary }] };
    },
  );

  server.tool(
    'state_snapshot',
    'Get a snapshot of the visible game state from the browser.',
    { sessionId: z.string() },
    async ({ sessionId }) => {
      const session = getSession(sessionId);
      const state = await getBasicState(session.page);
      return {
        content: [{ type: 'text', text: JSON.stringify(state) }],
      };
    },
  );
}
