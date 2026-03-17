import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const now = new Date();
const stamp = now.toISOString().replace(/[:.]/g, '-');
const evidenceDir = path.resolve('/Users/leonvandebroek/Projects/Github/Landgrab/frontend/landgrab-ui/test-results', `role-ui-review-${stamp}`);
fs.mkdirSync(evidenceDir, { recursive: true });

const suffix = Date.now().toString(36).slice(-6);
const hostUser = {
    username: `RoleTestHost_${suffix}`,
    email: `roletesthost_${suffix}@test.local`,
    password: 'TestPass123!',
};
const guestUser = {
    username: `RoleTestGuest_${suffix}`,
    email: `roletestguest_${suffix}@test.local`,
    password: 'TestPass123!',
};

const report = {
    startedAt: now.toISOString(),
    evidenceDir,
    hostUser: hostUser.username,
    guestUser: guestUser.username,
    roomCode: null,
    checks: {},
    console: { host: [], guest: [] },
    errors: [],
};

function attachConsole(page, bucket, name) {
    page.on('console', msg => {
        const type = msg.type();
        if (type === 'error' || type === 'warning') {
            bucket.push({
                page: name,
                type,
                text: msg.text(),
                location: msg.location(),
            });
        }
    });
    page.on('pageerror', err => {
        bucket.push({ page: name, type: 'pageerror', text: err.message, location: null });
    });
}

async function screenshot(page, name) {
    const file = path.join(evidenceDir, `${name}.png`);
    await page.screenshot({ path: file, fullPage: true });
    return file;
}

async function dismissRoleModalIfPresent(page) {
    const dialog = page.locator('[role="dialog"]');
    if (!await dialog.count()) {
        return;
    }

    const visible = await dialog.first().isVisible().catch(() => false);
    if (!visible) {
        return;
    }

    const dismissButton = page.locator('.role-modal-dismiss');
    if (await dismissButton.count()) {
        await dismissButton.first().click();
    } else {
        await page.keyboard.press('Escape').catch(() => { });
    }

    await dialog.first().waitFor({ state: 'hidden', timeout: 5000 }).catch(() => { });
}

async function register(page, user) {
    await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' });
    await page.getByTestId('auth-sign-up-tab').click();
    await page.getByTestId('auth-username-input').fill(user.username);
    await page.getByTestId('auth-email-input').fill(user.email);
    await page.getByTestId('auth-password-input').fill(user.password);
    await page.getByTestId('auth-submit-btn').click();
    await page.getByTestId('lobby-create-room-btn').waitFor({ state: 'visible', timeout: 20000 });
}

async function ensureTeamsStep(page) {
    const teamsStep = page.locator('.wizard-step-teams');
    if (await teamsStep.isVisible().catch(() => false)) {
        return;
    }

    const gpsButton = page.locator('.wizard-gps-button');
    if (await gpsButton.isVisible().catch(() => false)) {
        await gpsButton.click();
    }

    await teamsStep.waitFor({ state: 'visible', timeout: 15000 }).catch(async () => {
        const next = page.getByTestId('wizard-next-btn');
        if (await next.isEnabled().catch(() => false)) {
            await next.click();
        }
        await teamsStep.waitFor({ state: 'visible', timeout: 10000 });
    });
}

async function waitForGuestTeams(page) {
    const teamsStep = page.locator('.wizard-step-teams');
    await teamsStep.waitFor({ state: 'visible', timeout: 15000 }).catch(async () => {
        await page.waitForTimeout(2000);
        await teamsStep.waitFor({ state: 'visible', timeout: 10000 });
    });
}

async function waitForPlayerRow(page, playerName) {
    const row = page.locator('.player-row').filter({ hasText: playerName }).first();
    await row.waitFor({ state: 'visible', timeout: 15000 });
    return row;
}

async function selectRoleForPlayer(page, playerName, role) {
    const row = await waitForPlayerRow(page, playerName);
    await row.locator('select').selectOption(role);
}

async function setAlliance(page, allianceName) {
    const allianceButton = page.getByRole('button', { name: new RegExp(allianceName) }).first();
    await allianceButton.waitFor({ state: 'visible', timeout: 10000 });
    await allianceButton.click();
}

async function dismissRulesGateIfPresent(page) {
    const gate = page.getByTestId('game-rules-gate');
    const visible = await gate.isVisible().catch(() => false);
    if (!visible) {
        return false;
    }

    const playButton = page.locator('.rules-play-btn');
    if (await playButton.isVisible().catch(() => false)) {
        await playButton.click();
        return true;
    }

    const closeButton = page.locator('.hud-modal-close').first();
    if (await closeButton.isVisible().catch(() => false)) {
        await closeButton.click();
        return true;
    }

    return false;
}

const browser = await chromium.launch({ headless: true });

