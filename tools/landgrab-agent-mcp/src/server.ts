import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerSessionTools } from './tools/session-tools.js';
import { registerAuthTools } from './tools/auth-tools.js';
import { registerRoomTools } from './tools/room-tools.js';
import { registerMovementTools } from './tools/movement-tools.js';
import { registerEvidenceTools } from './tools/evidence-tools.js';
import { registerStateTools } from './tools/state-tools.js';
import { registerGameplayTools } from './tools/gameplay-tools.js';
import { registerRoomAutomationTools } from './tools/room-automation-tools.js';

const server = new McpServer({
  name: 'landgrab-playtester',
  version: '0.1.0',
});

registerSessionTools(server);
registerAuthTools(server);
registerRoomTools(server);
registerMovementTools(server);
registerEvidenceTools(server);
registerStateTools(server);
registerGameplayTools(server);
registerRoomAutomationTools(server);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Landgrab Playtester MCP server running on stdio');
}

main().catch((error) => {
  console.error('Failed to start MCP server:', error);
  process.exit(1);
});
