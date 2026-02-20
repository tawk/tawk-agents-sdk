/**
 * Enhanced Model Context Protocol (MCP) Support
 * 
 * Provides native agent-level MCP integration with:
 * - Automatic tool fetching
 * - Lifecycle management
 * - Connection pooling
 * - Tool caching
 * - HTTP and stdio transports
 */

import { z } from 'zod';
import { spawn, type ChildProcess } from 'child_process';
import { safeFetch } from '../helpers/safe-fetch';

const MAX_BUFFER_SIZE = 10 * 1024 * 1024; // 10MB max buffer for MCP stdout

// CoreTool type (avoiding circular dependency)
type CoreTool = {
  description?: string;
  inputSchema?: z.ZodSchema<any>;
  execute: (args: any, context?: any) => Promise<any> | any;
  enabled?: boolean | ((context: any) => boolean | Promise<boolean>);
};

// ============================================
// TYPES
// ============================================

export interface MCPServerConfig {
  /**
   * Unique name for this MCP server
   */
  name: string;

  /**
   * Transport type
   */
  transport: 'stdio' | 'http';

  /**
   * For stdio transport: command to spawn
   */
  command?: string;

  /**
   * For stdio transport: command arguments
   */
  args?: string[];

  /**
   * For HTTP transport: server URL
   */
  url?: string;

  /**
   * Authentication config
   */
  auth?: {
    type: 'bearer' | 'basic';
    token?: string;
    username?: string;
    password?: string;
  };

  /**
   * Environment variables
   */
  env?: Record<string, string>;

  /**
   * Filter specific tools (if not set, all tools are available)
   */
  tools?: string[];

  /**
   * Capabilities to request
   */
  capabilities?: ('tools' | 'resources' | 'prompts')[];

  /**
   * Auto-connect on registration
   */
  autoConnect?: boolean;

  /**
   * Auto-refresh tool list interval (ms)
   */
  autoRefreshInterval?: number;

  /**
   * Connection timeout (ms)
   */
  connectionTimeout?: number;
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: any;
}

export interface MCPResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface MCPPrompt {
  name: string;
  description?: string;
  arguments?: any[];
}

// ============================================
// ENHANCED MCP SERVER
// ============================================

export class EnhancedMCPServer {
  private process?: ChildProcess;
  private tools: MCPTool[] = [];
  private resources: MCPResource[] = [];
  private prompts: MCPPrompt[] = [];
  private messageId = 0;
  private pendingRequests = new Map<
    number,
    { resolve: (value: any) => void; reject: (error: Error) => void; timeout: NodeJS.Timeout }
  >();
  private connected = false;
  private refreshInterval?: NodeJS.Timeout;
  private toolCache?: Map<string, CoreTool>;
  private cacheTimestamp?: number;
  private readonly CACHE_TTL = 60000; // 1 minute

  constructor(private config: MCPServerConfig) {}

  /**
   * Connect to the MCP server
   */
  async connect(): Promise<void> {
    if (this.connected) {
      return;
    }

    if (this.config.transport === 'stdio') {
      await this.connectStdio();
    } else if (this.config.transport === 'http') {
      await this.connectHttp();
    } else {
      throw new Error(`Unknown transport: ${this.config.transport}`);
    }

    // Start auto-refresh if configured
    if (this.config.autoRefreshInterval) {
      this.startAutoRefresh(this.config.autoRefreshInterval);
    }

    this.connected = true;
  }

  /**
   * Disconnect from the MCP server
   */
  async disconnect(): Promise<void> {
    if (!this.connected) {
      return;
    }

    // Stop auto-refresh
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = undefined;
    }

    // Cancel pending requests
    for (const [_id, pending] of this.pendingRequests.entries()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Server disconnected'));
    }
    this.pendingRequests.clear();

    // Kill process if stdio
    if (this.process) {
      this.process.kill();
      this.process = undefined;
    }

