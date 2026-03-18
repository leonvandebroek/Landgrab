import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getSession } from '../lib/browser-registry.js';
import { callAgentBridge, getAgentConnectionStatus, getAgentEvents, getAgentSnapshot, pollAgentBridge } from '../lib/agent-bridge.js';

function jsonResult(payload: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(payload) }] };
}

function getPlayer(snapshot: any, query: { playerId?: string; playerName?: string; self?: boolean }) {
  if (query.self || (!query.playerId && !query.playerName)) {
    return snapshot?.myPlayer ?? null;
  }

  return (snapshot?.gameState?.players ?? []).find((player: any) => {
    if (query.playerId && player.id === query.playerId) {
      return true;
    }

    return Boolean(query.playerName && player.name === query.playerName);
  }) ?? null;
}

function getHexCell(snapshot: any, q?: number, r?: number) {
  if (q == null || r == null) {
    return null;
  }

  return snapshot?.gameState?.grid?.[`${q},${r}`] ?? null;
}

function matchesStateCriteria(snapshot: any, criteria: any): boolean {
  if (criteria.phase && snapshot?.gameState?.phase !== criteria.phase) {
    return false;
  }

  if (criteria.view && snapshot?.view !== criteria.view) {
    return false;
  }

  if (criteria.roomCode && snapshot?.roomCode !== criteria.roomCode) {
    return false;
  }

  if (criteria.minPlayers != null && (snapshot?.gameState?.players?.length ?? 0) < criteria.minPlayers) {
    return false;
  }

  if (criteria.currentWizardStep != null && snapshot?.gameState?.currentWizardStep !== criteria.currentWizardStep) {
    return false;
  }

  if (criteria.currentHexQ != null || criteria.currentHexR != null) {
    if (snapshot?.currentHex?.[0] !== criteria.currentHexQ || snapshot?.currentHex?.[1] !== criteria.currentHexR) {
      return false;
    }
  }

  if (criteria.selectedHexQ != null || criteria.selectedHexR != null) {
    if (snapshot?.selectedHex?.[0] !== criteria.selectedHexQ || snapshot?.selectedHex?.[1] !== criteria.selectedHexR) {
      return false;
    }
  }

  if (criteria.errorIncludes) {
    const errorText = snapshot?.ui?.error ?? '';
    if (!String(errorText).includes(criteria.errorIncludes)) {
      return false;
    }
  }

  if (criteria.connectionState) {
    if (snapshot?.connectionStatus?.state !== criteria.connectionState) {
      return false;
    }
  }

  if (
    criteria.playerId || criteria.playerName || criteria.playerSelf || criteria.playerHexQ != null || criteria.playerHexR != null
    || criteria.playerConnected != null || criteria.playerCarriedTroopsAtLeast != null
  ) {
    const player = getPlayer(snapshot, {
      playerId: criteria.playerId,
      playerName: criteria.playerName,
      self: criteria.playerSelf,
    });

    if (!player) {
      return false;
    }

    if (criteria.playerHexQ != null && player.currentHexQ !== criteria.playerHexQ) {
      return false;
    }

    if (criteria.playerHexR != null && player.currentHexR !== criteria.playerHexR) {
      return false;
    }

    if (criteria.playerConnected != null && player.isConnected !== criteria.playerConnected) {
      return false;
    }

    if (criteria.playerCarriedTroopsAtLeast != null && (player.carriedTroops ?? 0) < criteria.playerCarriedTroopsAtLeast) {
      return false;
    }
  }

  if (
    criteria.hexQ != null || criteria.hexR != null || criteria.hexOwnerId || criteria.hexOwnerName
    || criteria.hexTroopsAtLeast != null || criteria.hexIsMasterTile != null
  ) {
    const cell = getHexCell(snapshot, criteria.hexQ, criteria.hexR);
    if (!cell) {
      return false;
    }

    if (criteria.hexOwnerId && cell.ownerId !== criteria.hexOwnerId) {
      return false;
    }

    if (criteria.hexOwnerName && cell.ownerName !== criteria.hexOwnerName) {
      return false;
    }

    if (criteria.hexTroopsAtLeast != null && (cell.troops ?? 0) < criteria.hexTroopsAtLeast) {
      return false;
    }

    if (criteria.hexIsMasterTile != null && cell.isMasterTile !== criteria.hexIsMasterTile) {
      return false;
    }
  }

  return true;
}

