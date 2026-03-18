import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createSession, getFrontendUrl, getSession } from '../lib/browser-registry.js';
import { callAgentBridge, getAgentSnapshot, pollAgentBridge, waitForAgentBridge } from '../lib/agent-bridge.js';
import { injectAuthIntoPage, loginUserApi, registerUserApi, registerViaUI } from '../lib/auth-helpers.js';
import { startConsoleCapture } from '../lib/evidence.js';

function jsonResult(payload: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(payload) }] };
}

const playerSpecSchema = z.object({
  sessionId: z.string(),
  authMode: z.enum(['register', 'login', 'register-ui']).optional().default('register'),
  username: z.string().optional(),
  email: z.string().email().optional(),
  usernameOrEmail: z.string().optional(),
  password: z.string().min(8),
});

type PlayerSpec = z.infer<typeof playerSpecSchema>;

async function ensureSessionReady(sessionId: string) {
  try {
    const existing = getSession(sessionId);
    await existing.page.goto(getFrontendUrl());
    await waitForAgentBridge(existing.page);
    return existing;
  } catch {
    const session = await createSession(sessionId);
    startConsoleCapture(sessionId, session.page);
    await session.page.goto(getFrontendUrl());
    await waitForAgentBridge(session.page);
    return session;
  }
}

function getLoginIdentifier(spec: PlayerSpec): string {
  return spec.usernameOrEmail ?? spec.email ?? spec.username ?? '';
}

async function authenticatePlayer(spec: PlayerSpec) {
  const session = await ensureSessionReady(spec.sessionId);

  if (spec.authMode === 'register-ui') {
    if (!spec.username || !spec.email) {
      throw new Error('username and email are required for register-ui auth mode.');
    }

    await registerViaUI(session.page, spec.username, spec.email, spec.password);
    session.username = spec.username;
    await waitForAgentBridge(session.page);
    return session;
  }

  const auth = spec.authMode === 'login'
    ? await loginUserApi(getLoginIdentifier(spec), spec.password)
    : await registerUserApi(spec.username ?? spec.email ?? spec.sessionId, spec.email ?? `${spec.sessionId}@example.test`, spec.password);

  session.username = auth.username;
  session.userId = auth.userId;
  session.token = auth.token;
  await injectAuthIntoPage(session.page, auth);
  await session.page.reload();
  await waitForAgentBridge(session.page);
  return session;
}

async function createRoom(hostSessionId: string): Promise<string> {
  const { page } = getSession(hostSessionId);
  await page.locator('[data-testid="lobby-create-room-btn"]').click();
  const roomCodeEl = page.locator('[data-testid="wizard-room-code"]');
  await roomCodeEl.waitFor({ state: 'visible', timeout: 10_000 });
  return (await roomCodeEl.textContent())?.trim() ?? '';
}

async function joinRoom(sessionId: string, roomCode: string): Promise<void> {
  const { page } = getSession(sessionId);
  await page.locator('[data-testid="lobby-join-code-input"]').fill(roomCode);
  await page.locator('[data-testid="lobby-join-btn"]').click();
}

async function startGame(sessionId: string): Promise<void> {
  const { page } = getSession(sessionId);
  const startBtn = page.locator('[data-testid="wizard-start-game-btn"]');
  if (await startBtn.isVisible().catch(() => false)) {
    await startBtn.click();
  } else {
    await page.locator('button:has-text("Start")').first().click();
  }
}

async function waitForPhase(sessionId: string, phase: 'Lobby' | 'Playing' | 'GameOver', timeoutMs = 10_000) {
  const { page } = getSession(sessionId);
  return pollAgentBridge(
    page,
    () => getAgentSnapshot<any>(page),
    (snapshot) => snapshot?.gameState?.phase === phase,
    { timeoutMs, intervalMs: 250 },
  );
}

async function configureAlliancesAndAssignments(
  hostSessionId: string,
  allianceNames: string[] | undefined,
  autoDistribute: boolean,
  assignments: Array<{ sessionId: string; allianceName: string }> = [],
) {
  const derivedAllianceNames = allianceNames && allianceNames.length > 0
    ? allianceNames
    : [...new Set(assignments.map((assignment) => assignment.allianceName))];

  if (derivedAllianceNames.length > 0 || autoDistribute) {
    await callAgentBridge(getSession(hostSessionId).page, 'assignPlayers', {
      allianceNames: derivedAllianceNames.length > 0 ? derivedAllianceNames : undefined,
      autoDistribute,
    });
  }

  for (const assignment of assignments) {
    await callAgentBridge(getSession(assignment.sessionId).page, 'setAlliance', assignment.allianceName);
  }
}