try {
    const contextOptions = {
        baseURL: 'http://localhost:5173',
        locale: 'en-US',
        permissions: ['geolocation'],
        geolocation: { latitude: 52.0907, longitude: 5.1214 },
        viewport: { width: 1440, height: 1600 },
    };

    const hostContext = await browser.newContext(contextOptions);
    const guestContext = await browser.newContext(contextOptions);
    const hostPage = await hostContext.newPage();
    const guestPage = await guestContext.newPage();
    attachConsole(hostPage, report.console.host, 'host');
    attachConsole(guestPage, report.console.guest, 'guest');

    await register(hostPage, hostUser);
    await screenshot(hostPage, '01-host-lobby');

    await hostPage.getByTestId('lobby-create-room-btn').click();
    await hostPage.getByTestId('setup-wizard').waitFor({ state: 'visible', timeout: 15000 });
    report.roomCode = (await hostPage.getByTestId('wizard-room-code').textContent())?.trim() ?? null;

    await ensureTeamsStep(hostPage);
    const hostTeamsShot = await screenshot(hostPage, '02-host-teams-initial');
    const hostRoleSelects = hostPage.locator('.wizard-players-section select');
    const hostRoleSelectCount = await hostRoleSelects.count();
    const randomizeButton = hostPage.getByRole('button', { name: /Randomize roles/i });
    const randomizeVisible = await randomizeButton.isVisible().catch(() => false);

    report.checks.hostTeams = {
        roleDropdownCount: hostRoleSelectCount,
        randomizeButtonVisible: randomizeVisible,
        screenshot: hostTeamsShot,
    };

    await register(guestPage, guestUser);
    await screenshot(guestPage, '03-guest-lobby');
    await guestPage.getByTestId('lobby-join-code-input').fill(report.roomCode ?? '');
    await guestPage.getByTestId('lobby-join-btn').click();
    await guestPage.getByTestId('setup-wizard').waitFor({ state: 'visible', timeout: 15000 });
    await waitForGuestTeams(guestPage);
    await waitForPlayerRow(hostPage, guestUser.username);
    const guestTeamsInitialShot = await screenshot(guestPage, '04-guest-teams-before-assignment');
    const hostTeamsSyncedShot = await screenshot(hostPage, '05-host-teams-synced');

    report.checks.guestTeamsInitial = {
        screenshot: guestTeamsInitialShot,
        roleText: await guestPage.locator('.player-row.is-me .section-note').textContent().catch(() => null),
        hostScreenshot: hostTeamsSyncedShot,
    };

    await selectRoleForPlayer(hostPage, guestUser.username, 'Scout');
    await hostPage.waitForTimeout(1000);
    const hostPreDynamicsAssignError = await hostPage.locator('.wizard-error').textContent().catch(() => null);
    const hostAfterGuestAssignShot = await screenshot(hostPage, '06-host-after-pre-dynamics-role-assignment');
    const guestRoleModalShot = await screenshot(guestPage, '07-guest-after-pre-dynamics-role-assignment');
    const guestRoleText = await guestPage.locator('.player-row.is-me .section-note').textContent().catch(() => null);

    report.checks.preDynamicsRoleAssignment = {
        hostError: hostPreDynamicsAssignError,
        guestRoleText,
        guestRoleModalVisible: await guestPage.locator('[role="dialog"]').isVisible().catch(() => false),
        hostScreenshot: hostAfterGuestAssignShot,
        guestScreenshot: guestRoleModalShot,
    };

    await dismissRoleModalIfPresent(guestPage);
    await selectRoleForPlayer(hostPage, hostUser.username, 'Commander');
    await hostPage.waitForTimeout(1000);
    await dismissRoleModalIfPresent(hostPage);

    const allianceInput = hostPage.getByPlaceholder('Alliance name');
    await allianceInput.fill('Alpha');
    await hostPage.getByRole('button', { name: /^Add$/ }).click();
    await setAlliance(hostPage, 'Alpha');
    await setAlliance(guestPage, 'Alpha');
    await hostPage.waitForTimeout(1500);

    const nextButton = hostPage.getByTestId('wizard-next-btn');
    await nextButton.waitFor({ state: 'visible', timeout: 10000 });
    if (!(await nextButton.isEnabled())) {
        throw new Error('Host cannot advance past Teams step after alliances were assigned.');
    }

    await nextButton.click();
    await hostPage.locator('.wizard-step-rules').waitFor({ state: 'visible', timeout: 10000 });
    await hostPage.getByTestId('wizard-next-btn').click();
    await hostPage.locator('.wizard-step-dynamics').waitFor({ state: 'visible', timeout: 10000 });

    const playerRolesToggleRow = hostPage.locator('.toggle-row').filter({ hasText: 'Player Roles' }).first();
    await playerRolesToggleRow.waitFor({ state: 'visible', timeout: 10000 });
    const playerRolesToggle = playerRolesToggleRow.locator('input[type="checkbox"]');
    const playerRolesEnabledBefore = await playerRolesToggle.isChecked();
    if (!playerRolesEnabledBefore) {
        await playerRolesToggleRow.click();
        await hostPage.waitForTimeout(1000);
        if (!await playerRolesToggle.isChecked()) {
            await playerRolesToggleRow.locator('.toggle-row-copy').click().catch(() => { });
            await hostPage.waitForTimeout(1000);
        }
    }
    const dynamicsShot = await screenshot(hostPage, '07-dynamics-player-roles-toggle');

    report.checks.dynamics = {
        playerRolesToggleVisible: true,
        playerRolesEnabledBefore,
        playerRolesEnabledAfter: await playerRolesToggle.isChecked(),
        screenshot: dynamicsShot,
    };

    if (!await playerRolesToggle.isChecked()) {
        throw new Error('Could not enable the Player Roles toggle in Dynamics.');
    }

    await hostPage.getByRole('button', { name: 'Step 2' }).click();
    await hostPage.locator('.wizard-step-teams').waitFor({ state: 'visible', timeout: 10000 });
    await guestPage.locator('.wizard-step-teams').waitFor({ state: 'visible', timeout: 10000 });
    await waitForPlayerRow(hostPage, guestUser.username);
    await selectRoleForPlayer(hostPage, guestUser.username, 'Scout');
    await guestPage.locator('[role="dialog"]').waitFor({ state: 'visible', timeout: 10000 });
    const guestRoleModalAfterToggleShot = await screenshot(guestPage, '08-guest-role-modal-after-toggle');
    const hostAfterToggleAssignShot = await screenshot(hostPage, '09-host-after-role-assignment-enabled');
    const guestRoleTextAfterToggle = await guestPage.locator('.player-row.is-me .section-note').textContent().catch(() => null);

    report.checks.postToggleGuestRoleAssignment = {
        guestRoleText: guestRoleTextAfterToggle,
        guestRoleModalVisible: await guestPage.locator('[role="dialog"]').isVisible().catch(() => false),
        hostScreenshot: hostAfterToggleAssignShot,
        guestScreenshot: guestRoleModalAfterToggleShot,
    };

    await dismissRoleModalIfPresent(guestPage);
    await selectRoleForPlayer(hostPage, hostUser.username, 'Commander');
    await hostPage.waitForTimeout(1000);
    await dismissRoleModalIfPresent(hostPage);

    await hostPage.getByTestId('wizard-next-btn').click();
    await hostPage.locator('.wizard-step-rules').waitFor({ state: 'visible', timeout: 10000 });
    await hostPage.getByTestId('wizard-next-btn').click();
    await hostPage.locator('.wizard-step-dynamics').waitFor({ state: 'visible', timeout: 10000 });

    await hostPage.getByTestId('wizard-next-btn').click();
    await hostPage.getByTestId('wizard-start-game-btn').waitFor({ state: 'visible', timeout: 15000 });
    const startEnabled = await hostPage.getByTestId('wizard-start-game-btn').isEnabled();
    report.checks.review = { startButtonEnabled: startEnabled };
    await hostPage.getByTestId('wizard-start-game-btn').click();

    await hostPage.getByTestId('game-rules-gate').waitFor({ state: 'visible', timeout: 20000 }).catch(() => { });
    await guestPage.getByTestId('game-rules-gate').waitFor({ state: 'visible', timeout: 20000 }).catch(() => { });
    const hostRulesGateVisible = await dismissRulesGateIfPresent(hostPage);
    const guestRulesGateVisible = await dismissRulesGateIfPresent(guestPage);
    report.checks.rulesGate = {
        hostRulesGateVisible,
        guestRulesGateVisible,
    };

    await hostPage.locator('.top-status-bar').waitFor({ state: 'visible', timeout: 20000 });
    await guestPage.locator('.top-status-bar').waitFor({ state: 'visible', timeout: 20000 });
    await hostPage.waitForTimeout(2000);
    await guestPage.waitForTimeout(2000);

    const hostHudShot = await screenshot(hostPage, '08-host-in-game-role-hud');
    const guestHudShot = await screenshot(guestPage, '09-guest-in-game-role-hud');
    const hostTopStatusText = await hostPage.locator('.top-status-bar').textContent().catch(() => null);
    const guestTopStatusText = await guestPage.locator('.top-status-bar').textContent().catch(() => null);
    const hostAbilityButtons = await hostPage.locator('.player-hud__ability').count();
    const guestAbilityButtons = await guestPage.locator('.player-hud__ability').count();

    report.checks.inGame = {
        hostTopStatusText,
        guestTopStatusText,
        hostAbilityButtons,
        guestAbilityButtons,
        hostScreenshot: hostHudShot,
        guestScreenshot: guestHudShot,
    };

    await hostContext.close();
    await guestContext.close();
} catch (error) {
    report.errors.push({
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : null,
    });
} finally {
    report.finishedAt = new Date().toISOString();
    fs.writeFileSync(path.join(evidenceDir, 'report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    await browser.close();
}
