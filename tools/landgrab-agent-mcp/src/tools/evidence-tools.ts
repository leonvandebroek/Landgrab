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