function normalizePlayers(snapshot: any) {
  return [...(snapshot?.gameState?.players ?? [])]
    .map((player: any) => ({
      id: player.id,
      name: player.name,
      allianceId: player.allianceId ?? null,
      currentHexQ: player.currentHexQ ?? null,
      currentHexR: player.currentHexR ?? null,
      carriedTroops: player.carriedTroops ?? 0,
      territoryCount: player.territoryCount ?? 0,
      isConnected: player.isConnected ?? false,
    }))
    .sort((left: any, right: any) => String(left.id).localeCompare(String(right.id)));
}

function normalizeGrid(snapshot: any) {
  const grid = snapshot?.gameState?.grid ?? {};
  return Object.fromEntries(
    Object.entries(grid)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, cell]: [string, any]) => [key, {
        ownerId: cell.ownerId ?? null,
        ownerAllianceId: cell.ownerAllianceId ?? null,
        ownerName: cell.ownerName ?? null,
        troops: cell.troops ?? 0,
        isMasterTile: cell.isMasterTile ?? false,
      }]),
  );
}

function normalizeSnapshotForSync(snapshot: any, scope: 'full' | 'phase' | 'players' | 'hex', q?: number, r?: number) {
  if (scope === 'hex') {
    return getHexCell(snapshot, q, r);
  }

  if (scope === 'phase') {
    return {
      roomCode: snapshot?.roomCode ?? null,
      view: snapshot?.view ?? null,
      phase: snapshot?.gameState?.phase ?? null,
      currentWizardStep: snapshot?.gameState?.currentWizardStep ?? null,
    };
  }

  if (scope === 'players') {
    return {
      roomCode: snapshot?.roomCode ?? null,
      phase: snapshot?.gameState?.phase ?? null,
      players: normalizePlayers(snapshot),
    };
  }

  return {
    roomCode: snapshot?.roomCode ?? null,
    phase: snapshot?.gameState?.phase ?? null,
    currentWizardStep: snapshot?.gameState?.currentWizardStep ?? null,
    players: normalizePlayers(snapshot),
    grid: normalizeGrid(snapshot),
  };
}

function matchEvent(event: any, filters: any) {
  if (filters.eventName && event?.name !== filters.eventName) {
    return false;
  }

  if (filters.q != null && event?.payload?.q !== filters.q) {
    return false;
  }

  if (filters.r != null && event?.payload?.r !== filters.r) {
    return false;
  }

  if (filters.roomCode && event?.payload?.roomCode !== filters.roomCode) {
    return false;
  }

  if (filters.containsText) {
    const text = JSON.stringify(event?.payload ?? {});
    if (!text.includes(filters.containsText)) {
      return false;
    }
  }

  return true;
}