async function bootstrapScenario(
  host: PlayerSpec,
  guests: PlayerSpec[],
  options: {
    preset?: 'default' | 'quick-2p' | 'combat-test' | 'fog-test';
    allianceNames?: string[];
    teamCount?: number;
    autoDistribute?: boolean;
    assignments?: Array<{ sessionId: string; allianceName: string }>;
    autoStart?: boolean;
    wizardStep?: number;
  },
) {
  await authenticatePlayer(host);
  for (const guest of guests) {
    await authenticatePlayer(guest);
  }

  const roomCode = await createRoom(host.sessionId);
  await pollAgentBridge(
    getSession(host.sessionId).page,
    () => getAgentSnapshot<any>(getSession(host.sessionId).page),
    (snapshot) => snapshot?.roomCode === roomCode,
    { timeoutMs: 10_000, intervalMs: 250 },
  );

  for (const guest of guests) {
    await joinRoom(guest.sessionId, roomCode);
  }

  await pollAgentBridge(
    getSession(host.sessionId).page,
    () => getAgentSnapshot<any>(getSession(host.sessionId).page),
    (snapshot) => (snapshot?.gameState?.players?.length ?? 0) >= guests.length + 1,
    { timeoutMs: 10_000, intervalMs: 250 },
  );

  await callAgentBridge(getSession(host.sessionId).page, 'configureDefaults', {
    preset: options.preset,
    allianceNames: options.allianceNames,
    teamCount: options.teamCount,
    wizardStep: options.wizardStep,
  });

  await configureAlliancesAndAssignments(
    host.sessionId,
    options.allianceNames,
    options.autoDistribute ?? !(options.assignments?.length),
    options.assignments,
  );

  if (options.autoStart !== false) {
    await startGame(host.sessionId);
    await waitForPhase(host.sessionId, 'Playing', 15_000);
    for (const guest of guests) {
      await waitForPhase(guest.sessionId, 'Playing', 15_000);
    }
  }

  return {
    roomCode,
    hostSessionId: host.sessionId,
    guestSessionIds: guests.map((guest) => guest.sessionId),
  };
}

