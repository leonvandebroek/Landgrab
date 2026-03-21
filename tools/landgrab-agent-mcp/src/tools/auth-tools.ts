import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getSession } from '../lib/browser-registry.js';
import { getAgentSnapshot } from '../lib/agent-bridge.js';
import { registerUserApi, loginUserApi, injectAuthIntoPage, registerViaUI } from '../lib/auth-helpers.js';

export function registerAuthTools(server: McpServer): void {
  server.tool(
    'auth_register',
    'Register a new user via the API and inject auth into the browser session.',
    {
      sessionId: z.string(),
      username: z.string(),
      email: z.string(),
      password: z.string().min(8),
    },
    async ({ sessionId, username, email, password }) => {
      const session = getSession(sessionId);
      const auth = await registerUserApi(username, email, password);
      session.username = auth.username;
      session.userId = auth.userId;
      session.token = auth.token;
      await injectAuthIntoPage(session.page, auth);
      await session.page.reload();
      return {
        content: [{ type: 'text', text: JSON.stringify({ username: auth.username, userId: auth.userId, status: 'registered' }) }],
      };
    },
  );

  server.tool(
    'auth_login',
    'Login an existing user via the API and inject auth into the browser session.',
    {
      sessionId: z.string(),
      usernameOrEmail: z.string(),
      password: z.string(),
    },
    async ({ sessionId, usernameOrEmail, password }) => {
      const session = getSession(sessionId);
      const auth = await loginUserApi(usernameOrEmail, password);
      session.username = auth.username;
      session.userId = auth.userId;
      session.token = auth.token;
      await injectAuthIntoPage(session.page, auth);
      await session.page.reload();
      return {
        content: [{ type: 'text', text: JSON.stringify({ username: auth.username, userId: auth.userId, status: 'logged_in' }) }],
      };
    },
  );

  server.tool(
    'auth_register_ui',
    'Register a new user through the browser UI (slower but validates the full flow).',
    {
      sessionId: z.string(),
      username: z.string(),
      email: z.string(),
      password: z.string().min(8),
    },
    async ({ sessionId, username, email, password }) => {
      const session = getSession(sessionId);
      await registerViaUI(session.page, username, email, password);
      await session.page.waitForTimeout(2000);
      session.username = username;
      return {
        content: [{ type: 'text', text: JSON.stringify({ username, status: 'registered_via_ui' }) }],
      };
    },
  );

  server.tool(
    'session_auth_status',
    'Diagnose the authentication state of a named session across MCP state, frontend bridge state, and an optional backend token probe.',
    {
      sessionId: z.string(),
      probeBackend: z.boolean().optional().default(false),
    },
    async ({ sessionId, probeBackend }) => {
      const session = getSession(sessionId);
      const hasToken = typeof session.token === 'string' && session.token.length > 0;
      const hasUserId = typeof session.userId === 'string' && session.userId.length > 0;

      const mcpLayer = {
        hasToken,
        hasUserId,
        username: session.username,
        userId: session.userId ?? null,
      };

      let bridgeAvailable = false;
      let bridgeError: string | null = null;
      let bridgeAuthFields: Record<string, unknown> = {};

      try {
        const snapshot = await getAgentSnapshot<Record<string, unknown>>(session.page);
        if (snapshot && typeof snapshot === 'object') {
          const authEntries = Object.entries(snapshot).filter(([key]) => /auth|user/i.test(key));
          bridgeAuthFields = Object.fromEntries(authEntries);
        }
        bridgeAvailable = true;
      } catch (e: unknown) {
        bridgeError = e instanceof Error ? e.message : String(e);
      }

      const backendLayer: {
        probed: boolean;
        valid: boolean | null;
        userData: Record<string, unknown> | null;
        error: string | null;
        skipped?: 'no_token';
      } = {
        probed: probeBackend,
        valid: null,
        userData: null,
        error: null,
      };

      if (probeBackend) {
        if (!hasToken || session.token === undefined) {
          backendLayer.skipped = 'no_token';
        } else {
          const apiBase = process.env.LANDGRAB_API_URL ?? 'http://localhost:5001';

          try {
            const response = await fetch(`${apiBase}/api/auth/me`, {
              method: 'GET',
              headers: {
                Authorization: `Bearer ${session.token}`,
              },
            });

            if (response.status === 200) {
              const responseBody = await response.json() as unknown;
              if (responseBody && typeof responseBody === 'object') {
                backendLayer.valid = true;
                backendLayer.userData = responseBody as Record<string, unknown>;
              } else {
                backendLayer.valid = true;
                backendLayer.userData = { value: responseBody };
              }
            } else if (response.status === 401 || response.status === 403) {
              backendLayer.valid = false;
            } else {
              const responseText = await response.text();
              backendLayer.valid = false;
              backendLayer.error = `Unexpected response (${response.status}): ${responseText}`;
            }
          } catch (e: unknown) {
            backendLayer.error = e instanceof Error ? e.message : String(e);
          }
        }
      }

      let diagnosis: 'ok' | 'mcp_auth_missing' | 'bridge_unavailable' | 'token_expired' | 'partial_auth';
      if (session.username.length > 0 && !hasToken) {
        diagnosis = 'partial_auth';
      } else if (!hasToken || !hasUserId) {
        diagnosis = 'mcp_auth_missing';
      } else if (!bridgeAvailable) {
        diagnosis = 'bridge_unavailable';
      } else if (probeBackend && backendLayer.valid === false && backendLayer.error === null) {
        diagnosis = 'token_expired';
      } else {
        diagnosis = 'ok';
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            sessionId,
            mcpLayer,
            bridgeLayer: {
              available: bridgeAvailable,
              error: bridgeError,
              authFields: bridgeAuthFields,
            },
            backendLayer,
            diagnosis,
          }),
        }],
      };
    },
  );
}
