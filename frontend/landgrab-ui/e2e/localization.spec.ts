import { test, expect, type Page, type Browser } from '@playwright/test';

// ── Helpers ──────────────────────────────────────────────────────

/** Inject fake auth into localStorage before the page loads. */
async function setFakeAuth(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem(
      'landgrab_auth',
      JSON.stringify({
        token: 'fake-jwt-token-for-testing',
        username: 'TestUser',
        userId: 'test-user-id-123',
      }),
    );
  });
}

/** Mock SignalR negotiation so the lobby doesn't choke on missing backend. */
async function mockSignalR(page: Page) {
  await page.route('**/hub/**', (route) =>
    route.fulfill({ status: 200, body: '' }),
  );
}

/** Mock GET /api/map-templates with a given payload. */
async function mockMapTemplates(page: Page, body: unknown[]) {
  await page.route('**/api/map-templates**', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });
    }
    return route.fulfill({ status: 200, body: '{}' });
  });
}

/** Assert that NO raw i18n keys are visible on the page. */
async function assertNoRawKeys(page: Page) {
  const body = await page.locator('body').innerText();
  // Raw keys look like "mapEditor.title", "auth.signIn", "lobby.welcome" etc.
  const rawKeyPattern = /\b(auth|lobby|mapEditor)\.\w+/;
  expect(body).not.toMatch(rawKeyPattern);
}

/** Create a browser context with the given locale. */
async function contextWithLocale(browser: Browser, locale: string) {
  return browser.newContext({ locale });
}

