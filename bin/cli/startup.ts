/**
 * Startup orchestration for tawk-cli
 *
 * Handles: config loading → model resolution → MCP connection → agent creation.
 * Extracted from tawk-cli.ts so the entry point stays thin.
 */

import * as readline from 'readline';
import pc from 'picocolors';
import { randomUUID } from 'crypto';
import type { LanguageModel } from 'ai';
import { Usage } from '../../src/core/usage';
import { resolveModel, parseModelString } from './model-provider';
import { createAgent, getPresetNames } from './agents';
import { loadSettings, resolveSystemPrompt, type ResolvedConfig } from './config';
import { loadMcpConfig, connectMcpServers, getMcpTools } from './mcp-manager';
import { CLISession, type CLIOptions, type CLIState } from './types';
import { DANGEROUS_TOOLS, wrapWithPermission } from './tools';
import type { CoreTool } from '../../src';

// ============================================
// ARG PARSING
// ============================================

export function parseArgs(argv: string[]): CLIOptions {
  const args = argv.slice(2);
  const options: CLIOptions = {
    model: '',  // Will be resolved from config
    agent: '',  // Will be resolved from config
    session: randomUUID().slice(0, 8),
    noStream: false,
    verbose: false,
    maxTurns: 50,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--model':
      case '-m':
        options.model = args[++i];
        break;
      case '--agent':
      case '-a':
        options.agent = args[++i];
        break;
      case '--session':
      case '-s':
        options.session = args[++i];
        break;
      case '--system-prompt':
        options.systemPrompt = args[++i];
        break;
      case '--append-system-prompt':
        options.appendSystemPrompt = args[++i];
        break;
      case '--mcp-config':
        options.mcpConfig = args[++i];
        break;
      case '--no-stream':
        options.noStream = true;
        break;
      case '--verbose':
      case '-v':
        options.verbose = true;
        break;
      case '--max-turns':
        options.maxTurns = parseInt(args[++i], 10) || 50;
        break;
      case '--help':
      case '-h':
        printUsage();
        process.exit(0);
        break;
      default:
        if (args[i].startsWith('-')) {
          console.error(pc.red(`Unknown option: ${args[i]}`));
          printUsage();
          process.exit(1);
        }
    }
  }

  return options;
}

function printUsage(): void {
  console.log(`
${pc.bold('tawk-cli')} — Interactive CLI for testing Tawk Agents SDK

${pc.bold('Usage:')}
  npm run cli [options]

${pc.bold('Options:')}
  --model, -m <provider:id>      Model to use
  --agent, -a <preset>           Agent preset: ${getPresetNames().join(', ')}
  --session, -s <id>             Session ID (default: random)
  --system-prompt <text>         Override system prompt
  --append-system-prompt <text>  Append to system prompt
  --mcp-config <path>            Load MCP config from file
  --no-stream                    Disable streaming
  --verbose, -v                  Show step details
  --max-turns <n>                Max turns per query (default: 50)
  --help, -h                     Show this help

${pc.bold('Config:')}
  .tawk/settings.json            Project settings
  .tawk/settings.local.json      Local overrides (gitignored)
  .mcp.json                      MCP server configuration

${pc.bold('Environment:')}
  OPENAI_API_KEY                 Required for OpenAI models
  ANTHROPIC_API_KEY              Required for Anthropic models
  GOOGLE_GENERATIVE_AI_API_KEY   Required for Google models
  GROQ_API_KEY                   Required for Groq models
  TAWK_CLI_MODEL                 Default model
  TAWK_CLI_AGENT                 Default agent preset
`);
}

// ============================================
// MODEL PICKER
// ============================================

const MODEL_CHOICES = [
  { label: 'openai:gpt-4o-mini', description: 'Fast, affordable (requires OPENAI_API_KEY)' },
  { label: 'openai:gpt-4o', description: 'High quality (requires OPENAI_API_KEY)' },
  { label: 'openai:o3-mini', description: 'Reasoning model (requires OPENAI_API_KEY)' },
  { label: 'anthropic:claude-sonnet-4-5', description: 'Claude Sonnet 4.5 (requires ANTHROPIC_API_KEY)' },
  { label: 'anthropic:claude-haiku-4-5', description: 'Claude Haiku 4.5 (requires ANTHROPIC_API_KEY)' },
  { label: 'anthropic:claude-opus-4-6', description: 'Claude Opus 4.6 (requires ANTHROPIC_API_KEY)' },
  { label: 'groq:llama-3.3-70b-versatile', description: 'Llama 3.3 via Groq (requires GROQ_API_KEY)' },
  { label: 'google:gemini-2.0-flash', description: 'Gemini 2.0 Flash (requires GOOGLE_GENERATIVE_AI_API_KEY)' },
];

