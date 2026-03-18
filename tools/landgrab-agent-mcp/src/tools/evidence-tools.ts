import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getSession } from '../lib/browser-registry.js';
import {
  captureScreenshot,
  captureScreenshotBase64,
  getConsoleErrors,
  getConsoleEntries,
  getConsoleEntriesSince,
  generateEvidenceSummary,
  getNetworkEntries,
  getNetworkEntriesSince,
} from '../lib/evidence.js';
import { getAgentConnectionStatus, getAgentSnapshot } from '../lib/agent-bridge.js';
import { getBasicState } from '../lib/state-helpers.js';

const checkpointCursors = new Map<string, { consoleIndex: number; networkIndex: number }>();

function jsonResult(payload: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(payload) }] };
}

async function safeAriaSnapshot(sessionId: string, selector: string) {
  const session = getSession(sessionId);
  const locator = session.page.locator(selector).first();

  try {
    await locator.waitFor({ state: 'attached', timeout: 10_000 });
    const snapshot = await locator.ariaSnapshot();
    return { selector, snapshot, error: null };
  } catch (error) {
    return {
      selector,
      snapshot: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

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
      let snapshot: string | null = null;
      let error: string | null = null;

      try {
        await locator.waitFor({ state: 'attached', timeout });
        snapshot = await locator.ariaSnapshot();
      } catch (cause) {
        error = cause instanceof Error ? cause.message : String(cause);
      }

      return {
        content: [{ type: 'text', text: JSON.stringify({ sessionId, selector, snapshot, error }, null, 2) }],
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
    'evidence_console_delta',
    'Get only console entries captured after a specific cursor for a session.',
    {
      sessionId: z.string(),
      cursor: z.number().int().min(0).optional().default(0),
    },
    async ({ sessionId, cursor }) => {
      const result = getConsoleEntriesSince(sessionId, cursor);
      return jsonResult({ sessionId, cursor, nextCursor: result.nextIndex, entries: result.entries });
    },
  );

  server.tool(
    'network_requests',
    'Get captured network requests for a session, optionally returning only new entries after a cursor.',
    {
      sessionId: z.string(),
      cursor: z.number().int().min(0).optional(),
      onlyFailures: z.boolean().optional().default(false),
      urlIncludes: z.string().optional(),
      minDurationMs: z.number().int().min(0).optional(),
    },
    async ({ sessionId, cursor, onlyFailures, urlIncludes, minDurationMs }) => {
      const base = cursor == null ? { entries: getNetworkEntries(sessionId), nextIndex: getNetworkEntries(sessionId).length } : getNetworkEntriesSince(sessionId, cursor);
      const entries = base.entries.filter((entry) => {
        if (onlyFailures && entry.ok) {
          return false;
        }
        if (urlIncludes && !entry.url.includes(urlIncludes)) {
          return false;
        }
        if (minDurationMs != null && (entry.durationMs ?? 0) < minDurationMs) {
          return false;
        }
        return true;
      });

      return jsonResult({ sessionId, cursor: cursor ?? 0, nextCursor: base.nextIndex, entries, count: entries.length });
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
    'evidence_checkpoint',
    'Capture a screenshot, ARIA snapshot, console delta, network delta, and rich state snapshot for a session since the previous checkpoint.',
    {
      sessionId: z.string(),
      label: z.string(),
      selector: z.string().optional().default('body'),
    },
    async ({ sessionId, label, selector }) => {
      const session = getSession(sessionId);
      const previousCursor = checkpointCursors.get(sessionId) ?? { consoleIndex: 0, networkIndex: 0 };
      const screenshotPath = await captureScreenshot(session.page, `${sessionId}_${label}`);
      const ariaSnapshot = await safeAriaSnapshot(sessionId, selector);
      const consoleDelta = getConsoleEntriesSince(sessionId, previousCursor.consoleIndex);
      const networkDelta = getNetworkEntriesSince(sessionId, previousCursor.networkIndex);
      const stateSnapshot = await getAgentSnapshot(session.page).catch(() => null);
      checkpointCursors.set(sessionId, {
        consoleIndex: consoleDelta.nextIndex,
        networkIndex: networkDelta.nextIndex,
      });

      return jsonResult({
        sessionId,
        label,
        screenshotPath,
        ariaSnapshot,
        consoleDelta: consoleDelta.entries,
        networkDelta: networkDelta.entries,
        stateSnapshot,
        nextCursors: checkpointCursors.get(sessionId),
      });
    },
  );

  server.tool(
    'evidence_compare_sessions',
    'Capture side-by-side evidence across multiple sessions, including screenshots and connection/state summaries.',
    {
      sessionIds: z.array(z.string()).min(2),
      label: z.string(),
      selector: z.string().optional().default('body'),
    },
    async ({ sessionIds, label, selector }) => {
      const comparison: Array<Record<string, unknown>> = [];
      for (const sessionId of sessionIds) {
        const session = getSession(sessionId);
        const screenshotPath = await captureScreenshot(session.page, `${sessionId}_${label}`);
        const ariaSnapshot = await safeAriaSnapshot(sessionId, selector);
        const connectionStatus = await getAgentConnectionStatus(session.page).catch(() => null);
        const stateSnapshot = await getAgentSnapshot(session.page).catch(() => null);
        comparison.push({ sessionId, screenshotPath, ariaSnapshot, connectionStatus, stateSnapshot });
      }

      return jsonResult({ sessionIds, label, comparison });
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