export function registerRoomAutomationTools(server: McpServer): void {
  server.tool(
    'room_wait_until_joinable',
    'Wait until a room is ready for guests to join and the host room code is available.',
    {
      sessionId: z.string(),
      timeoutMs: z.number().int().min(250).max(60_000).optional().default(10_000),
    },
    async ({ sessionId, timeoutMs }) => {
      const { page } = getSession(sessionId);
      const snapshot = await pollAgentBridge(
        page,
        () => getAgentSnapshot<any>(page),
        (candidate) => candidate?.roomCode && candidate?.view === 'lobby' && candidate?.gameState?.phase === 'Lobby',
        { timeoutMs, intervalMs: 250 },
      );
      return jsonResult({ sessionId, roomCode: snapshot.roomCode, snapshot });
    },
  );

  server.tool(
    'room_set_rules',
    'Set lobby rules such as tile size, claim mode, win condition, host GPS bypass, or max footprint via the frontend bridge.',
    {
      sessionId: z.string(),
      tileSizeMeters: z.number().int().min(25).max(5_000).optional(),
      claimMode: z.enum(['PresenceOnly', 'ClaimWithTroops']).optional(),
      winConditionType: z.enum(['TerritoryPercent', 'Elimination', 'TimedGame']).optional(),
      winConditionValue: z.number().int().min(1).max(100).optional(),
      hostBypassGps: z.boolean().optional(),
      maxFootprintMeters: z.number().int().min(100).max(100_000).optional(),
    },
    async ({ sessionId, ...rules }) => {
      const { page } = getSession(sessionId);
      const snapshot = await callAgentBridge(page, 'setRules', rules);
      return jsonResult({ sessionId, rules, snapshot });
    },
  );

  server.tool(
    'room_set_dynamics',
    'Set lobby or live in-game dynamics via the frontend bridge.',
    {
      sessionId: z.string(),
      live: z.boolean().optional().default(false),
      beaconEnabled: z.boolean().optional(),
      tileDecayEnabled: z.boolean().optional(),
      terrainEnabled: z.boolean().optional(),
      combatMode: z.enum(['Classic', 'Balanced', 'Siege']).optional(),
      playerRolesEnabled: z.boolean().optional(),
      fogOfWarEnabled: z.boolean().optional(),
      hqEnabled: z.boolean().optional(),
      hqAutoAssign: z.boolean().optional(),
      timedEscalationEnabled: z.boolean().optional(),
      underdogPactEnabled: z.boolean().optional(),
    },
    async ({ sessionId, ...dynamics }) => {
      const { page } = getSession(sessionId);
      const snapshot = await callAgentBridge(page, 'setDynamics', dynamics);
      return jsonResult({ sessionId, dynamics, snapshot });
    },
  );

  server.tool(
    'room_assign_players',
    'Configure alliances and optionally assign specific player sessions to alliances.',
    {
      hostSessionId: z.string(),
      allianceNames: z.array(z.string()).min(1).optional(),
      autoDistribute: z.boolean().optional().default(false),
      assignments: z.array(z.object({
        sessionId: z.string(),
        allianceName: z.string(),
      })).optional().default([]),
    },
    async ({ hostSessionId, allianceNames, autoDistribute, assignments }) => {
      await configureAlliancesAndAssignments(hostSessionId, allianceNames, autoDistribute, assignments);
      const hostSnapshot = await getAgentSnapshot(getSession(hostSessionId).page);
      return jsonResult({ hostSessionId, allianceNames, autoDistribute, assignments, hostSnapshot });
    },
  );

  server.tool(
    'room_configure_defaults',
    'Apply a fast default host configuration for common playtest presets.',
    {
      sessionId: z.string(),
      preset: z.enum(['default', 'quick-2p', 'combat-test', 'fog-test']).optional().default('default'),
      allianceNames: z.array(z.string()).min(1).optional(),
      teamCount: z.number().int().min(2).max(4).optional(),
      wizardStep: z.number().int().min(0).max(10).optional(),
    },
    async ({ sessionId, ...options }) => {
      const { page } = getSession(sessionId);
      const snapshot = await callAgentBridge(page, 'configureDefaults', options);
      return jsonResult({ sessionId, options, snapshot });
    },
  );

  server.tool(
    'scenario_create_2p_game',
    'Create, authenticate, configure, and optionally start a 2-player game scenario.',
    {
      host: playerSpecSchema,
      guest: playerSpecSchema,
      preset: z.enum(['default', 'quick-2p', 'combat-test', 'fog-test']).optional().default('quick-2p'),
      autoStart: z.boolean().optional().default(true),
      wizardStep: z.number().int().min(0).max(10).optional(),
    },
    async ({ host, guest, preset, autoStart, wizardStep }) => {
      const scenario = await bootstrapScenario(host, [guest], {
        preset,
        autoStart,
        wizardStep,
        teamCount: 2,
        autoDistribute: true,
      });
      return jsonResult({ status: 'ready', ...scenario });
    },
  );

  server.tool(
    'scenario_create_n_player_game',
    'Create, authenticate, configure, and optionally start an N-player game scenario.',
    {
      host: playerSpecSchema,
      guests: z.array(playerSpecSchema).min(1),
      preset: z.enum(['default', 'quick-2p', 'combat-test', 'fog-test']).optional().default('default'),
      allianceNames: z.array(z.string()).min(1).optional(),
      teamCount: z.number().int().min(2).max(4).optional(),
      autoDistribute: z.boolean().optional(),
      assignments: z.array(z.object({
        sessionId: z.string(),
        allianceName: z.string(),
      })).optional(),
      autoStart: z.boolean().optional().default(true),
      wizardStep: z.number().int().min(0).max(10).optional(),
    },
    async ({ host, guests, preset, allianceNames, teamCount, autoDistribute, assignments, autoStart, wizardStep }) => {
      const scenario = await bootstrapScenario(host, guests, {
        preset,
        allianceNames,
        teamCount,
        autoDistribute,
        assignments,
        autoStart,
        wizardStep,
      });
      return jsonResult({ status: 'ready', ...scenario });
    },
  );
}
