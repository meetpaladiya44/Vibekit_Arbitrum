import { tool, type CoreTool } from 'ai';
import { z } from 'zod';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { cookies } from 'next/headers';
import { DEFAULT_SERVER_URLS } from '../../../agents-config';
import type { ChatAgentId } from '../../../agents-config';

/*export const getEmberLending = tool({
  description: 'Get the current weather at a location',
  parameters: z.object({
    latitude: z.number(),
    longitude: z.number(),
  }),
  execute: async ({ latitude, longitude }) => {
    const response = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m&hourly=temperature_2m&daily=sunrise,sunset&timezone=auto`,
    );

    const weatherData = await response.json();
    return weatherData;
  },
}); */

const URL_CHAT_IDS = new Map<string, ChatAgentId>();
DEFAULT_SERVER_URLS.forEach((value, key) => URL_CHAT_IDS.set(value, key));

const convertToZodSchema = (schema: any): z.ZodSchema => {
  if (!schema) return z.object({});

  // If it's already a Zod schema, return it
  if (schema._def !== undefined) return schema;

  // For an object schema, convert properties
  if (schema.type === 'object' && schema.properties) {
    const zodProperties: { [key: string]: z.ZodTypeAny } = {};
    Object.entries(schema.properties).forEach(([key, propSchema]: [string, any]) => {
      switch (propSchema.type) {
        case 'string':
          zodProperties[key] = z.string();
          break;
        case 'number':
          zodProperties[key] = z.number();
          break;
        case 'boolean':
          zodProperties[key] = z.boolean();
          break;
        default:
          // Default to any for complex types
          zodProperties[key] = z.any();
      }
    });
    return z.object(zodProperties);
  }

  // Default fallback
  return z.object({});
};

async function getTool(serverUrl: string) {
  console.log('🔄 [TOOL-AGENTS] getTool called with URL:', serverUrl);
  let mcpClient = null;

  // Create MCP Client
  mcpClient = new Client(
    { name: 'TestClient', version: '1.0.0' },
    { capabilities: { tools: {}, resources: {}, prompts: {} } }
  );
  console.log('✅ [TOOL-AGENTS] MCP Client created');

  // Create SSE transport
  let transport = null;
  if (serverUrl) {
    try {
      console.log('🔄 [TOOL-AGENTS] Creating SSE transport for URL:', serverUrl);
      transport = new SSEClientTransport(new URL(serverUrl));
      console.log('✅ [TOOL-AGENTS] SSE transport created successfully');
    } catch (error) {
      console.error(`❌ [TOOL-AGENTS] Error creating SSE transport for URL ${serverUrl}:`, error);
      return {}; // Return empty object so the app can continue
    }
  } else {
    console.error(`❌ [TOOL-AGENTS] No server URL provided for creating SSE transport`);
    return {};
  }

  // Connect to the server
  if (transport) {
    try {
      console.log('🔄 [TOOL-AGENTS] Attempting to connect MCP client to transport...');
      await mcpClient.connect(transport);
      console.log('✅ [TOOL-AGENTS] MCP client connected successfully!');
    } catch (error) {
      console.error(`❌ [TOOL-AGENTS] Error connecting MCP client to transport:`, error);
      console.error(`❌ [TOOL-AGENTS] Connection error details:`, {
        serverUrl,
        errorMessage: error instanceof Error ? error.message : String(error),
        errorName: error instanceof Error ? error.name : 'Unknown',
      });
      return {}; // Return empty object so the app can continue
    }
  } else {
    console.error(`❌ [TOOL-AGENTS] Transport is null, cannot connect MCP client`);
    return {};
  }

  // Try to discover tools
  console.log('🔄 [TOOL-AGENTS] Attempting to discover tools via MCP client...');
  // biome-ignore lint/suspicious/noImplicitAnyLet: <explanation>
  let toolsResponse;
  try {
    console.log('🔄 [TOOL-AGENTS] Calling mcpClient.listTools()...');
    toolsResponse = await mcpClient.listTools();
    console.log('✅ [TOOL-AGENTS] Tools discovered:', toolsResponse?.tools?.length || 0);
    console.log('✅ [TOOL-AGENTS] Tool names:', toolsResponse?.tools?.map(t => t.name) || []);
  } catch (error) {
    console.error('❌ [TOOL-AGENTS] Error discovering tools:', error);
    console.error('❌ [TOOL-AGENTS] Tools discovery error details:', {
      errorMessage: error instanceof Error ? error.message : String(error),
      errorName: error instanceof Error ? error.name : 'Unknown',
    });
    toolsResponse = { tools: [] }; // Fallback to empty tools array
  }

  // Use reduce to create an object mapping tool names to AI tools
  console.log('🔄 [TOOL-AGENTS] Converting MCP tools to AI tools...');
  const toolObject = toolsResponse.tools.reduce(
    (acc, mcptool) => {
      // Convert MCP tool schema to Zod schema
      try {
        console.log('🔄 [TOOL-AGENTS] Converting tool:', mcptool.name);
        const aiTool = tool({
          description: mcptool.description,
          parameters: convertToZodSchema(mcptool.inputSchema),
          execute: async args => {
            console.log('🚀 [TOOL-AGENTS] Executing tool:', mcptool.name);
            console.log('🚀 [TOOL-AGENTS] Tool arguments:', args);
            console.log('🚀 [TOOL-AGENTS] MCP Client available:', !!mcpClient);

            try {
              console.log('🚀 [TOOL-AGENTS] Calling MCP tool:', mcptool.name);
              const result = await mcpClient.callTool({
                name: mcptool.name,
                arguments: args,
              });
              console.log('✅ [TOOL-AGENTS] Tool executed successfully:', mcptool.name);
              console.log(
                '✅ [TOOL-AGENTS] Tool result preview:',
                JSON.stringify(result).substring(0, 200) + '...'
              );

              const toolResult = { status: 'completed', result: result };
              return toolResult;
            } catch (error) {
              console.error(`❌ [TOOL-AGENTS] Error executing tool ${mcptool.name}:`, error);
              console.error(`❌ [TOOL-AGENTS] Tool execution error details:`, {
                toolName: mcptool.name,
                arguments: args,
                errorMessage: error instanceof Error ? error.message : String(error),
                errorName: error instanceof Error ? error.name : 'Unknown',
              });

              // Return a more informative error that can be displayed to user
              return {
                status: 'error',
                result: {
                  error: String(error),
                  message: `Failed to execute ${mcptool.name}. Please try again later.`,
                },
              };
            }
          },
        });
        // Add the tool to the accumulator object, using its name as the key
        acc[mcptool.name] = aiTool;
        console.log('✅ [TOOL-AGENTS] Successfully converted tool:', mcptool.name);
      } catch (error) {
        console.error(`❌ [TOOL-AGENTS] Error creating AI tool for ${mcptool.name}:`, error);
      }
      return acc;
    },
    {} as { [key: string]: CoreTool }
  );

  // Return the object of tools
  console.log('✅ [TOOL-AGENTS] Final toolObject keys:', Object.keys(toolObject));
  return toolObject;
}

