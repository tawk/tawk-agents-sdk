/**
 * Slash command handlers for tawk-cli
 */

import pc from 'picocolors';
import type { LanguageModel } from 'ai';
import type { CLIState } from './types';
import { resolveModel } from './model-provider';
import { createAgent, getPresetInfo } from './agents';
import { Usage } from '../../src/core/usage';

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
  setPrompt: (prompt: string) => void
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
      process.stdout.write('\x1b[2J\x1b[H'); // Clear terminal
      console.log(pc.green('Session cleared.'));
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
      showUsage(state);
      return { handled: true };

    case '/verbose':
      state.verbose = !state.verbose;
      console.log(pc.dim(`Verbose mode: ${state.verbose ? 'ON' : 'OFF'}`));
      return { handled: true };

    case '/quit':
    case '/exit':
    case '/q':
      return { handled: true, exit: true };

    default:
      console.log(pc.red(`Unknown command: ${cmd}`) + pc.dim('  Type /help for available commands.'));
      return { handled: true };
  }
}

// ============================================
// COMMAND IMPLEMENTATIONS
// ============================================

function showHelp(): void {
  console.log(`
${pc.bold('Commands:')}

  ${pc.cyan('/help')}             Show this help message
  ${pc.cyan('/clear')}            Clear session history and terminal
  ${pc.cyan('/agent')}            Show current agent info
  ${pc.cyan('/agent <name>')}     Switch to a preset agent (${getPresetInfo().map(p => p.name).join(', ')})
  ${pc.cyan('/tools')}            List available tools
  ${pc.cyan('/session')}          Show session info
  ${pc.cyan('/session new')}      Start a fresh session
  ${pc.cyan('/history')}          Show last 10 messages
  ${pc.cyan('/model')}            Show current model
  ${pc.cyan('/model <p:id>')}     Switch model (e.g. openai:gpt-4o, groq:llama-3.3-70b-versatile)
  ${pc.cyan('/usage')}            Show cumulative token usage
  ${pc.cyan('/verbose')}          Toggle verbose mode
  ${pc.cyan('/quit')}             Exit
`);
}

function showAgentInfo(state: CLIState): void {
  const tools = state.agent._tools || {};
  const toolNames = Object.keys(tools);
  const subagents = (state.agent as any).subagents || [];
  console.log(`
${pc.bold('Agent:')} ${pc.cyan(state.agent.name)}
${pc.bold('Tools:')} ${toolNames.length > 0 ? toolNames.join(', ') : '(none)'}
${subagents.length > 0 ? `${pc.bold('Subagents:')} ${subagents.map((a: any) => a.name).join(', ')}` : ''}`.trim()
  );
  console.log();
}

async function switchAgent(
  presetName: string,
  state: CLIState,
  setPrompt: (prompt: string) => void
): Promise<void> {
  try {
    const model = state.agent._model;
    const { agent, description, toolCount } = createAgent(presetName, model as LanguageModel);
    state.agent = agent;
    state.agentName = presetName;
    setPrompt(`${pc.cyan(pc.bold(agent.name))} > `);
    // Clear session for clean agent context
    await state.session.clear();
    state.turnCount = 0;
    console.log(
      pc.green(`Switched to ${pc.bold(agent.name)}`) +
      pc.dim(` — ${description} (${toolCount} tools)`)
    );
  } catch (err: any) {
    console.log(pc.red(err.message));
  }
}

function showTools(state: CLIState): void {
  const tools = state.agent._tools || {};
  const entries = Object.entries(tools);
  if (entries.length === 0) {
    console.log(pc.dim('  No tools available.'));
    return;
  }
  console.log(pc.bold('\nTools:'));
  for (const [name, t] of entries) {
    console.log(`  ${pc.yellow(name.padEnd(16))} ${pc.dim(t.description)}`);
  }
  console.log();
}

async function showSessionInfo(state: CLIState): void {
  const history = await state.session.getHistory();
  console.log(`
${pc.bold('Session:')} ${pc.cyan(state.session.id)}
${pc.bold('Messages:')} ${history.length}
${pc.bold('Turns:')} ${state.turnCount}
`);
}

async function newSession(state: CLIState): void {
  await state.session.clear();
  state.turnCount = 0;
  state.cumulativeUsage = new Usage();
  state.totalToolCalls = 0;
  state.totalDuration = 0;
  console.log(pc.green(`New session started: ${pc.bold(state.session.id)}`));
}

async function showHistory(state: CLIState): void {
  const history = await state.session.getHistory();
  const recent = history.slice(-10);

  if (recent.length === 0) {
    console.log(pc.dim('  No messages in history.'));
    return;
  }

  console.log(pc.bold('\nRecent messages:'));
  for (const msg of recent) {
    const role = msg.role;
    const content = extractContent(msg);
    const preview = content.length > 100 ? content.slice(0, 100) + '...' : content;
    const roleColor = role === 'user' ? pc.green : role === 'assistant' ? pc.blue : pc.dim;
    console.log(`  ${roleColor(role.padEnd(10))} ${preview}`);
  }
  console.log();
}

function showModelInfo(state: CLIState): void {
  console.log(`${pc.bold('Model:')} ${pc.cyan(state.modelId)}`);
}

async function switchModel(modelString: string, state: CLIState): Promise<void> {
  try {
    const { model, displayId } = await resolveModel(modelString);
    // Recreate agent with new model
    const { agent, description, toolCount } = createAgent(state.agentName, model);
    state.agent = agent;
    state.modelId = displayId;
    console.log(
      pc.green(`Model switched to ${pc.bold(displayId)}`) +
      pc.dim(` — agent: ${agent.name} (${toolCount} tools)`)
    );
  } catch (err: any) {
    console.log(pc.red(err.message));
  }
}

function showUsage(state: CLIState): void {
  const u = state.cumulativeUsage;
  const cost = u.estimateCost({ model: state.modelId });
  console.log(`
${pc.bold('Cumulative Usage:')}
  ${pc.dim('Input tokens:')}    ${u.inputTokens.toLocaleString()}
  ${pc.dim('Output tokens:')}   ${u.outputTokens.toLocaleString()}
  ${pc.dim('Total tokens:')}    ${u.totalTokens.toLocaleString()}
  ${pc.dim('Requests:')}        ${u.requests}
  ${pc.dim('Tool calls:')}      ${state.totalToolCalls}
  ${pc.dim('Total duration:')}  ${(state.totalDuration / 1000).toFixed(1)}s
  ${pc.dim('Est. cost:')}       $${cost.toFixed(4)}
`);
}

// ============================================
// HELPERS
// ============================================

function extractContent(msg: any): string {
  if (typeof msg.content === 'string') return msg.content;
  if (Array.isArray(msg.content)) {
    return msg.content
      .map((part: any) => {
        if (typeof part === 'string') return part;
        if (part.type === 'text') return part.text;
        if (part.type === 'tool-call') return `[tool: ${part.toolName}]`;
        return '[...]';
      })
      .join(' ');
  }
  return JSON.stringify(msg.content).slice(0, 100);
}
