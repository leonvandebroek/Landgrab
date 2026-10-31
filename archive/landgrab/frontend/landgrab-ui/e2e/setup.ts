import { test } from '@playwright/test';
import fs from 'node:fs/promises';
import { generateTestUser, registerViaUI } from './helpers/auth.js';
import { AUTH_DIR, PLAYER_AUTH_FILES, USERS_META_FILE } from './helpers/auth-paths.js';

const PREFIXES = ['host', 'guest1', 'guest2'];

// Run serially — each registration hits the auth rate-limited endpoint
test.describe.serial('Player auth setup', () => {
  for (let i = 0; i < PLAYER_AUTH_FILES.length; i++) {
    test(`register player ${i} (${PREFIXES[i]})`, async ({ page }) => {
      await fs.mkdir(AUTH_DIR, { recursive: true });

      const user = generateTestUser(PREFIXES[i]);
      await page.goto('/');
      await registerViaUI(page, user);
      await page.getByTestId('lobby-create-room-btn').waitFor({ state: 'visible', timeout: 15000 });

      // Save the browser's cookie jar so tests can restore it without any auth API calls
      await page.context().storageState({ path: PLAYER_AUTH_FILES[i] });

      // Persist user metadata alongside the state file
      let users: unknown[] = new Array(PLAYER_AUTH_FILES.length).fill(null);
      try { users = JSON.parse(await fs.readFile(USERS_META_FILE, 'utf-8')); } catch { /* first run */ }
      users[i] = { username: user.username, email: user.email, password: user.password };
      await fs.writeFile(USERS_META_FILE, JSON.stringify(users, null, 2));
    });
  }
});
