import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getSession } from '../lib/browser-registry.js';
import { callAgentBridge, getAgentSnapshot } from '../lib/agent-bridge.js';

function jsonResult(payload: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(payload) }] };
}

export function registerGameplayTools(server: McpServer): void {
  server.tool(
    'player_select_hex',
    'Select a hex in the active Landgrab UI for a session.',
    { sessionId: z.string(), q: z.number().int(), r: z.number().int() },
    async ({ sessionId, q, r }) => {
      const { page } = getSession(sessionId);
      const snapshot = await callAgentBridge(page, 'selectHex', q, r);
      return jsonResult({ sessionId, q, r, snapshot });
    },
  );

  server.tool(
    'player_claim_hex',
    'Place troops on a hex to claim or reinforce it using the real game action path.',
    {
      sessionId: z.string(),
      q: z.number().int(),
      r: z.number().int(),
      troopCount: z.number().int().min(1).optional(),
      mode: z.enum(['claim', 'claimAlliance', 'claimSelf', 'reinforce']).optional().default('claim'),
    },
    async ({ sessionId, q, r, troopCount, mode }) => {
      const { page } = getSession(sessionId);
      const result = await callAgentBridge(page, 'claimHex', { q, r, troopCount, mode });
      return jsonResult({ sessionId, q, r, mode, troopCount, result });
    },
  );

  server.tool(
    'player_attack_hex',
    'Attack a hex using the real PlaceTroops gameplay flow, optionally with a requested troop count.',
    {
      sessionId: z.string(),
      q: z.number().int(),
      r: z.number().int(),
      troopCount: z.number().int().min(1).optional(),
    },
    async ({ sessionId, q, r, troopCount }) => {
      const { page } = getSession(sessionId);
      const result = await callAgentBridge(page, 'attackHex', { q, r, troopCount });
      return jsonResult({ sessionId, q, r, troopCount, result });
    },
  );

  server.tool(
    'player_pickup_troops',
    'Pick up troops from a hex using the real PickUpTroops gameplay action.',
    {
      sessionId: z.string(),
      q: z.number().int(),
      r: z.number().int(),
      count: z.number().int().min(1),
    },
    async ({ sessionId, q, r, count }) => {
      const { page } = getSession(sessionId);
      const result = await callAgentBridge(page, 'pickupTroops', { q, r, count });
      return jsonResult({ sessionId, q, r, count, result });
    },
  );

  server.tool(
    'player_reclaim_hex',
    'Deploy troops back onto a hex after losing territory or after a capture follow-up; implemented via the current PlaceTroops flow.',
    {
      sessionId: z.string(),
      q: z.number().int(),
      r: z.number().int(),
      troopCount: z.number().int().min(1).optional(),
    },
    async ({ sessionId, q, r, troopCount }) => {
      const { page } = getSession(sessionId);
      const result = await callAgentBridge(page, 'reclaimHex', { q, r, troopCount });
      return jsonResult({ sessionId, q, r, troopCount, result });
    },
  );

  server.tool(
    'map_center_on_player',
    'Center the map on the current player position in the specified session.',
    { sessionId: z.string() },
    async ({ sessionId }) => {
      const { page } = getSession(sessionId);
      const snapshot = await callAgentBridge(page, 'centerOnPlayer');
      return jsonResult({ sessionId, snapshot });
    },
  );

  server.tool(
    'map_pan_to_hex',
    'Pan the visible map to a specific hex in the specified session.',
    { sessionId: z.string(), q: z.number().int(), r: z.number().int() },
    async ({ sessionId, q, r }) => {
      const { page } = getSession(sessionId);
      const snapshot = await callAgentBridge(page, 'panToHex', q, r);
      return jsonResult({ sessionId, q, r, snapshot });
    },
  );

  server.tool(
    'map_get_visible_hexes',
    'Return the hex keys currently visible inside the main map viewport for a session.',
    { sessionId: z.string() },
    async ({ sessionId }) => {
      const { page } = getSession(sessionId);
      const visibleHexKeys = await callAgentBridge<string[]>(page, 'getVisibleHexKeys');
      return jsonResult({ sessionId, visibleHexKeys });
    },
  );

  server.tool(
    'map_select_hex_near_player',
    'Select a hex relative to the current player hex by dq/dr offsets.',
    {
      sessionId: z.string(),
      dq: z.number().int(),
      dr: z.number().int(),
    },
    async ({ sessionId, dq, dr }) => {
      const { page } = getSession(sessionId);
      const snapshot = await getAgentSnapshot<any>(page);
      const currentHex = snapshot?.currentHex;
      if (!Array.isArray(currentHex) || currentHex.length !== 2) {
        throw new Error('Current player hex is not available.');
      }

      const q = Number(currentHex[0]) + dq;
      const r = Number(currentHex[1]) + dr;
      const result = await callAgentBridge(page, 'selectHex', q, r);
      return jsonResult({ sessionId, origin: currentHex, dq, dr, target: [q, r], result });
    },
  );

  server.tool(
    'player_teleport_to_hex',
    'Instantly teleport a player to a specific hex by calling UpdatePlayerLocation via SignalR. Much faster than step-by-step navigation. Requires hostBypassGps to be enabled.',
    {
      sessionId: z.string(),
      q: z.number().int(),
      r: z.number().int(),
    },
    async ({ sessionId, q, r }) => {
      const { page } = getSession(sessionId);
      const result = await callAgentBridge(page, 'moveToHex', q, r);
      return jsonResult({ sessionId, q, r, result });
    },
  );

  server.tool(
    'gameplay_batch_actions',
    `Execute a sequence of gameplay actions in a single call. Each action automatically teleports the player to the target hex first.
Supported action types:
- "move": Teleport to hex (q, r)
- "claim": Move to hex and place troops (claim neutral or reinforce allied hex)
- "attack": Move to hex and attack enemy hex with combat resolution
- "pickup": Move to hex and pick up troops (troopCount = number to pick up)
This is much faster than calling individual tools for each action.`,
    {
      sessionId: z.string(),
      actions: z.array(z.object({
        type: z.enum(['move', 'claim', 'attack', 'pickup']),
        q: z.number().int(),
        r: z.number().int(),
        troopCount: z.number().int().min(1).optional(),
      })).min(1).max(50),
    },
    async ({ sessionId, actions }) => {
      const { page } = getSession(sessionId);
      const result = await callAgentBridge(page, 'batchActions', actions);
      return jsonResult({ sessionId, actionCount: actions.length, result });
    },
  );
}
