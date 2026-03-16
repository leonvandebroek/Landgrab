import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getSession } from '../lib/browser-registry.js';
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
}
