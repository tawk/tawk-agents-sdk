#!/usr/bin/env npx ts-node --transpile-only
/**
 * tawk-cli — Interactive CLI for testing Tawk Agents SDK
 *
 * Usage:
 *   npm run cli
 *   npm run cli -- --model groq:llama-3.3-70b-versatile
 *   npm run cli -- --agent coder --verbose
 */

import 'dotenv/config';
import pc from 'picocolors';
import { randomUUID } from 'crypto';
import { Usage } from '../src/core/usage';
import { resolveModel } from './cli/model-provider';
import { createAgent, getPresetNames } from './cli/agents';
import { startRepl } from './cli/repl';
import { CLISession, type CLIOptions, type CLIState } from './cli/types';

// ============================================
// ARG PARSING
// ============================================

function parseArgs(argv: string[]): CLIOptions {
  const args = argv.slice(2); // skip node and script path
  const options: CLIOptions = {
    model: process.env.TAWK_CLI_MODEL || 'openai:gpt-4o-mini',
    agent: process.env.TAWK_CLI_AGENT || 'default',
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
${pc.bold('tawk-cli')} — Interactive CLI for Tawk Agents SDK

${pc.bold('Usage:')}
  npm run cli [options]

${pc.bold('Options:')}
  --model, -m <provider:id>   Model to use (default: openai:gpt-4o-mini)
  --agent, -a <preset>        Agent preset: ${getPresetNames().join(', ')}
  --session, -s <id>          Session ID (default: random)
  --no-stream                 Disable streaming
  --verbose, -v               Show step details
  --max-turns <n>             Max turns per query (default: 50)
  --help, -h                  Show this help

${pc.bold('Environment:')}
  OPENAI_API_KEY              Required for OpenAI models
  ANTHROPIC_API_KEY           Required for Anthropic models
  GOOGLE_GENERATIVE_AI_API_KEY  Required for Google models
  GROQ_API_KEY                Required for Groq models
  TAWK_CLI_MODEL              Default model (overridden by --model)
  TAWK_CLI_AGENT              Default agent preset (overridden by --agent)
`);
}

// ============================================
// BANNER
// ============================================

function printBanner(
  modelId: string,
  agentName: string,
  toolCount: number,
  sessionId: string
): void {
  console.log(`
  ${pc.bold('TAWK Agents SDK')}  ${pc.dim('v3.0.0 CLI')}

  ${pc.dim('Model:')}    ${pc.cyan(modelId)}
  ${pc.dim('Agent:')}    ${pc.cyan(agentName)} ${pc.dim(`(${toolCount} tools)`)}
  ${pc.dim('Session:')}  ${pc.dim(sessionId)}

  ${pc.dim('Type your message, or /help for commands.')}
`);
}

// ============================================
// MAIN
// ============================================

async function main(): Promise<void> {
  const options = parseArgs(process.argv);

  // Resolve model
  let model, displayId;
  try {
    ({ model, displayId } = await resolveModel(options.model));
  } catch (err: any) {
    console.error(pc.red(`Model error: ${err.message}`));
    process.exit(1);
  }

  // Create agent
  let agent, agentDescription, toolCount;
  try {
    ({ agent, description: agentDescription, toolCount } = createAgent(options.agent, model));
  } catch (err: any) {
    console.error(pc.red(`Agent error: ${err.message}`));
    process.exit(1);
  }

  // Create session
  const session = new CLISession(options.session);

  // Build CLI state
  const state: CLIState = {
    agent,
    agentName: options.agent,
    session,
    cumulativeUsage: new Usage(),
    totalToolCalls: 0,
    totalDuration: 0,
    turnCount: 0,
    verbose: options.verbose,
    modelId: displayId,
  };

  // Show banner
  printBanner(displayId, agent.name, toolCount, session.id);

  // Start REPL
  await startRepl(state);
}

main().catch((err) => {
  console.error(pc.red(`Fatal error: ${err.message}`));
  if (err.stack) console.error(pc.dim(err.stack));
  process.exit(1);
});
