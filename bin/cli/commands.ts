/**
 * Slash command handlers for tawk-cli
 *
 * Claude Code-style compact inline output — no bordered panels.
 */

import pc from 'picocolors';
import type { LanguageModel } from 'ai';
import { CLISession, type CLIState } from './types';
import type { StreamRenderer } from './renderer';
import { resolveModel } from './model-provider';
import { createAgent } from './agents';
import { Usage } from '../../src/core/usage';
import { formatConfig, saveSetting, resolveSystemPrompt } from './config';
import { formatMcpStatus, loadMcpConfig, connectMcpServers, getMcpTools, addMcpServer as addMcpToFile, removeMcpServer as removeMcpFromFile } from './mcp-manager';

export interface CommandResult {
  /** If true, exit the REPL */
  exit?: boolean;
  /** If true, the command was handled (don't send to agent) */
  handled: boolean;
}

/**
 * Handle a slash command. Returns whether the command was recognized.
 */
export async function handleCommand(
  input: string,
  state: CLIState,
  setPrompt: (prompt: string) => void,
  renderer?: StreamRenderer
): Promise<CommandResult> {
  const parts = input.trim().split(/\s+/);
  const cmd = parts[0].toLowerCase();
  const arg = parts.slice(1).join(' ').trim();

  switch (cmd) {
    case '/help':
      showHelp();
      return { handled: true };

    case '/clear':
      await state.session.clear();
      process.stdout.write('\x1b[2J\x1b[H');
      console.log(pc.green('  Session cleared.'));
      state.turnCount = 0;
      return { handled: true };

    case '/agent':
      if (!arg) {
        showAgentInfo(state);
      } else {
        await switchAgent(arg, state, setPrompt);
      }
      return { handled: true };

    case '/tools':
      showTools(state);
      return { handled: true };

    case '/session':
      if (arg === 'new') {
        await newSession(state);
      } else {
        await showSessionInfo(state);
      }
      return { handled: true };

    case '/history':
      await showHistory(state);
      return { handled: true };

    case '/model':
      if (!arg) {
        showModelInfo(state);
      } else {
        await switchModel(arg, state);
      }
      return { handled: true };

    case '/usage':
    case '/cost':
      showUsage(state);
      return { handled: true };

    case '/verbose':
      state.verbose = !state.verbose;
      console.log(pc.dim(`  Verbose mode: ${state.verbose ? 'ON' : 'OFF'}`));
      return { handled: true };

    // ──── New commands ────

    case '/system':
      await handleSystemPrompt(arg, state);
      return { handled: true };

    case '/mcp':
      await handleMcp(arg, state);
      return { handled: true };

    case '/config':
      await handleConfig(arg, state);
      return { handled: true };

    case '/quit':
    case '/exit':
    case '/q':
      return { handled: true, exit: true };

    default:
      console.log(pc.dim(`  Unknown command: ${cmd}`) + pc.dim('  Type /help for commands.'));
      return { handled: true };
  }
}

// ============================================
// HELP (updated with new commands)
// ============================================