// The single test template we reuse across template-card tests.
const TEMPLATE_FIXTURE = {
  id: 'abc-123',
  name: 'Test Map',
  description: 'A test template',
  hexCount: 19,
  tileSizeMeters: 25,
  centerLat: null,
  centerLng: null,
  isPublic: false,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

// ═════════════════════════════════════════════════════════════════
//  1 & 2  ·  Auth page
// ═════════════════════════════════════════════════════════════════

test.describe('Auth page localization', () => {
  test('shows English text when browser locale is en-US', async ({ browser }) => {
    const context = await contextWithLocale(browser, 'en-US');
    const page = await context.newPage();

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Tab buttons (the mode switchers at the top of the auth form)
    await expect(page.getByText('Sign In', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Sign Up', { exact: true }).first()).toBeVisible();

    // Tagline
    await expect(page.getByText('Conquer your neighborhood!')).toBeVisible();

    // Form labels
    await expect(page.getByText('Username or Email')).toBeVisible();
    await expect(page.getByText('Password')).toBeVisible();

    await assertNoRawKeys(page);
    await context.close();
  });

  test('shows Dutch text when browser locale is nl-NL', async ({ browser }) => {
    const context = await contextWithLocale(browser, 'nl-NL');
    const page = await context.newPage();

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Tab buttons
    await expect(page.getByText('Inloggen', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Registreren', { exact: true }).first()).toBeVisible();

    // Tagline
    await expect(page.getByText('Verover je omgeving! (letterlijk)')).toBeVisible();

    // Form labels
    await expect(page.getByText('Gebruikersnaam of e-mail')).toBeVisible();
    await expect(page.getByText('Wachtwoord')).toBeVisible();

    await assertNoRawKeys(page);
    await context.close();
  });
});

// ═════════════════════════════════════════════════════════════════
//  3 & 4  ·  Lobby page
// ═════════════════════════════════════════════════════════════════

test.describe('Lobby page localization', () => {
  test('shows English text when browser locale is en-US', async ({ browser }) => {
    const context = await contextWithLocale(browser, 'en-US');
    const page = await context.newPage();

    await setFakeAuth(page);
    await mockSignalR(page);

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Welcome message
    await expect(page.getByText('Welcome, TestUser!')).toBeVisible();

    // Map Editor toggle
    const toggle = page.locator('.map-editor-toggle');
    await expect(toggle).toBeVisible();
    await expect(toggle).toContainText('Map Editor');

    await assertNoRawKeys(page);
    await context.close();
  });

  test('shows Dutch text when browser locale is nl-NL', async ({ browser }) => {
    const context = await contextWithLocale(browser, 'nl-NL');
    const page = await context.newPage();

    await setFakeAuth(page);
    await mockSignalR(page);

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Welcome message
    await expect(page.getByText('Welkom, TestUser!')).toBeVisible();

    // Map Editor toggle
    const toggle = page.locator('.map-editor-toggle');
    await expect(toggle).toBeVisible();
    await expect(toggle).toContainText('Kaarteditor');

    await assertNoRawKeys(page);
    await context.close();
  });
});

// ═════════════════════════════════════════════════════════════════
//  5 & 6  ·  Map Editor – Template Manager (empty state)
// ═════════════════════════════════════════════════════════════════

test.describe('Map Editor – Template Manager (empty) localization', () => {
  test('shows English empty-state text', async ({ browser }) => {
    const context = await contextWithLocale(browser, 'en-US');
    const page = await context.newPage();

    await setFakeAuth(page);
    await mockSignalR(page);
    await mockMapTemplates(page, []);

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.locator('.map-editor-toggle').click();

    // Title
    const header = page.locator('.map-editor-templates__header h2');
    await expect(header).toHaveText('Map Editor');

    // Empty state
    await expect(page.getByText('No templates yet')).toBeVisible();
    await expect(
      page.getByText('Design custom hex layouts and save them for your games.'),
    ).toBeVisible();

    // CTA button
    await expect(
      page.getByRole('button', { name: 'Create Your First Template' }),
    ).toBeVisible();

    // Back button
    await expect(page.getByRole('button', { name: '← Back' })).toBeVisible();

    await assertNoRawKeys(page);
    await context.close();
  });

  test('shows Dutch empty-state text', async ({ browser }) => {
    const context = await contextWithLocale(browser, 'nl-NL');
    const page = await context.newPage();

    await setFakeAuth(page);
    await mockSignalR(page);
    await mockMapTemplates(page, []);

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.locator('.map-editor-toggle').click();

    // Title
    const header = page.locator('.map-editor-templates__header h2');
    await expect(header).toHaveText('Kaarteditor');

    // Empty state
    await expect(page.getByText('Nog geen sjablonen')).toBeVisible();
    await expect(
      page.getByText('Ontwerp aangepaste hex-indelingen en sla ze op voor je spellen.'),
    ).toBeVisible();

    // CTA button
    await expect(
      page.getByRole('button', { name: 'Maak je eerste sjabloon' }),
    ).toBeVisible();

    // Back button
    await expect(page.getByRole('button', { name: '← Terug' })).toBeVisible();

    await assertNoRawKeys(page);
    await context.close();
  });
});

// ═════════════════════════════════════════════════════════════════
//  7 & 8  ·  Map Editor – Template cards (with data)
// ═════════════════════════════════════════════════════════════════

test.describe('Map Editor – Template cards localization', () => {
  test('shows English card text for a template', async ({ browser }) => {
    const context = await contextWithLocale(browser, 'en-US');
    const page = await context.newPage();

    await setFakeAuth(page);
    await mockSignalR(page);
    await mockMapTemplates(page, [TEMPLATE_FIXTURE]);

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.locator('.map-editor-toggle').click();

    // Card contents
    const card = page.locator('.map-editor-card').first();
    await expect(card).toBeVisible();
    await expect(card.locator('.map-editor-card__name')).toHaveText('Test Map');

    // Badges
    await expect(card.getByText('19 hexes')).toBeVisible();
    await expect(card.getByText('25m tiles')).toBeVisible();

    // Action buttons
    const actions = card.locator('.map-editor-card__actions');
    await expect(actions.getByRole('button', { name: /Edit/ })).toBeVisible();
    await expect(actions.getByRole('button', { name: /Duplicate/ })).toBeVisible();
    await expect(actions.getByRole('button', { name: /Delete/ })).toBeVisible();

    // Create New button in header
    await expect(
      page.getByRole('button', { name: /Create New Template/ }),
    ).toBeVisible();

    await assertNoRawKeys(page);
    await context.close();
  });

  test('shows Dutch card text for a template', async ({ browser }) => {
    const context = await contextWithLocale(browser, 'nl-NL');
    const page = await context.newPage();

    await setFakeAuth(page);
    await mockSignalR(page);
    await mockMapTemplates(page, [TEMPLATE_FIXTURE]);

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.locator('.map-editor-toggle').click();

    // Card contents
    const card = page.locator('.map-editor-card').first();
    await expect(card).toBeVisible();
    await expect(card.locator('.map-editor-card__name')).toHaveText('Test Map');

    // Badges
    await expect(card.getByText('19 hexen')).toBeVisible();
    await expect(card.getByText('25m tegels')).toBeVisible();

    // Action buttons
    const actions = card.locator('.map-editor-card__actions');
    await expect(actions.getByRole('button', { name: /Bewerken/ })).toBeVisible();
    await expect(actions.getByRole('button', { name: /Dupliceren/ })).toBeVisible();
    await expect(actions.getByRole('button', { name: /Verwijderen/ })).toBeVisible();

    // Create New button in header
    await expect(
      page.getByRole('button', { name: /Nieuw sjabloon maken/ }),
    ).toBeVisible();

    await assertNoRawKeys(page);
    await context.close();
  });
});

// ═════════════════════════════════════════════════════════════════
//  9 & 10  ·  Map Editor – Editor Toolbar (new template)
// ═════════════════════════════════════════════════════════════════

test.describe('Map Editor – Editor Toolbar localization', () => {
  test('shows English toolbar text for a new template', async ({ browser }) => {
    const context = await contextWithLocale(browser, 'en-US');
    const page = await context.newPage();

    await setFakeAuth(page);
    await mockSignalR(page);
    await mockMapTemplates(page, []);

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.locator('.map-editor-toggle').click();

    // Click the "Create Your First Template" button
    await page.getByRole('button', { name: 'Create Your First Template' }).click();

    // Title
    const title = page.locator('.map-editor-toolbar__title');
    await expect(title).toHaveText('New Template');

    // Labels and placeholder (label text includes trailing " *")
    await expect(page.locator('label[for="tpl-name"]')).toContainText('Template Name');
    const nameInput = page.locator('#tpl-name');
    await expect(nameInput).toHaveAttribute('placeholder', 'My Map Template');

    await expect(page.locator('label[for="tpl-desc"]')).toHaveText('Description (optional)');

    await expect(page.locator('label[for="tpl-tile-size"]')).toHaveText('Tile Size (meters)');

    // Stat labels
    const stats = page.locator('.map-editor-toolbar__stats');
    await expect(stats.getByText('Hexes')).toBeVisible();
    await expect(stats.getByText('Connected')).toBeVisible();

    // Create button — should be disabled (no name, no hexes)
    const createBtn = page.locator('.map-editor-toolbar__btn--primary');
    await expect(createBtn).toHaveText('Create Template');
    await expect(createBtn).toBeDisabled();

    // Back button
    const backBtn = page.locator('.map-editor-toolbar__btn--ghost');
    await expect(backBtn).toHaveText('← Back');

    await assertNoRawKeys(page);
    await context.close();
  });

  test('shows Dutch toolbar text for a new template', async ({ browser }) => {
    const context = await contextWithLocale(browser, 'nl-NL');
    const page = await context.newPage();

    await setFakeAuth(page);
    await mockSignalR(page);
    await mockMapTemplates(page, []);

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.locator('.map-editor-toggle').click();

    // Click the "Maak je eerste sjabloon" button
    await page.getByRole('button', { name: 'Maak je eerste sjabloon' }).click();

    // Title
    const title = page.locator('.map-editor-toolbar__title');
    await expect(title).toHaveText('Nieuw sjabloon');

    // Labels and placeholder (label text includes trailing " *")
    await expect(page.locator('label[for="tpl-name"]')).toContainText('Sjabloonnaam');
    const nameInput = page.locator('#tpl-name');
    await expect(nameInput).toHaveAttribute('placeholder', 'Mijn kaartsjabloon');

    await expect(page.locator('label[for="tpl-desc"]')).toHaveText('Beschrijving (optioneel)');

    await expect(page.locator('label[for="tpl-tile-size"]')).toHaveText('Tegelgrootte (meters)');

    // Stat labels
    const stats = page.locator('.map-editor-toolbar__stats');
    await expect(stats.getByText('Hexen')).toBeVisible();
    await expect(stats.getByText('Verbonden')).toBeVisible();

    // Create button — should be disabled
    const createBtn = page.locator('.map-editor-toolbar__btn--primary');
    await expect(createBtn).toHaveText('Sjabloon maken');
    await expect(createBtn).toBeDisabled();

    // Back button
    const backBtn = page.locator('.map-editor-toolbar__btn--ghost');
    await expect(backBtn).toHaveText('← Terug');

    await assertNoRawKeys(page);
    await context.close();
  });
});