async function pickModel(): Promise<string> {
  console.log(pc.bold('\n  Select a model:\n'));
  for (let i = 0; i < MODEL_CHOICES.length; i++) {
    const c = MODEL_CHOICES[i];
    console.log(`  ${pc.cyan(String(i + 1))}  ${c.label}  ${pc.dim(c.description)}`);
  }
  console.log();

  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stderr,
      terminal: true,
    });

    rl.question(pc.bold(`  Choice (1-${MODEL_CHOICES.length}) or model string: `), (answer) => {
      rl.close();
      const trimmed = answer.trim();
      const num = parseInt(trimmed, 10);
      if (num >= 1 && num <= MODEL_CHOICES.length) {
        resolve(MODEL_CHOICES[num - 1].label);
      } else if (trimmed) {
        resolve(trimmed);
      } else {
        resolve(MODEL_CHOICES[0].label); // default
      }
    });
  });
}

// ============================================
// STARTUP
// ============================================

export async function runStartup(argv: string[]): Promise<{
  state: CLIState;
  rendererRef: { pauseSpinner: () => void; resumeSpinner: (msg: string) => void };
}> {
  const options = parseArgs(argv);

  // 1. Load config
  const config = loadSettings();

  // Apply flag overrides to config sources tracking
  if (options.verbose) { config.verbose = true; config.sources.verbose = 'flag'; }
  if (options.maxTurns !== 50) { config.maxTurns = options.maxTurns; config.sources.maxTurns = 'flag'; }

  // 2. Resolve model
  let modelString = options.model || config.model;
  if (!modelString) {
    // No model configured anywhere — show interactive picker
    modelString = await pickModel();
  }
  if (options.model) config.sources.model = 'flag';

  let model: LanguageModel;
  let displayId: string;
  try {
    ({ model, displayId } = await resolveModel(modelString));
  } catch (err: any) {
    console.error(pc.red(`  Model error: ${err.message}`));
    process.exit(1);
  }

  // 3. Resolve agent
  const agentName = options.agent || config.agent || 'default';
  if (options.agent) config.sources.agent = 'flag';

  // 4. Resolve system prompt
  let systemPrompt = options.systemPrompt || resolveSystemPrompt(config) || '';
  const appendPrompt = options.appendSystemPrompt;

  // 5. Connect MCP servers
  let mcpManager;
  let mcpTools: Record<string, CoreTool> = {};
  const mcpConfig = loadMcpConfig(options.mcpConfig);
  if (mcpConfig) {
    try {
      mcpManager = await connectMcpServers(mcpConfig);
      mcpTools = await getMcpTools(mcpManager);
    } catch (err: any) {
      process.stderr.write(pc.yellow(`  ⚠ MCP initialization failed: ${err.message}\n`));
    }
  }

  // 6. Build renderer ref for permission wrapper
  const rendererRef = {
    pauseSpinner: () => {},
    resumeSpinner: (_msg: string) => {},
  };

  // 7. Build state (partial — agent will be set after creation)
  const session = new CLISession(options.session);
  const state: CLIState = {
    agent: null as any,
    agentName,
    session,
    cumulativeUsage: new Usage(),
    totalToolCalls: 0,
    totalDuration: 0,
    turnCount: 0,
    verbose: config.verbose ?? false,
    modelId: displayId,
    permissionsGranted: false,
    config,
    systemPrompt,
    model,
    mcpManager,
    mcpTools,
  };

  // 8. Build tool wrapper
  state.toolWrapper = (name: string, toolDef: CoreTool) => {
    if (!DANGEROUS_TOOLS.has(name)) return toolDef;
    return wrapWithPermission(toolDef, name, {
      pauseSpinner: () => rendererRef.pauseSpinner(),
      resumeSpinner: (msg: string) => rendererRef.resumeSpinner(msg),
      shouldConfirm: () => !state.permissionsGranted,
    });
  };

  // 9. Create agent with all tools + system prompt + MCP
  try {
    const { agent, toolCount } = createAgent(agentName, model, {
      toolWrapper: state.toolWrapper,
      mcpTools,
      systemPrompt: systemPrompt || undefined,
      appendInstructions: appendPrompt,
    });
    state.agent = agent;
  } catch (err: any) {
    console.error(pc.red(`  Agent error: ${err.message}`));
    process.exit(1);
  }

  return { state, rendererRef };
}

/**
 * Print the welcome banner.
 */
export function printBanner(state: CLIState): void {
  const toolCount = Object.keys(state.agent._tools || {}).length;
  const mcpCount = Object.keys(state.mcpTools).length;

  console.log();
  console.log(pc.bold('  TAWK Agents SDK') + pc.dim(' v3.0.0'));

  const parts = [
    pc.dim('  model: ') + pc.cyan(state.modelId),
    pc.dim('agent: ') + pc.cyan(state.agent.name) + pc.dim(` (${toolCount} tools)`),
    pc.dim('session: ') + pc.dim(state.session.id),
  ];
  console.log(parts.join(pc.dim(' · ')));

  if (mcpCount > 0) {
    console.log(pc.dim('  mcp: ') + pc.cyan(`${mcpCount} tools`) + pc.dim(' from ') + pc.cyan(String((state.mcpManager as any)?.servers?.size || 0) + ' servers'));
  }

  if (state.systemPrompt) {
    const preview = state.systemPrompt.length > 60
      ? state.systemPrompt.slice(0, 57) + '...'
      : state.systemPrompt;
    console.log(pc.dim('  prompt: ') + pc.dim(preview));
  }

  console.log(pc.dim('  Type a message, /help for commands, \\ for multi-line.\n'));
}