function showHelp(): void {
  console.log();
  console.log(pc.dim('  Commands:'));
  const sections: [string, [string, string][]][] = [
    ['Session', [
      ['/clear', 'Clear session history and terminal'],
      ['/session', 'Show session info'],
      ['/session new', 'Start a fresh session'],
      ['/history', 'Show last 10 messages'],
      ['/usage', 'Show cumulative token usage & cost'],
    ]],
    ['Agent & Model', [
      ['/agent', 'Show current agent info'],
      ['/agent <name>', 'Switch to a preset agent'],
      ['/model', 'Show current model'],
      ['/model <p:id>', 'Switch model (e.g. openai:gpt-4o)'],
      ['/tools', 'List available tools'],
    ]],
    ['Config', [
      ['/system', 'Show current system prompt'],
      ['/system set <text>', 'Update system prompt'],
      ['/system reset', 'Reset to preset default'],
      ['/mcp', 'List MCP servers and status'],
      ['/mcp reload', 'Reconnect all MCP servers'],
      ['/mcp add <n> <cmd>', 'Add MCP server to .mcp.json'],
      ['/mcp remove <name>', 'Remove MCP server'],
      ['/config', 'Show all settings and sources'],
      ['/config set <k> <v>', 'Save setting to local config'],
    ]],
    ['Other', [
      ['/verbose', 'Toggle verbose mode'],
      ['/help', 'Show this help'],
      ['/quit', 'Exit (or Ctrl+C)'],
    ]],
    ['Input', [
      ['\\', 'End line with \\ for multi-line continuation'],
      ['"""', 'Start/end block input mode'],
      ['!command', 'Run a shell command inline'],
    ]],
  ];

  for (const [section, cmds] of sections) {
    console.log();
    console.log(pc.bold(`  ${section}`));
    for (const [cmd, desc] of cmds) {
      console.log(`    ${pc.cyan(cmd.padEnd(22))}${pc.dim(desc)}`);
    }
  }
  console.log();
}

// ============================================
// SYSTEM PROMPT
// ============================================

async function handleSystemPrompt(arg: string, state: CLIState): Promise<void> {
  if (!arg) {
    // Show current system prompt
    const prompt = state.systemPrompt || (state.agent as any).instructions || '(no system prompt set)';
    const text = typeof prompt === 'string' ? prompt : '(dynamic function)';
    console.log();
    console.log(pc.dim('  System Prompt:'));
    // Show full prompt, indented
    for (const line of text.split('\n')) {
      console.log(pc.dim('  │ ') + line);
    }
    console.log();
    return;
  }

  const subCmd = arg.split(/\s+/)[0].toLowerCase();
  const subArg = arg.slice(subCmd.length).trim();

  if (subCmd === 'set' && subArg) {
    state.systemPrompt = subArg;
    rebuildAgent(state);
    console.log(pc.green('  System prompt updated.'));
    return;
  }

  if (subCmd === 'reset') {
    state.systemPrompt = '';
    rebuildAgent(state);
    console.log(pc.green('  System prompt reset to preset default.'));
    return;
  }

  console.log(pc.dim('  Usage: /system, /system set <text>, /system reset'));
}

// ============================================
// MCP
// ============================================

async function handleMcp(arg: string, state: CLIState): Promise<void> {
  if (!arg) {
    // Show MCP status
    console.log();
    console.log(pc.bold('  MCP Servers'));
    if (state.mcpManager) {
      console.log(formatMcpStatus(state.mcpManager));
      const toolCount = Object.keys(state.mcpTools).length;
      if (toolCount > 0) {
        console.log(pc.dim(`  ${toolCount} tools available`));
      }
    } else {
      console.log(pc.dim('  No MCP servers configured.'));
      console.log(pc.dim('  Create .mcp.json or use /mcp add <name> <command> [args...]'));
    }
    console.log();
    return;
  }

  const parts = arg.split(/\s+/);
  const subCmd = parts[0].toLowerCase();

  if (subCmd === 'reload') {
    console.log(pc.dim('  Reloading MCP servers...'));
    try {
      // Disconnect existing
      if (state.mcpManager) {
        await (state.mcpManager as any).disconnectAll?.();
      }
      const mcpConfig = loadMcpConfig();
      if (mcpConfig) {
        state.mcpManager = await connectMcpServers(mcpConfig);
        state.mcpTools = await getMcpTools(state.mcpManager);
        rebuildAgent(state);
        console.log(pc.green(`  MCP reloaded: ${Object.keys(state.mcpTools).length} tools`));
      } else {
        console.log(pc.dim('  No .mcp.json found.'));
      }
    } catch (err: any) {
      console.log(pc.red(`  MCP reload failed: ${err.message}`));
    }
    return;
  }

  if (subCmd === 'add' && parts.length >= 3) {
    const name = parts[1];
    const command = parts[2];
    const args = parts.slice(3);
    addMcpToFile(name, command, args);
    console.log(pc.green(`  Added MCP server "${name}" to .mcp.json`));
    console.log(pc.dim('  Run /mcp reload to connect.'));
    return;
  }

  if (subCmd === 'remove' && parts[1]) {
    const removed = removeMcpFromFile(parts[1]);
    if (removed) {
      console.log(pc.green(`  Removed "${parts[1]}" from .mcp.json`));
      console.log(pc.dim('  Run /mcp reload to apply.'));
    } else {
      console.log(pc.red(`  Server "${parts[1]}" not found in .mcp.json`));
    }
    return;
  }

  console.log(pc.dim('  Usage: /mcp, /mcp reload, /mcp add <name> <command> [args...], /mcp remove <name>'));
}

