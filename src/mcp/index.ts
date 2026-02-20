/**
 * Model Context Protocol (MCP) Support
 * 
 * Allows agents to use MCP servers for additional tools and context
 */

import { z } from 'zod';
import { spawn, type ChildProcess } from 'child_process';
import type { MCPServerConfig, MCPTool, ToolDefinition } from '../types/types';

const MAX_BUFFER_SIZE = 10 * 1024 * 1024; // 10MB max buffer for MCP stdout

// ============================================
// MCP SERVER MANAGER
// ============================================

/**
 * Manager for Model Context Protocol (MCP) servers.
 * Handles registration, tool discovery, and server lifecycle.
 * 
 * @example
 * ```typescript
 * const manager = new MCPServerManager();
 * await manager.registerServer({
 *   name: 'filesystem',
 *   command: 'npx',
 *   args: ['-y', '@modelcontextprotocol/server-filesystem']
 * });
 * 
 * const tools = await manager.getTools();
 * ```
 */
export class MCPServerManager {
  private servers: Map<string, MCPServer> = new Map();

  /**
   * Register and start an MCP server.
   * 
   * @param {MCPServerConfig} config - MCP server configuration
   * @returns {Promise<void>}
   * @throws {Error} If server fails to start
   */
  async registerServer(config: MCPServerConfig): Promise<void> {
    const server = new MCPServer(config);
    await server.start();
    this.servers.set(config.name, server);
  }

  /**
   * Get all tools from all registered MCP servers.
   * Tool names are prefixed with server name (e.g., 'filesystem_read_file').
   * 
   * @returns {Promise<Record<string, ToolDefinition>>} Dictionary of tool definitions
   */
  async getTools(): Promise<Record<string, ToolDefinition>> {
    const tools: Record<string, ToolDefinition> = {};

    for (const [serverName, server] of this.servers) {
      const serverTools = await server.getTools();
      
      for (const mcpTool of serverTools) {
        const toolName = `${serverName}_${mcpTool.name}`;
        
        tools[toolName] = {
          description: mcpTool.description,
          parameters: this.convertInputSchemaToZod(mcpTool.inputSchema),
          execute: async (args: any) => {
            return await server.executeTool(mcpTool.name, args);
          },
          mcpServer: serverName,
        };
      }
    }

    return tools;
  }

  /**
   * Get tools from a specific MCP server.
   * 
   * @param {string} serverName - Name of the registered server
   * @returns {Promise<Record<string, ToolDefinition>>} Dictionary of tool definitions
   * @throws {Error} If server is not found
   */
  async getServerTools(serverName: string): Promise<Record<string, ToolDefinition>> {
    const server = this.servers.get(serverName);
    if (!server) {
      throw new Error(`MCP server not found: ${serverName}`);
    }

    const tools: Record<string, ToolDefinition> = {};
    const serverTools = await server.getTools();

    for (const mcpTool of serverTools) {
      const toolName = `${serverName}_${mcpTool.name}`;
      
      tools[toolName] = {
        description: mcpTool.description,
        parameters: this.convertInputSchemaToZod(mcpTool.inputSchema),
        execute: async (args: any) => {
          return await server.executeTool(mcpTool.name, args);
        },
        mcpServer: serverName,
      };
    }

    return tools;
  }

  /**
   * Shutdown all registered MCP servers and clean up resources.
   * 
   * @returns {Promise<void>}
   */
  async shutdown(): Promise<void> {
    for (const server of this.servers.values()) {
      await server.stop();
    }
    this.servers.clear();
  }

  /**
   * Convert JSON Schema to Zod schema (simplified)
   */
  private convertInputSchemaToZod(schema: any): z.ZodSchema {
    if (!schema || !schema.properties) {
      return z.object({});
    }

    const shape: Record<string, z.ZodTypeAny> = {};

    for (const [key, value] of Object.entries(schema.properties as any)) {
      const prop = value as any;
      if (prop.type === 'string') {
        shape[key] = z.string();
      } else if (prop.type === 'number') {
        shape[key] = z.number();
      } else if (prop.type === 'boolean') {
        shape[key] = z.boolean();
      } else if (prop.type === 'object') {
        shape[key] = z.object({});
      } else if (prop.type === 'array') {
        shape[key] = z.array(z.any());
      } else {
        shape[key] = z.any();
      }

      if (prop.description) {
        shape[key] = shape[key].describe(prop.description);
      }

      if (!schema.required?.includes(key)) {
        shape[key] = shape[key].optional();
      }
    }

    return z.object(shape);
  }
}

// ============================================
// MCP SERVER (Internal)
// ============================================

