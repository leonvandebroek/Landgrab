import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createSession, getFrontendUrl, getSession } from '../lib/browser-registry.js';
import { callAgentBridge, getAgentSnapshot, pollAgentBridge, waitForAgentBridge } from '../lib/agent-bridge.js';
import { injectAuthIntoPage, loginUserApi, registerUserApi, registerViaUI } from '../lib/auth-helpers.js';
import { startConsoleCapture } from '../lib/evidence.js';

const API_BASE = process.env.LANDGRAB_API_URL ?? 'http://localhost:5001';

function jsonResult(payload: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(payload) }] };
}

const playerSpecSchema = z.object({
  sessionId: z.string(),
  authMode: z.enum(['register', 'login', 'register-ui', 'skip']).optional().default('register'),
  username: z.string().optional(),
  email: z.string().email().optional(),
  usernameOrEmail: z.string().optional(),
  password: z.string().min(8).optional(),
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

  // Skip re-auth when the session is already authenticated and no explicit credential is supplied.
  if (spec.authMode === 'skip' || (!spec.password && session.token && session.userId)) {
    return session;
  }

  if (!spec.password) {
    throw new Error(`Session "${spec.sessionId}": password is required when not already authenticated.`);
  }

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
  // Derive the full set of alliance names, merging: explicit arg > inferred from assignments > existing alliances in game state.
  let derivedAllianceNames: string[];
  if (allianceNames && allianceNames.length > 0) {
    derivedAllianceNames = allianceNames;
  } else if (assignments.length > 0) {
    // Preserve any alliances that already exist so we don't wipe ones with members.
    const existingSnapshot = await getAgentSnapshot<any>(getSession(hostSessionId).page);
    const existingNames: string[] = existingSnapshot?.gameState?.alliances?.map((a: any) => a.name as string) ?? [];
    const assignmentNames = [...new Set(assignments.map((a) => a.allianceName))];
    // Union: keep existing names plus any new ones introduced by assignments.
    derivedAllianceNames = [...new Set([...existingNames, ...assignmentNames])];
  } else {
    derivedAllianceNames = [];
  }

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
      combatMode: z.enum(['Classic', 'Balanced', 'Siege']).optional(),
      playerRolesEnabled: z.boolean().optional(),
      hqEnabled: z.boolean().optional(),
      hqAutoAssign: z.boolean().optional(),
    },
    async ({ sessionId, ...dynamics }) => {
      const { page } = getSession(sessionId);
      const snapshot = await callAgentBridge(page, 'setDynamics', dynamics);
      return jsonResult({ sessionId, dynamics, snapshot });
    },
  );

  server.tool(
    'room_assign_players',
    'Configure alliances and assign specific player sessions to alliances. When assignments are provided without explicit allianceNames, existing alliances are preserved and new names from assignments are merged in — so you can safely call this for partial updates. Pass all players in one call when possible to avoid intermediate unassigned states.',
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
    'Apply a fast default host configuration for common playtest presets. If guestSessionIds is provided, waits for all guests to appear in the room before applying the configuration so that auto-distribute includes all players.',
    {
      sessionId: z.string(),
      preset: z.enum(['default', 'quick-2p', 'combat-test', 'fog-test']).optional().default('default'),
      allianceNames: z.array(z.string()).min(1).optional(),
      teamCount: z.number().int().min(2).max(4).optional(),
      wizardStep: z.number().int().min(0).max(10).optional(),
      guestSessionIds: z.array(z.string()).optional().describe(
        'Session IDs of expected guests. The tool waits until all guests have joined before configuring, ensuring auto-distribute covers all players.',
      ),
      guestWaitTimeoutMs: z.number().int().min(1_000).max(60_000).optional().default(20_000),
    },
    async ({ sessionId, guestSessionIds, guestWaitTimeoutMs, ...options }) => {
      const { page } = getSession(sessionId);

      if (guestSessionIds && guestSessionIds.length > 0) {
        const expectedPlayerCount = guestSessionIds.length + 1; // guests + host
        await pollAgentBridge(
          page,
          () => getAgentSnapshot<any>(page),
          (snapshot) => (snapshot?.gameState?.players?.length ?? 0) >= expectedPlayerCount,
          { timeoutMs: guestWaitTimeoutMs, intervalMs: 300 },
        );
      }

      const snapshot = await callAgentBridge(page, 'configureDefaults', options);
      return jsonResult({ sessionId, options, snapshot });
    },
  );

  server.tool(
    'room_can_start',
    'Check whether the host can start the game and explain exactly which prerequisites are not yet satisfied. Use this before clicking Start Game to diagnose a disabled button.',
    { sessionId: z.string() },
    async ({ sessionId }) => {
      const snapshot = await getAgentSnapshot<any>(getSession(sessionId).page);
      const state = snapshot?.gameState;
      if (!state) {
        return jsonResult({ canStart: false, missing: ['game state not available — session may not be in a room'] });
      }

      const missing: string[] = [];

      if (!state.hasMapLocation) {
        missing.push('map location not set — call room_configure_defaults or room_set_rules');
      }

      if ((state.players?.length ?? 0) < 2) {
        missing.push(`only ${state.players?.length ?? 0} player(s) — need at least 2`);
      }

      const unassigned: string[] = (state.players ?? []).filter((p: any) => !p.allianceId).map((p: any) => p.name as string);
      if (unassigned.length > 0) {
        missing.push(`players without an alliance: ${unassigned.join(', ')} — call room_assign_players`);
      }

      return jsonResult({
        canStart: missing.length === 0,
        missing,
        playerCount: state.players?.length ?? 0,
        allianceCount: state.alliances?.length ?? 0,
        hasMapLocation: state.hasMapLocation ?? false,
      });
    },
  );

  server.tool(
    'scenario_inject_state',
    `Directly inject a pre-configured Playing game into the backend, bypassing the lobby wizard entirely.
All player sessions must already be authenticated (via auth_register or auth_login) before calling this tool.
After injection, all sessions are navigated to the frontend and polled until they reach the Playing phase via useAutoResume.

Use this instead of scenario_create_*_game when you want to evaluate a specific mid-game state (pre-captured hexes, exact troop counts, custom dynamics) without having to play through the setup wizard to reach it.`,
    {
      hostSessionId: z.string().describe(
        'Session ID of the authenticated host. This player MUST be included in the players list.',
      ),
      mapLat: z.number().default(52.0).describe('Map center latitude for the hex grid.'),
      mapLng: z.number().default(4.9).describe('Map center longitude for the hex grid.'),
      tileSizeMeters: z.number().int().min(25).max(5000).default(50),
      gridRadius: z.number().int().min(3).max(12).default(6),
      hostBypassGps: z.boolean().default(true),
      dynamics: z.object({
        beaconEnabled: z.boolean().optional(),
        tileDecayEnabled: z.boolean().optional(),
        combatMode: z.enum(['Classic', 'Balanced', 'Siege']).optional(),
        playerRolesEnabled: z.boolean().optional(),
        hqEnabled: z.boolean().optional(),
        hqAutoAssign: z.boolean().optional(),
      }).optional(),
      players: z.array(z.object({
        sessionId: z.string().describe('Authenticated MCP session ID for this player.'),
        allianceName: z.string().describe('Alliance/team name — players sharing a name are on the same team.'),
        carriedTroops: z.number().int().min(0).default(3),
        lat: z.number().optional().describe('Starting latitude; defaults to mapLat.'),
        lng: z.number().optional().describe('Starting longitude; defaults to mapLng.'),
        role: z.enum(['None', 'Commander', 'Scout', 'Engineer']).default('None'),
      })).min(2).describe('All player sessions to include. hostSessionId must appear here.'),
      hexOverrides: z.array(z.object({
        q: z.number().int(),
        r: z.number().int(),
        ownerSessionId: z.string().optional().describe('Session ID of the owning player, or omit for neutral.'),
        troops: z.number().int().min(0).default(0),
        isFort: z.boolean().default(false),
        isMasterTile: z.boolean().default(false),
      })).optional().describe(
        'Pre-captured hexes and troop placements. Omit to start with an empty board.',
      ),
    },
    async ({ hostSessionId, mapLat, mapLng, tileSizeMeters, gridRadius, hostBypassGps, dynamics, players, hexOverrides }) => {
      interface StageRecord {
        name: 'backend_injection' | 'frontend_navigation' | 'bridge_ready' | 'resume_poll';
        startedAt: string;
        completedAt: string | null;
        succeeded: boolean;
        error: string | null;
        detail?: unknown;
      }

      interface SessionResult {
        status: 'ready' | 'recovered' | 'failed';
        lastSnapshot: unknown;
      }

      interface SessionStageOutcome {
        sessionId: string;
        succeeded: boolean;
        error: string | null;
        detail?: unknown;
      }

      interface BridgeSnapshot extends Record<string, unknown> {
        roomCode?: unknown;
        view?: unknown;
        gameState?: unknown;
        ui?: unknown;
      }

      const allSessionIds = [...new Set([hostSessionId, ...players.map((player) => player.sessionId)])];
      const stages: StageRecord[] = [];
      const sessionResults: Record<string, SessionResult> = Object.fromEntries(
        allSessionIds.map((sessionId) => [sessionId, { status: 'failed' as const, lastSnapshot: null }]),
      );

      const isRecord = (value: unknown): value is Record<string, unknown> =>
        typeof value === 'object' && value !== null;

      const readString = (value: unknown): string | null =>
        typeof value === 'string' && value.length > 0 ? value : null;

      const errorMessage = (error: unknown): string =>
        error instanceof Error ? error.message : String(error);

      const startStage = (name: StageRecord['name']): StageRecord => {
        const stage: StageRecord = {
          name,
          startedAt: new Date().toISOString(),
          completedAt: null,
          succeeded: false,
          error: null,
        };
        stages.push(stage);
        return stage;
      };

      const finishStage = (
        stage: StageRecord,
        outcome: { succeeded: boolean; error?: string | null; detail?: unknown },
      ) => {
        stage.completedAt = new Date().toISOString();
        stage.succeeded = outcome.succeeded;
        stage.error = outcome.error ?? null;
        if (outcome.detail !== undefined) {
          stage.detail = outcome.detail;
        }
      };

      const getSnapshotPhase = (snapshot: unknown): string | null => {
        if (!isRecord(snapshot) || !isRecord(snapshot.gameState)) {
          return null;
        }

        return readString(snapshot.gameState.phase);
      };

      const getSnapshotRoomCode = (snapshot: unknown): string | null => {
        if (!isRecord(snapshot)) {
          return null;
        }

        const gameStateRoomCode = isRecord(snapshot.gameState) ? readString(snapshot.gameState.roomCode) : null;
        return gameStateRoomCode ?? readString(snapshot.roomCode);
      };

      const getSnapshotView = (snapshot: unknown): string | null => {
        if (!isRecord(snapshot)) {
          return null;
        }

        return readString(snapshot.view) ?? (isRecord(snapshot.ui) ? readString(snapshot.ui.view) : null);
      };

      const getSnapshotForSession = async (sessionId: string): Promise<unknown> => {
        try {
          return await getAgentSnapshot<BridgeSnapshot>(getSession(sessionId).page);
        } catch {
          return null;
        }
      };

      const pollForInjectedRoom = async (
        sessionId: string,
        expectedRoomCode: string,
        timeoutMs: number,
      ): Promise<{ succeeded: boolean; lastSnapshot: unknown; error: string | null }> => {
        const { page } = getSession(sessionId);
        const deadline = Date.now() + timeoutMs;
        let lastSnapshot: unknown = null;
        let lastError: string | null = null;

        while (Date.now() <= deadline) {
          try {
            lastSnapshot = await getAgentSnapshot<BridgeSnapshot>(page);
            lastError = null;

            if (
              getSnapshotPhase(lastSnapshot) === 'Playing' &&
              getSnapshotRoomCode(lastSnapshot) === expectedRoomCode
            ) {
              return { succeeded: true, lastSnapshot, error: null };
            }
          } catch (error: unknown) {
            lastError = errorMessage(error);
          }

          await page.waitForTimeout(300);
        }

        return {
          succeeded: false,
          lastSnapshot,
          error: lastError ?? `Timed out after ${timeoutMs}ms waiting for Playing phase in room ${expectedRoomCode}.`,
        };
      };

      const hostSession = getSession(hostSessionId);
      if (!hostSession.token || !hostSession.userId) {
        throw new Error(`Host session "${hostSessionId}" is not authenticated. Call auth_register or auth_login first.`);
      }

      // Resolve session IDs to real user IDs and usernames
      const playerSpecs = players.map((p) => {
        const session = getSession(p.sessionId);
        if (!session.userId || !session.username) {
          throw new Error(`Session "${p.sessionId}" is not authenticated.`);
        }
        return {
          userId: session.userId,
          username: session.username,
          allianceName: p.allianceName,
          carriedTroops: p.carriedTroops,
          lat: p.lat ?? mapLat,
          lng: p.lng ?? mapLng,
          role: p.role,
        };
      });

      const hexOverrideSpecs = hexOverrides?.map((h) => ({
        q: h.q,
        r: h.r,
        ownerPlayerId: h.ownerSessionId ? getSession(h.ownerSessionId).userId : undefined,
        troops: h.troops,
        isFort: h.isFort,
        isMasterTile: h.isMasterTile,
      }));

      let roomCode: string | null = null;

      const backendStage = startStage('backend_injection');
      try {
        const res = await fetch(`${API_BASE}/api/playtest/inject-scenario`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${hostSession.token}`,
          },
          body: JSON.stringify({
            mapLat,
            mapLng,
            tileSizeMeters,
            gridRadius,
            hostBypassGps,
            dynamics: dynamics ?? {},
            players: playerSpecs,
            hexOverrides: hexOverrideSpecs,
          }),
        });

        if (!res.ok) {
          const err = await res.text();
          throw new Error(`inject-scenario failed (${res.status}): ${err}`);
        }

        const payload = await res.json() as { roomCode?: unknown };
        roomCode = readString(payload.roomCode);
        if (!roomCode) {
          throw new Error('inject-scenario response did not include a valid roomCode.');
        }

        finishStage(backendStage, { succeeded: true, detail: { roomCode } });
      } catch (error: unknown) {
        finishStage(backendStage, { succeeded: false, error: errorMessage(error) });
        return jsonResult({
          status: 'failed',
          roomCode: null,
          sessionIds: allSessionIds,
          failedSessionIds: allSessionIds,
          stages,
          sessionResults,
        });
      }

      const navigationStage = startStage('frontend_navigation');
      const navigationOutcomes = await Promise.all(
        allSessionIds.map(async (sessionId): Promise<SessionStageOutcome> => {
          const { page } = getSession(sessionId);
          try {
            await page.goto(getFrontendUrl());
            return {
              sessionId,
              succeeded: true,
              error: null,
              detail: { url: page.url() },
            };
          } catch (error: unknown) {
            return {
              sessionId,
              succeeded: false,
              error: errorMessage(error),
              detail: { url: page.url() },
            };
          }
        }),
      );
      finishStage(navigationStage, {
        succeeded: navigationOutcomes.every((outcome) => outcome.succeeded),
        error: navigationOutcomes.every((outcome) => outcome.succeeded)
          ? null
          : 'One or more sessions failed to navigate to the frontend.',
        detail: navigationOutcomes,
      });

      const bridgeStage = startStage('bridge_ready');
      const bridgeOutcomes = await Promise.all(
        allSessionIds.map(async (sessionId): Promise<SessionStageOutcome> => {
          const { page } = getSession(sessionId);
          try {
            await waitForAgentBridge(page);
            const snapshot = await getAgentSnapshot<BridgeSnapshot>(page);
            sessionResults[sessionId].lastSnapshot = snapshot;
            return {
              sessionId,
              succeeded: true,
              error: null,
              detail: { snapshot },
            };
          } catch (error: unknown) {
            const snapshot = await getSnapshotForSession(sessionId);
            sessionResults[sessionId].lastSnapshot = snapshot;
            return {
              sessionId,
              succeeded: false,
              error: errorMessage(error),
              detail: { snapshot },
            };
          }
        }),
      );
      finishStage(bridgeStage, {
        succeeded: bridgeOutcomes.every((outcome) => outcome.succeeded),
        error: bridgeOutcomes.every((outcome) => outcome.succeeded)
          ? null
          : 'One or more sessions failed to expose the agent bridge after navigation.',
        detail: bridgeOutcomes,
      });

      const resumeStage = startStage('resume_poll');
      const resumeOutcomes = await Promise.all(
        allSessionIds.map(async (sessionId): Promise<SessionStageOutcome> => {
          const firstAttempt = await pollForInjectedRoom(sessionId, roomCode, 20_000);
          sessionResults[sessionId].lastSnapshot = firstAttempt.lastSnapshot;

          if (firstAttempt.succeeded) {
            sessionResults[sessionId] = { status: 'ready', lastSnapshot: firstAttempt.lastSnapshot };
            return {
              sessionId,
              succeeded: true,
              error: null,
              detail: {
                recovered: false,
                lastSnapshot: firstAttempt.lastSnapshot,
              },
            };
          }

          const stuckInLobby = getSnapshotView(firstAttempt.lastSnapshot) === 'lobby';
          if (stuckInLobby) {
            const { page } = getSession(sessionId);
            try {
              await page.reload();
              await waitForAgentBridge(page);
              const secondAttempt = await pollForInjectedRoom(sessionId, roomCode, 15_000);
              sessionResults[sessionId].lastSnapshot = secondAttempt.lastSnapshot;

              if (secondAttempt.succeeded) {
                sessionResults[sessionId] = { status: 'recovered', lastSnapshot: secondAttempt.lastSnapshot };
                return {
                  sessionId,
                  succeeded: true,
                  error: null,
                  detail: {
                    recovered: true,
                    lastSnapshot: secondAttempt.lastSnapshot,
                  },
                };
              }

              sessionResults[sessionId] = { status: 'failed', lastSnapshot: secondAttempt.lastSnapshot };
              return {
                sessionId,
                succeeded: false,
                error: secondAttempt.error,
                detail: {
                  recovered: false,
                  recoveryAttempted: true,
                  lastSnapshot: secondAttempt.lastSnapshot,
                },
              };
            } catch (error: unknown) {
              const snapshot = await getSnapshotForSession(sessionId);
              sessionResults[sessionId] = { status: 'failed', lastSnapshot: snapshot };
              return {
                sessionId,
                succeeded: false,
                error: errorMessage(error),
                detail: {
                  recovered: false,
                  recoveryAttempted: true,
                  lastSnapshot: snapshot,
                },
              };
            }
          }

          sessionResults[sessionId] = { status: 'failed', lastSnapshot: firstAttempt.lastSnapshot };
          return {
            sessionId,
            succeeded: false,
            error: firstAttempt.error,
            detail: {
              recovered: false,
              recoveryAttempted: false,
              lastSnapshot: firstAttempt.lastSnapshot,
            },
          };
        }),
      );
      finishStage(resumeStage, {
        succeeded: resumeOutcomes.every((outcome) => outcome.succeeded),
        error: resumeOutcomes.every((outcome) => outcome.succeeded)
          ? null
          : 'One or more sessions did not resume into the injected Playing room.',
        detail: resumeOutcomes,
      });

      const failedSessionIds = allSessionIds.filter((sessionId) => sessionResults[sessionId].status === 'failed');
      const status = failedSessionIds.length === 0 ? 'ready' : 'partial';

      return jsonResult({
        status,
        roomCode,
        sessionIds: allSessionIds,
        failedSessionIds,
        stages,
        sessionResults,
      });
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

  server.tool(
    'room_reopen_last_room',
    "Attempt to re-enter the most recent room this session was part of, using the bridge's recent-room state. Useful when a session got stuck in lobby after a failed scenario_inject_state.",
    {
      sessionId: z.string(),
      timeoutMs: z.number().int().min(250).max(60_000).optional().default(10_000),
    },
    async ({ sessionId, timeoutMs }) => {
      const { page } = getSession(sessionId);

      const isRecord = (value: unknown): value is Record<string, unknown> =>
        typeof value === 'object' && value !== null;

      const readString = (value: unknown): string | null =>
        typeof value === 'string' && value.length > 0 ? value : null;

      const getArrayRoomCode = (value: unknown): string | null => {
        if (!Array.isArray(value) || value.length === 0) {
          return null;
        }

        const [firstEntry] = value;
        if (!isRecord(firstEntry)) {
          return null;
        }

        return readString(firstEntry.roomCode) ?? readString(firstEntry.code);
      };

      const getRecentRoomCode = (snapshot: unknown): string | null => {
        if (!isRecord(snapshot)) {
          return null;
        }

        return readString(snapshot.recentRoomCode)
          ?? readString(snapshot.lastRoomCode)
          ?? (isRecord(snapshot.recentRoom)
            ? readString(snapshot.recentRoom.roomCode) ?? readString(snapshot.recentRoom.code)
            : null)
          ?? (isRecord(snapshot.lastRoom)
            ? readString(snapshot.lastRoom.roomCode) ?? readString(snapshot.lastRoom.code)
            : null)
          ?? getArrayRoomCode(snapshot.recentRooms)
          ?? getArrayRoomCode(snapshot.lastRooms)
          ?? getArrayRoomCode(snapshot.myRooms);
      };

      const initialSnapshot = await getAgentSnapshot<Record<string, unknown>>(page);
      const recentRoomCode = getRecentRoomCode(initialSnapshot);

      if (!recentRoomCode) {
        return jsonResult({
          sessionId,
          recentRoomCode: null,
          status: 'no_recent_room',
          snapshot: initialSnapshot,
        });
      }

      try {
        const joinInput = page.locator('[data-testid="lobby-join-code-input"]');
        await joinInput.click();
        await joinInput.fill(recentRoomCode);
        await page.locator('[data-testid="lobby-join-btn"]').click();

        const snapshot = await pollAgentBridge(
          page,
          () => getAgentSnapshot<Record<string, unknown>>(page),
          (candidate) => {
            if (typeof candidate !== 'object' || candidate === null) {
              return false;
            }

            const record = candidate as Record<string, unknown>;
            const gameState = typeof record.gameState === 'object' && record.gameState !== null
              ? record.gameState as Record<string, unknown>
              : null;
            const phase = gameState && typeof gameState.phase === 'string' ? gameState.phase : null;
            return phase === 'Playing' || phase === 'Lobby';
          },
          { timeoutMs, intervalMs: 300 },
        );

        return jsonResult({
          sessionId,
          recentRoomCode,
          status: 'joined',
          snapshot,
        });
      } catch (error: unknown) {
        const snapshot = await getAgentSnapshot<Record<string, unknown>>(page).catch(() => initialSnapshot);
        return jsonResult({
          sessionId,
          recentRoomCode,
          status: 'failed',
          snapshot,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },
  );
}