// ============================================
// CONFIG
// ============================================

async function handleConfig(arg: string, state: CLIState): Promise<void> {
  if (!arg) {
    console.log();
    console.log(pc.bold('  Configuration'));
    console.log(formatConfig(state.config));
    console.log();
    return;
  }

  const parts = arg.split(/\s+/);
  if (parts[0].toLowerCase() === 'set' && parts[1]) {
    const key = parts[1];
    const value = parts.slice(2).join(' ');
    const validKeys = ['model', 'agent', 'verbose', 'maxTurns', 'systemPrompt'];
    if (!validKeys.includes(key)) {
      console.log(pc.red(`  Invalid key: ${key}`) + pc.dim(`  Valid: ${validKeys.join(', ')}`));
      return;
    }
    let parsed: any = value;
    if (key === 'verbose') parsed = value === 'true';
    if (key === 'maxTurns') parsed = parseInt(value, 10) || 50;
    saveSetting(key, parsed);
    console.log(pc.green(`  Saved ${key}=${value} to .tawk/settings.local.json`));
    return;
  }

  console.log(pc.dim('  Usage: /config, /config set <key> <value>'));
}

// ============================================
// EXISTING COMMAND IMPLEMENTATIONS
// ============================================

function showAgentInfo(state: CLIState): void {
  const tools = state.agent._tools || {};
  const toolNames = Object.keys(tools);
  const subagents = (state.agent as any).subagents || [];
  console.log();
  console.log(pc.dim('  Agent: ') + pc.cyan(state.agent.name));
  console.log(pc.dim('  Preset: ') + pc.cyan(state.agentName));
  console.log(pc.dim('  Tools: ') + (toolNames.length > 0 ? toolNames.join(', ') : '(none)'));
  if (subagents.length > 0) {
    console.log(pc.dim('  Subagents: ') + subagents.map((a: any) => a.name).join(', '));
  }
  if (Object.keys(state.mcpTools).length > 0) {
    console.log(pc.dim('  MCP tools: ') + Object.keys(state.mcpTools).join(', '));
  }
  console.log();
}

async function switchAgent(
  presetName: string,
  state: CLIState,
  setPrompt: (prompt: string) => void
): Promise<void> {
  try {
    const { agent, description, toolCount } = createAgent(presetName, state.model, {
      toolWrapper: state.toolWrapper,
      mcpTools: state.mcpTools,
      systemPrompt: state.systemPrompt || undefined,
    });
    state.agent = agent;
    state.agentName = presetName;
    setPrompt(pc.bold('> '));
    await state.session.clear();
    state.turnCount = 0;
    console.log(pc.green(`  Switched to ${agent.name}`) + pc.dim(` — ${description} (${toolCount} tools)`));
  } catch (err: any) {
    console.log(pc.red(`  ${err.message}`));
  }
}

function showTools(state: CLIState): void {
  const tools = state.agent._tools || {};
  const entries = Object.entries(tools);
  if (entries.length === 0) {
    console.log(pc.dim('  No tools available.'));
    return;
  }
  console.log();
  for (const [name, t] of entries) {
    const isMcp = name in state.mcpTools;
    const prefix = isMcp ? pc.magenta('[mcp] ') : '';
    console.log(`  ${prefix}${pc.yellow(name.padEnd(24))}${pc.dim(t.description || '')}`);
  }
  console.log();
}