    this.connected = false;
    this.toolCache = undefined;
    this.cacheTimestamp = undefined;
  }

  /**
   * Check if server is connected
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Get tools from this server
   */
  async getTools(): Promise<MCPTool[]> {
    if (!this.connected) {
      await this.connect();
    }

    // Apply filter if configured
    if (this.config.tools && this.config.tools.length > 0) {
      return this.tools.filter((t) => this.config.tools!.includes(t.name));
    }

    return this.tools;
  }

  /**
   * Get tools as CoreTool format (cached)
   */
  async getCoreTools(): Promise<CoreTool[]> {
    // Check cache
    if (
      this.toolCache &&
      this.cacheTimestamp &&
      Date.now() - this.cacheTimestamp < this.CACHE_TTL
    ) {
      return Array.from(this.toolCache.values());
    }

    // Fetch and convert
    const mcpTools = await this.getTools();
    const coreTools: CoreTool[] = [];

    for (const mcpTool of mcpTools) {
      const coreTool: CoreTool = {
        description: mcpTool.description,
        inputSchema: this.convertInputSchemaToZod(mcpTool.inputSchema),
        execute: async (args: any) => {
          return await this.executeTool(mcpTool.name, args);
        },
      };
      coreTools.push(coreTool);
    }

    // Update cache
    this.toolCache = new Map(coreTools.map((t, i) => [mcpTools[i].name, t]));
    this.cacheTimestamp = Date.now();

    return coreTools;
  }

  /**
   * Refresh tool list
   */
  async refreshTools(): Promise<void> {
    if (!this.connected) {
      return;
    }

    const response = await this.sendRequest('tools/list', {});
    this.tools = response.tools || [];

    // Invalidate cache
    this.toolCache = undefined;
    this.cacheTimestamp = undefined;
  }

  /**
   * Execute a tool
   */
  async executeTool(toolName: string, args: any): Promise<any> {
    if (!this.connected) {
      await this.connect();
    }

    const response = await this.sendRequest('tools/call', {
      name: toolName,
      arguments: args,
    });

    return response.result;
  }

  /**
   * Get resources (if supported)
   */
  async getResources(): Promise<MCPResource[]> {
    if (!this.connected) {
      await this.connect();
    }

    try {
      const response = await this.sendRequest('resources/list', {});
      this.resources = response.resources || [];
      return this.resources;
    } catch (_error) {
      // Resources might not be supported
      return [];
    }
  }

  /**
   * Get prompts (if supported)
   */
  async getPrompts(): Promise<MCPPrompt[]> {
    if (!this.connected) {
      await this.connect();
    }

    try {
      const response = await this.sendRequest('prompts/list', {});
      this.prompts = response.prompts || [];
      return this.prompts;
    } catch (_error) {
      // Prompts might not be supported
      return [];
    }
  }

  /**
   * Start auto-refresh of tools
   */
  private startAutoRefresh(interval: number): void {
    this.refreshInterval = setInterval(() => {
      this.refreshTools().catch((error) => {
        console.error(`MCP auto-refresh error (${this.config.name}):`, error);
      });
    }, interval);
  }

  /**
   * Validate command for security before spawning
   */
  private validateCommand(): void {
    const command = this.config.command;
    if (!command) throw new Error('MCP command is required for stdio transport');

    // Allowlist approach: only permit known MCP server commands
    const allowedCommands = [
      'node', 'npx', 'python', 'python3', 'uvx', 'deno',
      'mcp-server', 'mcp-proxy',
    ];
    const basename = command.split('/').pop() || command;
    if (!allowedCommands.some(allowed => basename === allowed || basename.startsWith('mcp-'))) {
      throw new Error(`MCP command not in allowlist: ${basename}. Allowed: ${allowedCommands.join(', ')}`);
    }
  }

  /**
   * Connect via stdio
   */
  private async connectStdio(): Promise<void> {
    if (!this.config.command) {
      throw new Error('command is required for stdio transport');
    }

    this.validateCommand();

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Connection timeout (${this.config.connectionTimeout || 10000}ms)`));
      }, this.config.connectionTimeout || 10000);

      // Only pass minimal env vars + explicitly configured ones (ADR-004)
      // Prevents leaking secrets from process.env into MCP subprocesses
      const safeEnv: Record<string, string> = {
        PATH: process.env.PATH || '',
        HOME: process.env.HOME || '',
        NODE_ENV: process.env.NODE_ENV || 'production',
        ...this.config.env,
      };

      this.process = spawn(this.config.command!, this.config.args || [], {
        env: safeEnv,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      if (!this.process.stdin || !this.process.stdout) {
        clearTimeout(timeout);
        reject(new Error('Failed to create MCP server process'));
        return;
      }

      // Handle stdout
      let buffer = '';
      this.process.stdout.on('data', (data) => {
        buffer += data.toString();
        if (buffer.length > MAX_BUFFER_SIZE) {
          this.process?.kill();
          // Emit error instead of throwing — throw inside event handler crashes the process (ADR-004)
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

      // Handle errors
      this.process.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });

      // Initialize - list tools
      this.sendRequest('tools/list', {})
        .then((response) => {
          this.tools = response.tools || [];
          clearTimeout(timeout);
          resolve();
        })
        .catch((error) => {
          clearTimeout(timeout);
          reject(error);
        });
    });
  }

  /**
   * Connect via HTTP
   */
  private async connectHttp(): Promise<void> {
    if (!this.config.url) {
      throw new Error('url is required for http transport');
    }

    // Test connection and list tools
    const response = await this.httpRequest('tools/list', {});
    this.tools = response.tools || [];
  }

  /**
   * Send a request to the MCP server
   */
  private async sendRequest(method: string, params: any): Promise<any> {
    if (this.config.transport === 'http') {
      return this.httpRequest(method, params);
    } else {
      return this.stdioRequest(method, params);
    }
  }

  /**
   * Send a request via stdio
   */
  private async stdioRequest(method: string, params: any): Promise<any> {
    const id = ++this.messageId;
    const message = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`MCP request timeout: ${method}`));
        }
      }, this.config.connectionTimeout || 30000);

      this.pendingRequests.set(id, { resolve, reject, timeout });

      if (this.process && this.process.stdin) {
        this.process.stdin.write(JSON.stringify(message) + '\n');
      } else {
        clearTimeout(timeout);
        reject(new Error('MCP server not running'));
      }
    });
  }

  /**
   * Send a request via HTTP
   */
  private async httpRequest(method: string, params: any): Promise<any> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Add authentication
    if (this.config.auth) {
      if (this.config.auth.type === 'bearer' && this.config.auth.token) {
        headers['Authorization'] = `Bearer ${this.config.auth.token}`;
      } else if (
        this.config.auth.type === 'basic' &&
        this.config.auth.username &&
        this.config.auth.password
      ) {
        const credentials = Buffer.from(
          `${this.config.auth.username}:${this.config.auth.password}`
        ).toString('base64');
        headers['Authorization'] = `Basic ${credentials}`;
      }
    }

    const response = await safeFetch(this.config.url!, {
      timeoutMs: 30000,
      method: 'POST',
      headers,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: ++this.messageId,
        method,
        params,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data: any = await response.json();

    if (data.error) {
      throw new Error(data.error.message || 'MCP error');
    }

    return data.result;
  }

  /**
   * Handle a message from stdio
   */
  private handleMessage(message: any): void {
    if (message.id && this.pendingRequests.has(message.id)) {
      const pending = this.pendingRequests.get(message.id)!;
      this.pendingRequests.delete(message.id);
      clearTimeout(pending.timeout);

      if (message.error) {
        pending.reject(new Error(message.error.message || 'MCP error'));
      } else {
        pending.resolve(message.result);
      }
    }
  }

  /**
   * Convert JSON Schema to Zod schema
   */
  private convertInputSchemaToZod(schema: any): z.ZodSchema {
    if (!schema || !schema.properties) {
      return z.object({});
    }

    const shape: Record<string, z.ZodTypeAny> = {};

    for (const [key, value] of Object.entries(schema.properties as any)) {
      const prop = value as any;
      let zodType: z.ZodTypeAny;

      if (prop.type === 'string') {
        zodType = z.string();
      } else if (prop.type === 'number' || prop.type === 'integer') {
        zodType = z.number();
      } else if (prop.type === 'boolean') {
        zodType = z.boolean();
      } else if (prop.type === 'object') {
        zodType = prop.properties
          ? this.convertInputSchemaToZod(prop)
          : z.object({});
      } else if (prop.type === 'array') {
        zodType = z.array(z.any());
      } else {
        zodType = z.any();
      }

      if (prop.description) {
        zodType = zodType.describe(prop.description);
      }

      if (prop.default !== undefined) {
        zodType = zodType.default(prop.default);
      }

      if (!schema.required?.includes(key)) {
        zodType = zodType.optional();
      }

      shape[key] = zodType;
    }

    return z.object(shape);
  }
}

// ============================================
// ENHANCED MCP SERVER MANAGER
// ============================================

export class EnhancedMCPServerManager {
  private servers: Map<string, EnhancedMCPServer> = new Map();

  /**
   * Register an MCP server
   */
  async registerServer(config: MCPServerConfig): Promise<void> {
    if (this.servers.has(config.name)) {
      throw new Error(`MCP server already registered: ${config.name}`);
    }

    const server = new EnhancedMCPServer(config);

    if (config.autoConnect !== false) {
      await server.connect();
    }

    this.servers.set(config.name, server);
  }

  /**
   * Get a registered server
   */
  getServer(name: string): EnhancedMCPServer | undefined {
    return this.servers.get(name);
  }

  /**
   * Get all tools from all servers
   */
  async getAllTools(): Promise<Record<string, CoreTool>> {
    const tools: Record<string, CoreTool> = {};

    for (const [serverName, server] of this.servers) {
      const serverTools = await server.getCoreTools();
      const mcpTools = await server.getTools();

      for (let i = 0; i < serverTools.length; i++) {
        const toolName = `${serverName}_${mcpTools[i].name}`;
        tools[toolName] = serverTools[i];
      }
    }

    return tools;
  }

  /**
   * Get tools from a specific server
   */
  async getServerTools(serverName: string): Promise<Record<string, CoreTool>> {
    const server = this.servers.get(serverName);
    if (!server) {
      throw new Error(`MCP server not found: ${serverName}`);
    }

    const tools: Record<string, CoreTool> = {};
    const serverTools = await server.getCoreTools();
    const mcpTools = await server.getTools();

    for (let i = 0; i < serverTools.length; i++) {
      const toolName = `${serverName}_${mcpTools[i].name}`;
      tools[toolName] = serverTools[i];
    }

    return tools;
  }

  /**
   * Refresh all tool lists
   */
  async refreshAll(): Promise<void> {
    await Promise.all(
      Array.from(this.servers.values()).map((server) => server.refreshTools())
    );
  }

  /**
   * Shutdown all servers
   */
  async shutdown(): Promise<void> {
    await Promise.all(
      Array.from(this.servers.values()).map((server) => server.disconnect())
    );
    this.servers.clear();
  }

  /**
   * Get server count
   */
  getServerCount(): number {
    return this.servers.size;
  }

  /**
   * Get server names
   */
  getServerNames(): string[] {
    return Array.from(this.servers.keys());
  }
}

// ============================================
// GLOBAL MANAGER
// ============================================

let globalManager: EnhancedMCPServerManager | null = null;

export function getGlobalMCPManager(): EnhancedMCPServerManager {
  if (!globalManager) {
    globalManager = new EnhancedMCPServerManager();
  }
  return globalManager;
}

export async function registerMCPServer(config: MCPServerConfig): Promise<void> {
  const manager = getGlobalMCPManager();
  await manager.registerServer(config);
}

export async function getMCPTools(): Promise<Record<string, CoreTool>> {
  const manager = getGlobalMCPManager();
  return await manager.getAllTools();
}

export async function shutdownMCPServers(): Promise<void> {
  if (globalManager) {
    await globalManager.shutdown();
    globalManager = null;
  }
}