export function registerStateTools(server: McpServer): void {
  server.tool(
    'state_game_snapshot',
    'Return the rich frontend game snapshot exposed by the Landgrab agent bridge for a session.',
    { sessionId: z.string() },
    async ({ sessionId }) => {
      const { page } = getSession(sessionId);
      const snapshot = await getAgentSnapshot(page);
      return jsonResult({ sessionId, snapshot });
    },
  );

  server.tool(
    'state_hex_snapshot',
    'Return the current state and available actions for a specific hex in a session.',
    { sessionId: z.string(), q: z.number().int(), r: z.number().int() },
    async ({ sessionId, q, r }) => {
      const { page } = getSession(sessionId);
      const hex = await callAgentBridge(page, 'getHexSnapshot', q, r);
      return jsonResult({ sessionId, q, r, hex });
    },
  );

  server.tool(
    'state_player_snapshot',
    'Return player state for the current player or for a named player in a session.',
    {
      sessionId: z.string(),
      playerId: z.string().optional(),
      playerName: z.string().optional(),
      self: z.boolean().optional().default(true),
    },
    async ({ sessionId, playerId, playerName, self }) => {
      const { page } = getSession(sessionId);
      const player = await callAgentBridge(page, 'getPlayerSnapshot', { playerId, playerName, self });
      return jsonResult({ sessionId, player });
    },
  );

  server.tool(
    'state_wait_for',
    'Wait until frontend bridge state in a session matches the provided criteria.',
    {
      sessionId: z.string(),
      timeoutMs: z.number().int().min(250).max(60_000).optional().default(10_000),
      intervalMs: z.number().int().min(50).max(5_000).optional().default(250),
      phase: z.enum(['Lobby', 'Playing', 'GameOver']).optional(),
      view: z.enum(['lobby', 'game', 'gameover', 'mapEditor']).optional(),
      roomCode: z.string().optional(),
      minPlayers: z.number().int().min(1).max(30).optional(),
      currentWizardStep: z.number().int().min(0).max(10).optional(),
      currentHexQ: z.number().int().optional(),
      currentHexR: z.number().int().optional(),
      selectedHexQ: z.number().int().optional(),
      selectedHexR: z.number().int().optional(),
      errorIncludes: z.string().optional(),
      connectionState: z.enum(['connected', 'reconnecting', 'disconnected']).optional(),
      playerId: z.string().optional(),
      playerName: z.string().optional(),
      playerSelf: z.boolean().optional().default(true),
      playerHexQ: z.number().int().optional(),
      playerHexR: z.number().int().optional(),
      playerConnected: z.boolean().optional(),
      playerCarriedTroopsAtLeast: z.number().int().min(0).optional(),
      hexQ: z.number().int().optional(),
      hexR: z.number().int().optional(),
      hexOwnerId: z.string().optional(),
      hexOwnerName: z.string().optional(),
      hexTroopsAtLeast: z.number().int().min(0).optional(),
      hexIsMasterTile: z.boolean().optional(),
    },
    async ({ sessionId, timeoutMs, intervalMs, ...criteria }) => {
      const { page } = getSession(sessionId);
      const snapshot = await pollAgentBridge(
        page,
        () => getAgentSnapshot(page),
        (candidate) => matchesStateCriteria(candidate, criteria),
        { timeoutMs, intervalMs },
      );
      return jsonResult({ sessionId, matched: criteria, snapshot });
    },
  );

  server.tool(
    'state_wait_for_event',
    'Wait until a matching frontend bridge event appears in a session event log.',
    {
      sessionId: z.string(),
      eventName: z.string(),
      sinceId: z.number().int().min(0).optional().default(0),
      timeoutMs: z.number().int().min(250).max(60_000).optional().default(10_000),
      intervalMs: z.number().int().min(50).max(5_000).optional().default(250),
      q: z.number().int().optional(),
      r: z.number().int().optional(),
      roomCode: z.string().optional(),
      containsText: z.string().optional(),
    },
    async ({ sessionId, sinceId, timeoutMs, intervalMs, ...filters }) => {
      const { page } = getSession(sessionId);
      let cursor = sinceId;
      const result = await pollAgentBridge(
        page,
        async () => {
          const events = await getAgentEvents<any[]>(page, cursor);
          if (events.length > 0) {
            cursor = Math.max(cursor, Number(events[events.length - 1]?.id ?? cursor));
          }
          return {
            cursor,
            event: events.find((event) => matchEvent(event, filters)) ?? null,
          };
        },
        (candidate) => Boolean(candidate.event),
        { timeoutMs, intervalMs },
      );

      return jsonResult({ sessionId, event: result.event, nextCursor: result.cursor });
    },
  );

  server.tool(
    'state_last_events',
    'Return the most recent frontend bridge events from a session.',
    {
      sessionId: z.string(),
      limit: z.number().int().min(1).max(100).optional().default(20),
      eventName: z.string().optional(),
    },
    async ({ sessionId, limit, eventName }) => {
      const { page } = getSession(sessionId);
      const events = await getAgentEvents<any[]>(page);
      const filtered = eventName ? events.filter((event) => event?.name === eventName) : events;
      return jsonResult({ sessionId, events: filtered.slice(-limit) });
    },
  );

  server.tool(
    'assert_sessions_in_sync',
    'Assert that multiple sessions are observing the same game state, players, phase, or a specific hex.',
    {
      sessionIds: z.array(z.string()).min(2),
      scope: z.enum(['full', 'phase', 'players', 'hex']).optional().default('full'),
      q: z.number().int().optional(),
      r: z.number().int().optional(),
    },
    async ({ sessionIds, scope, q, r }) => {
      if (scope === 'hex' && (q == null || r == null)) {
        throw new Error('q and r are required when scope is "hex".');
      }

      const normalizedBySession: Record<string, unknown> = {};
      for (const sessionId of sessionIds) {
        const { page } = getSession(sessionId);
        const snapshot = await getAgentSnapshot(page);
        normalizedBySession[sessionId] = normalizeSnapshotForSync(snapshot, scope, q, r);
      }

      const [baselineSessionId, ...rest] = sessionIds;
      const baseline = JSON.stringify(normalizedBySession[baselineSessionId]);
      const mismatches = rest.filter((sessionId) => JSON.stringify(normalizedBySession[sessionId]) !== baseline);

      return jsonResult({
        inSync: mismatches.length === 0,
        scope,
        q,
        r,
        baselineSessionId,
        mismatches,
        snapshots: normalizedBySession,
      });
    },
  );

  server.tool(
    'assert_hex_state',
    'Assert expected hex ownership/troop state in one or more sessions.',
    {
      sessionIds: z.array(z.string()).min(1),
      q: z.number().int(),
      r: z.number().int(),
      ownerId: z.string().optional(),
      ownerName: z.string().optional(),
      troops: z.number().int().min(0).optional(),
      troopsAtLeast: z.number().int().min(0).optional(),
      isMasterTile: z.boolean().optional(),
    },
    async ({ sessionIds, q, r, ownerId, ownerName, troops, troopsAtLeast, isMasterTile }) => {
      const results: Record<string, any> = {};
      const mismatches: Array<{ sessionId: string; reason: string }> = [];

      for (const sessionId of sessionIds) {
        const { page } = getSession(sessionId);
        const hex = await callAgentBridge<any>(page, 'getHexSnapshot', q, r);
        results[sessionId] = hex;

        const cell = hex?.cell;
        if (!cell) {
          mismatches.push({ sessionId, reason: 'Hex not found in snapshot.' });
          continue;
        }

        if (ownerId && cell.ownerId !== ownerId) {
          mismatches.push({ sessionId, reason: `Expected ownerId ${ownerId} but found ${cell.ownerId ?? 'null'}.` });
        }
        if (ownerName && cell.ownerName !== ownerName) {
          mismatches.push({ sessionId, reason: `Expected ownerName ${ownerName} but found ${cell.ownerName ?? 'null'}.` });
        }
        if (troops != null && cell.troops !== troops) {
          mismatches.push({ sessionId, reason: `Expected troops ${troops} but found ${cell.troops ?? 'null'}.` });
        }
        if (troopsAtLeast != null && (cell.troops ?? 0) < troopsAtLeast) {
          mismatches.push({ sessionId, reason: `Expected at least ${troopsAtLeast} troops but found ${cell.troops ?? 0}.` });
        }
        if (isMasterTile != null && cell.isMasterTile !== isMasterTile) {
          mismatches.push({ sessionId, reason: `Expected isMasterTile ${isMasterTile} but found ${cell.isMasterTile}.` });
        }
      }

      return jsonResult({ pass: mismatches.length === 0, q, r, mismatches, results });
    },
  );

  server.tool(
    'assert_player_state',
    'Assert expected player state in a single session.',
    {
      sessionId: z.string(),
      playerId: z.string().optional(),
      playerName: z.string().optional(),
      self: z.boolean().optional().default(true),
      expectedHexQ: z.number().int().optional(),
      expectedHexR: z.number().int().optional(),
      expectedAllianceId: z.string().optional(),
      expectedConnected: z.boolean().optional(),
      carriedTroopsAtLeast: z.number().int().min(0).optional(),
      expectedTerritoryCountAtLeast: z.number().int().min(0).optional(),
    },
    async ({ sessionId, playerId, playerName, self, expectedHexQ, expectedHexR, expectedAllianceId, expectedConnected, carriedTroopsAtLeast, expectedTerritoryCountAtLeast }) => {
      const { page } = getSession(sessionId);
      const result = await callAgentBridge<any>(page, 'getPlayerSnapshot', { playerId, playerName, self });
      const player = result?.player;
      const mismatches: string[] = [];

      if (!player) {
        mismatches.push('Player not found.');
      } else {
        if (expectedHexQ != null && player.currentHexQ !== expectedHexQ) {
          mismatches.push(`Expected currentHexQ ${expectedHexQ} but found ${player.currentHexQ ?? 'null'}.`);
        }
        if (expectedHexR != null && player.currentHexR !== expectedHexR) {
          mismatches.push(`Expected currentHexR ${expectedHexR} but found ${player.currentHexR ?? 'null'}.`);
        }
        if (expectedAllianceId && player.allianceId !== expectedAllianceId) {
          mismatches.push(`Expected allianceId ${expectedAllianceId} but found ${player.allianceId ?? 'null'}.`);
        }
        if (expectedConnected != null && player.isConnected !== expectedConnected) {
          mismatches.push(`Expected isConnected ${expectedConnected} but found ${player.isConnected}.`);
        }
        if (carriedTroopsAtLeast != null && (player.carriedTroops ?? 0) < carriedTroopsAtLeast) {
          mismatches.push(`Expected at least ${carriedTroopsAtLeast} carried troops but found ${player.carriedTroops ?? 0}.`);
        }
        if (expectedTerritoryCountAtLeast != null && (player.territoryCount ?? 0) < expectedTerritoryCountAtLeast) {
          mismatches.push(`Expected at least ${expectedTerritoryCountAtLeast} territory but found ${player.territoryCount ?? 0}.`);
        }
      }

      return jsonResult({ pass: mismatches.length === 0, player, mismatches });
    },
  );

  server.tool(
    'signalr_status',
    'Return the current SignalR connection state exposed by the frontend bridge.',
    { sessionId: z.string() },
    async ({ sessionId }) => {
      const { page } = getSession(sessionId);
      const status = await getAgentConnectionStatus(page);
      return jsonResult({ sessionId, status });
    },
  );

  server.tool(
    'wait_for_connection_state',
    'Wait until the frontend bridge reports the requested SignalR connection state.',
    {
      sessionId: z.string(),
      state: z.enum(['connected', 'reconnecting', 'disconnected']),
      timeoutMs: z.number().int().min(250).max(60_000).optional().default(10_000),
      intervalMs: z.number().int().min(50).max(5_000).optional().default(250),
    },
    async ({ sessionId, state, timeoutMs, intervalMs }) => {
      const { page } = getSession(sessionId);
      const status = await pollAgentBridge(
        page,
        () => getAgentConnectionStatus<any>(page),
        (candidate) => candidate?.state === state,
        { timeoutMs, intervalMs },
      );
      return jsonResult({ sessionId, status });
    },
  );
}