async function showSessionInfo(state: CLIState): Promise<void> {
  const history = await state.session.getHistory();
  console.log();
  console.log(pc.dim('  Session: ') + state.session.id);
  console.log(pc.dim('  Messages: ') + history.length);
  console.log(pc.dim('  Turns: ') + state.turnCount);
  console.log();
}

async function newSession(state: CLIState): Promise<void> {
  const { randomUUID } = await import('crypto');
  const newId = randomUUID().slice(0, 8);
  state.session = new CLISession(newId);
  state.turnCount = 0;
  state.cumulativeUsage = new Usage();
  state.totalToolCalls = 0;
  state.totalDuration = 0;
  console.log(pc.green(`  New session started: ${state.session.id}`));
}

async function showHistory(state: CLIState): Promise<void> {
  const history = await state.session.getHistory();
  const recent = history.slice(-10);

  if (recent.length === 0) {
    console.log(pc.dim('  No messages in history.'));
    return;
  }

  console.log();
  for (const msg of recent) {
    const role = msg.role;
    const content = extractContent(msg);
    const preview = content.length > 100 ? content.slice(0, 100) + '…' : content;
    const roleColor = role === 'user' ? pc.green : role === 'assistant' ? pc.blue : pc.dim;
    console.log(`  ${roleColor(role.padEnd(10))} ${preview}`);
  }
  console.log();
}

function showModelInfo(state: CLIState): void {
  console.log(pc.dim('  Model: ') + pc.cyan(state.modelId));
}

async function switchModel(modelString: string, state: CLIState): Promise<void> {
  try {
    const { model, displayId } = await resolveModel(modelString);
    state.model = model;
    state.modelId = displayId;
    rebuildAgent(state);
    const toolCount = Object.keys(state.agent._tools || {}).length;
    console.log(pc.green(`  Model switched to ${displayId}`) + pc.dim(` — ${state.agent.name} (${toolCount} tools)`));
  } catch (err: any) {
    console.log(pc.red(`  ${err.message}`));
  }
}

function showUsage(state: CLIState): void {
  const u = state.cumulativeUsage;
  const cost = u.estimateCost({ model: state.modelId });
  console.log();
  console.log(pc.dim('  Input tokens:  ') + u.inputTokens.toLocaleString());
  console.log(pc.dim('  Output tokens: ') + u.outputTokens.toLocaleString());
  console.log(pc.dim('  Total tokens:  ') + u.totalTokens.toLocaleString());
  console.log(pc.dim('  Requests:      ') + u.requests);
  console.log(pc.dim('  Tool calls:    ') + state.totalToolCalls);
  console.log(pc.dim('  Duration:      ') + (state.totalDuration / 1000).toFixed(1) + 's');
  console.log(pc.dim('  Est. cost:     ') + '$' + cost.toFixed(4));
  console.log();
}

// ============================================
// HELPERS
// ============================================

/**
 * Rebuild the agent using current state (model, tools, system prompt, MCP).
 * Used after /model, /system, /mcp reload.
 */
function rebuildAgent(state: CLIState): void {
  try {
    const { agent } = createAgent(state.agentName, state.model, {
      toolWrapper: state.toolWrapper,
      mcpTools: state.mcpTools,
      systemPrompt: state.systemPrompt || undefined,
    });
    state.agent = agent;
  } catch (err: any) {
    console.log(pc.red(`  Agent rebuild failed: ${err.message}`));
  }
}

function extractContent(msg: any): string {
  if (typeof msg.content === 'string') return msg.content;
  if (Array.isArray(msg.content)) {
    return msg.content
      .map((part: any) => {
        if (typeof part === 'string') return part;
        if (part.type === 'text') return part.text;
        if (part.type === 'tool-call') return `[tool: ${part.toolName}]`;
        return '[…]';
      })
      .join(' ');
  }
  return JSON.stringify(msg.content).slice(0, 100);
}