class MCPServer {
  private process?: ChildProcess;
  private tools: MCPTool[] = [];
  private messageId = 0;
  private pendingRequests = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void }>();

  constructor(private config: MCPServerConfig) {}

  private validateCommand(): void {
    const command = this.config.command;
    if (!command) throw new Error('MCP command is required for stdio transport');

    // Block obviously dangerous commands
    const blockedCommands = ['rm', 'mkfs', 'dd', 'shutdown', 'reboot', 'kill', 'killall'];
    const basename = command.split('/').pop() || command;
    if (blockedCommands.includes(basename)) {
      throw new Error(`MCP command blocked for security: ${basename}`);
    }
  }

  async start(): Promise<void> {
    this.validateCommand();

    return new Promise((resolve, reject) => {
      // Only pass explicitly configured env vars + minimal required vars (PATH, HOME, NODE_ENV)
      // to avoid leaking secrets (API keys, DB credentials, etc.) to child processes
      const safeEnv: Record<string, string> = {};
      if (process.env.PATH) safeEnv.PATH = process.env.PATH;
      if (process.env.HOME) safeEnv.HOME = process.env.HOME;
      if (process.env.NODE_ENV) safeEnv.NODE_ENV = process.env.NODE_ENV;
      if (process.env.SHELL) safeEnv.SHELL = process.env.SHELL;

      this.process = spawn(this.config.command, this.config.args || [], {
        env: { ...safeEnv, ...this.config.env },
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      if (!this.process.stdin || !this.process.stdout) {
        reject(new Error('Failed to create MCP server process'));
        return;
      }

      // Handle stdout (responses from MCP server)
      let buffer = '';
      this.process.stdout.on('data', (data) => {
        buffer += data.toString();
        if (buffer.length > MAX_BUFFER_SIZE) {
          this.process?.kill();
          // Emit error instead of throwing — throwing inside event handler crashes the process
          this.process?.emit('error', new Error(`MCP server stdout buffer exceeded ${MAX_BUFFER_SIZE} bytes`));
          buffer = '';
          return;
        }
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim()) {
            try {
              const message = JSON.parse(line);
              this.handleMessage(message);
            } catch (error) {
              console.error('Failed to parse MCP message:', error);
            }
          }
        }
      });

      this.process.on('error', (error) => {
        reject(error);
      });

      // Initialize - list tools
      this.sendRequest('tools/list', {}).then((response) => {
        this.tools = response.tools || [];
        resolve();
      }).catch(reject);
    });
  }

  async stop(): Promise<void> {
    if (this.process) {
      this.process.kill();
      this.process = undefined;
    }
  }

  async getTools(): Promise<MCPTool[]> {
    // Filter by config if specified
    if (this.config.tools && this.config.tools.length > 0) {
      return this.tools.filter(t => this.config.tools!.includes(t.name));
    }
    return this.tools;
  }

  async executeTool(toolName: string, args: any): Promise<any> {
    const response = await this.sendRequest('tools/call', {
      name: toolName,
      arguments: args,
    });

    return response.result;
  }

  private async sendRequest(method: string, params: any): Promise<any> {
    const id = ++this.messageId;
    const message = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });

      if (this.process && this.process.stdin) {
        this.process.stdin.write(JSON.stringify(message) + '\n');
      } else {
        reject(new Error('MCP server not running'));
      }

      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`MCP request timeout: ${method}`));
        }
      }, 30000);
    });
  }

  private handleMessage(message: any): void {
    if (message.id && this.pendingRequests.has(message.id)) {
      const pending = this.pendingRequests.get(message.id)!;
      this.pendingRequests.delete(message.id);

      if (message.error) {
        pending.reject(new Error(message.error.message || 'MCP error'));
      } else {
        pending.resolve(message.result);
      }
    }
  }
}

// ============================================
// GLOBAL MCP MANAGER
// ============================================

let globalMCPManager: MCPServerManager | null = null;

/**
 * Get or create the global MCP server manager instance.
 * 
 * @returns {MCPServerManager} Global MCP server manager
 */
export function getGlobalMCPManager(): MCPServerManager {
  if (!globalMCPManager) {
    globalMCPManager = new MCPServerManager();
  }
  return globalMCPManager;
}

/**
 * Register an MCP server using the global manager.
 * 
 * @param {MCPServerConfig} config - MCP server configuration
 * @returns {Promise<void>}
 * 
 * @example
 * ```typescript
 * await registerMCPServer({
 *   name: 'filesystem',
 *   command: 'npx',
 *   args: ['-y', '@modelcontextprotocol/server-filesystem']
 * });
 * ```
 */
export async function registerMCPServer(config: MCPServerConfig): Promise<void> {
  const manager = getGlobalMCPManager();
  await manager.registerServer(config);
}

/**
 * Get all tools from all registered MCP servers.
 * 
 * @returns {Promise<Record<string, ToolDefinition>>} Dictionary of tool definitions
 * 
 * @example
 * ```typescript
 * const tools = await getMCPTools();
 * const agent = new Agent({
 *   tools: { ...tools }
 * });
 * ```
 */
export async function getMCPTools(): Promise<Record<string, ToolDefinition>> {
  const manager = getGlobalMCPManager();
  return await manager.getTools();
}

/**
 * Shutdown all registered MCP servers.
 * 
 * @returns {Promise<void>}
 */
export async function shutdownMCPServers(): Promise<void> {
  if (globalMCPManager) {
    await globalMCPManager.shutdown();
    globalMCPManager = null;
  }
}