export const getTools = async (): Promise<{ [key: string]: CoreTool }> => {
  console.log('🔄 [TOOL-AGENTS] Starting getTools initialization...');

  const cookieStore = await cookies();
  const rawAgentId = cookieStore.get('agent')?.value;
  const agentId = rawAgentId as ChatAgentId | undefined;
  const overrideUrl = process.env.MCP_SERVER_URL; // optional env override

  console.log('🔄 [TOOL-AGENTS] Agent selection:', { rawAgentId, agentId, overrideUrl });

  // helper that chooses override first, then config file
  const resolveUrl = (id: ChatAgentId) => overrideUrl ?? DEFAULT_SERVER_URLS.get(id) ?? '';

  // "all" agents: fan-out to every URL
  if (!agentId || agentId === 'all') {
    console.log('🔄 [TOOL-AGENTS] Loading ALL agents...');
    const urls = Array.from(DEFAULT_SERVER_URLS.keys()).map(id => resolveUrl(id));
    console.log('🔄 [TOOL-AGENTS] URLs to connect to:', urls);

    const toolsByAgent = await Promise.all(urls.map(getTool));
    console.log(
      '🔄 [TOOL-AGENTS] Tools loaded per agent:',
      toolsByAgent.map(tools => Object.keys(tools))
    );

    // flatten and prefix so you don't get name collisions
    const allTools = toolsByAgent.reduce(
      (all: Record<string, CoreTool>, tools: { [key: string]: CoreTool }, idx: number) => {
        const id = Array.from(DEFAULT_SERVER_URLS.keys())[idx];
        Object.entries(tools).forEach(([toolName, tool]) => {
          all[`${id}-${toolName}`] = tool; // Changed to dash for clarity
        });
        return all;
      },
      {} as Record<string, CoreTool>
    );

    console.log('✅ [TOOL-AGENTS] Final combined tools:', Object.keys(allTools));
    return allTools;
  }

  // single agent
  console.log('🔄 [TOOL-AGENTS] Loading single agent:', agentId);
  const serverUrl = resolveUrl(agentId);
  console.log('🔄 [TOOL-AGENTS] Resolved server URL:', serverUrl);

  if (!serverUrl) {
    console.error(`❌ [TOOL-AGENTS] No server URL configured for agent "${agentId}"`);
    return {};
  }

  const tools = await getTool(serverUrl);
  console.log('✅ [TOOL-AGENTS] Single agent tools loaded:', Object.keys(tools));
  return tools;
};
