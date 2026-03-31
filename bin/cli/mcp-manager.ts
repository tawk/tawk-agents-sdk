/**
 * MCP server lifecycle for tawk-cli
 *
 * Reads .mcp.json (Claude Code compatible format) and uses the SDK's
 * MCPServerManager to connect MCP servers and inject their tools.
 */

import * as fs from 'fs';
import * as path from 'path';
import pc from 'picocolors';
import { MCPServerManager } from '../../src/mcp/enhanced';
import type { MCPServerConfig, CoreTool } from '../../src';

// ============================================
// TYPES
// ============================================

/** .mcp.json format (Claude Code compatible) */
export interface McpJsonConfig {
  mcpServers: Record<string, {
    command?: string;
    args?: string[];
    url?: string;
    env?: Record<string, string>;
  }>;
}

// ============================================
// LOADING
// ============================================

const MCP_CONFIG_FILE = '.mcp.json';

/**
 * Load MCP configuration from .mcp.json in the project root.
 * Returns null if the file doesn't exist.
 */
export function loadMcpConfig(configPath?: string): McpJsonConfig | null {
  const filePath = configPath || path.join(process.cwd(), MCP_CONFIG_FILE);
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!parsed.mcpServers || typeof parsed.mcpServers !== 'object') return null;
    return parsed as McpJsonConfig;
  } catch {
    return null;
  }
}

/**
 * Interpolate environment variables in a string.
 * Replaces ${VAR_NAME} with process.env.VAR_NAME.
 */
function interpolateEnv(value: string): string {
  return value.replace(/\$\{([^}]+)\}/g, (_, name) => process.env[name] || '');
}

/**
 * Convert .mcp.json entry to SDK MCPServerConfig.
 */
function toMcpServerConfig(
  name: string,
  entry: McpJsonConfig['mcpServers'][string]
): MCPServerConfig {
  const env: Record<string, string> = {};
  if (entry.env) {
    for (const [key, value] of Object.entries(entry.env)) {
      env[key] = interpolateEnv(value);
    }
  }

  if (entry.url) {
    return { name, transport: 'http', url: entry.url, env };
  }

  return {
    name,
    transport: 'stdio',
    command: entry.command,
    args: entry.args,
    env,
  };
}

// ============================================
// CONNECTION
// ============================================

/**
 * Connect all MCP servers from config.
 * Uses Promise.allSettled — failed servers warn but don't block.
 */
export async function connectMcpServers(config: McpJsonConfig): Promise<MCPServerManager> {
  const manager = new MCPServerManager();
  const entries = Object.entries(config.mcpServers);

  if (entries.length === 0) return manager;

  const results = await Promise.allSettled(
    entries.map(async ([name, entry]) => {
      const serverConfig = toMcpServerConfig(name, entry);
      await manager.registerServer(serverConfig);
      return name;
    })
  );

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const name = entries[i][0];
    if (result.status === 'rejected') {
      process.stderr.write(
        pc.yellow(`  ⚠ MCP server "${name}" failed to connect: ${result.reason?.message || result.reason}\n`)
      );
    }
  }

  return manager;
}

/**
 * Get all tools from connected MCP servers.
 */
export async function getMcpTools(manager: MCPServerManager): Promise<Record<string, CoreTool>> {
  try {
    return await manager.getAllTools();
  } catch {
    return {};
  }
}

// ============================================
// MANAGEMENT
// ============================================

/**
 * Add an MCP server to .mcp.json.
 */
export function addMcpServer(
  name: string,
  command: string,
  args: string[] = [],
  env: Record<string, string> = {}
): void {
  const filePath = path.join(process.cwd(), MCP_CONFIG_FILE);
  const existing = loadMcpConfig() || { mcpServers: {} };
  existing.mcpServers[name] = { command, args, env };
  fs.writeFileSync(filePath, JSON.stringify(existing, null, 2) + '\n', 'utf-8');
}

/**
 * Remove an MCP server from .mcp.json.
 */
export function removeMcpServer(name: string): boolean {
  const filePath = path.join(process.cwd(), MCP_CONFIG_FILE);
  const existing = loadMcpConfig();
  if (!existing || !existing.mcpServers[name]) return false;
  delete existing.mcpServers[name];
  fs.writeFileSync(filePath, JSON.stringify(existing, null, 2) + '\n', 'utf-8');
  return true;
}

/**
 * Format MCP server status for display.
 */
export function formatMcpStatus(manager: MCPServerManager): string {
  const servers = (manager as any).servers as Map<string, any>;
  if (!servers || servers.size === 0) {
    return pc.dim('  No MCP servers connected');
  }

  const lines: string[] = [];
  for (const [name, server] of servers) {
    const connected = server.isConnected?.() ?? true;
    const icon = connected ? pc.green('●') : pc.red('●');
    const transport = server.config?.transport || 'unknown';
    lines.push(`  ${icon} ${pc.bold(name)} ${pc.dim(`(${transport})`)}`);
  }
  return lines.join('\n');
}
