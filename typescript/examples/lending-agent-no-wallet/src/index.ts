import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import * as dotenv from 'dotenv';
import express from 'express';
import { isAddress } from 'viem';

import { Agent } from './agent.js';
import cors from 'cors';
import { z } from 'zod';
import type { Task } from 'a2a-samples-js';

const LendingAgentSchema = z.object({
  instruction: z
    .string()
    .describe(
      "A natural‑language lending directive, e.g. 'Borrow 50 USDC' or 'Supply 10 ETH' or question to ask the agent, e.g. 'What is my debt?' or 'What's the history of Aave?'."
    ),
  userAddress: z
    .string()
    .describe('The user wallet address which is used to sign transactions and to pay for gas.'),
});
type LendingAgentArgs = z.infer<typeof LendingAgentSchema>;

dotenv.config();

const server = new McpServer({
  name: 'lending-agent-server',
  version: '1.0.0',
});

let agent: Agent;

const initializeAgent = async (): Promise<void> => {
  console.error('🟣 [SERVER] Starting lending agent initialization...');
  const quicknodeSubdomain = process.env.QUICKNODE_SUBDOMAIN;
  const apiKey = process.env.QUICKNODE_API_KEY;
  if (!quicknodeSubdomain || !apiKey) {
    throw new Error('QUICKNODE_SUBDOMAIN and QUICKNODE_API_KEY must be set in the .env file.');
  }

  console.error('🟣 [SERVER] Creating new Agent instance...');
  agent = new Agent(quicknodeSubdomain, apiKey);
  console.error('🟣 [SERVER] Calling agent.init()...');
  await agent.init();
  console.error('🟣 [SERVER] Agent initialization completed successfully!');
};

const agentToolName = 'askLendingAgent';
const agentToolDescription =
  'Sends a free‑form, natural‑language lending instruction to this Aave lending AI agent and returns a structured quote including transaction data. You can also ask questions to the agent about the Aave protocol.';

server.tool(
  agentToolName,
  agentToolDescription,
  LendingAgentSchema.shape,
  async (args: LendingAgentArgs) => {
    console.error('🟣 [SERVER] Tool execution started with args:', args);
    const { instruction, userAddress } = args;
    if (!isAddress(userAddress)) {
      throw new Error('Invalid user address provided.');
    }
    try {
      console.error('🟣 [SERVER] Calling agent.processUserInput...');
      const taskResponse = await agent.processUserInput(instruction, userAddress);

      console.error('🟣 [SERVER] result', taskResponse);

      return {
        content: [{ type: 'text', text: JSON.stringify(taskResponse) }],
      };
    } catch (error: unknown) {
      const err = error as Error;
      const errorTask: Task = {
        id: userAddress,
        status: {
          state: 'failed',
          message: {
            role: 'agent',
            parts: [{ type: 'text', text: `Error: ${err.message}` }],
          },
        },
      };
      return {
        isError: true,
        content: [{ type: 'text', text: JSON.stringify(errorTask) }],
      };
    }
  }
);

const app = express();

app.use(cors());

app.get('/', (_req, res) => {
  res.json({
    name: 'Lending Agent No Wallet Server',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      '/': 'Server information (this response)',
      '/sse': 'Server-Sent Events endpoint for MCP connection',
      '/messages': 'POST endpoint for MCP messages',
    },
    tools: [{ name: agentToolName, description: agentToolDescription }],
  });
});

const sseConnections = new Set();

let transport: SSEServerTransport;

app.get('/sse', async (_req, res) => {
  transport = new SSEServerTransport('/messages', res);
  await server.connect(transport);

  sseConnections.add(res);

  const keepaliveInterval = setInterval(() => {
    if (res.writableEnded) {
      clearInterval(keepaliveInterval);
      return;
    }
    res.write(':keepalive\n\n');
  }, 30000);

  _req.on('close', () => {
    clearInterval(keepaliveInterval);
    sseConnections.delete(res);
    transport.close?.();
  });

  res.on('error', err => {
    console.error('SSE Error:', err);
    clearInterval(keepaliveInterval);
    sseConnections.delete(res);
    transport.close?.();
  });
});

app.post('/messages', async (req, res) => {
  await transport.handlePostMessage(req, res);
});

const PORT = 3001;
const main = async () => {
  try {
    await initializeAgent();
    app.listen(PORT, () => {
      console.error(`MCP SSE Agent Server running on port ${PORT}`);
    });
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Failed to start server:', err.message);
    process.exit(1);
  }
};

main();
