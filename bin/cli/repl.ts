/**
 * REPL loop for tawk-cli
 *
 * Claude Code-style interactive loop:
 * - Simple "> " prompt with readline (history, inline editing)
 * - Multi-line input with \ continuation and """ block mode
 * - ! bash passthrough
 * - Responses stream inline as a scrolling transcript
 * - Event-based readline (no for-await, which can exit prematurely)
 */

import * as readline from 'readline';
import { execSync } from 'child_process';
import pc from 'picocolors';
import type { ModelMessage } from 'ai';
import { AgenticRunner } from '../../src';
import { Usage } from '../../src/core/usage';
import type { StreamEvent, RunResult } from '../../src';
import { StreamRenderer } from './renderer';
import { handleCommand } from './commands';
import { MultiLineInput } from './input';
import type { CLIState } from './types';

/** Module-level execution flag for Ctrl+C handling */
let executing = false;

/**
 * Start the interactive REPL
 */
export async function startRepl(
  state: CLIState,
  rendererRef?: { pauseSpinner: () => void; resumeSpinner: (msg: string) => void }
): Promise<void> {
  const renderer = new StreamRenderer(state.verbose);
  await renderer.init();

  // Wire up renderer ref for permission prompts
  if (rendererRef) {
    rendererRef.pauseSpinner = () => renderer.pauseSpinner();
    rendererRef.resumeSpinner = (msg: string) => renderer.resumeSpinner(msg);
  }

  const multiLine = new MultiLineInput();

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: pc.bold('> '),
    historySize: 200,
    terminal: true,
  });

  function setPrompt(prompt: string): void {
    rl.setPrompt(prompt);
  }

  let exiting = false;

  const cleanup = () => {
    if (exiting) return;
    exiting = true;
    renderer.cleanup();
    // Disconnect MCP servers
    if (state.mcpManager) {
      (state.mcpManager as any).disconnectAll?.().catch?.(() => {});
    }
    rl.close();
    console.log(pc.dim('\n  Goodbye!\n'));
    process.exit(0);
  };

  // Handle Ctrl+C: if executing, stop; if in multi-line, cancel; if idle, exit
  process.on('SIGINT', () => {
    if (executing) {
      renderer.cleanup();
      process.stdout.write('\n');
      executing = false;
      multiLine.reset();
      rl.prompt();
    } else if (multiLine.isActive()) {
      multiLine.reset();
      process.stdout.write('\n');
      rl.setPrompt(pc.bold('> '));
      rl.prompt();
    } else {
      cleanup();
    }
  });

  // Event-based line handler
  rl.on('line', async (line: string) => {
    // Multi-line mode
    if (multiLine.isActive()) {
      const result = multiLine.feed(line);
      if (!result.complete) {
        rl.setPrompt(pc.dim(result.promptHint || '... '));
        rl.prompt();
        return;
      }
      rl.setPrompt(pc.bold('> '));
      await processInput(result.text!, state, renderer, rl, setPrompt);
      rl.prompt();
      return;
    }

    // Check for multi-line start
    const mlResult = multiLine.feed(line);
    if (!mlResult.complete) {
      rl.setPrompt(pc.dim(mlResult.promptHint || '... '));
      rl.prompt();
      return;
    }

    const input = (mlResult.text || '').trim();
    if (!input) {
      rl.prompt();
      return;
    }

    await processInput(input, state, renderer, rl, setPrompt);
    rl.prompt();
  });

  rl.on('close', () => {
    cleanup();
  });

  rl.prompt();

  // Keep process alive
  return new Promise<void>(() => {});
}

// ============================================
// INPUT PROCESSING
// ============================================

async function processInput(
  input: string,
  state: CLIState,
  renderer: StreamRenderer,
  rl: readline.Interface,
  setPrompt: (prompt: string) => void
): Promise<void> {
  // ! bash passthrough
  if (input.startsWith('!')) {
    const cmd = input.slice(1).trim();
    if (!cmd) return;
    executeBash(cmd);
    return;
  }

  // Slash commands
  if (input.startsWith('/')) {
    const result = await handleCommand(input, state, setPrompt, renderer);
    renderer.setVerbose(state.verbose);
    if (result.exit) {
      renderer.cleanup();
      if (state.mcpManager) {
        (state.mcpManager as any).disconnectAll?.().catch?.(() => {});
      }
      rl.close();
      console.log(pc.dim('\n  Goodbye!\n'));
      process.exit(0);
    }
    return;
  }

  // Regular input → execute with agent
  executing = true;
  try {
    await executeWithStreaming(input, state, renderer);
  } catch (err: any) {
    renderer.cleanup();
    console.log(pc.red(`\n  Error: ${err.message}`));
    if (state.verbose && err.stack) {
      console.log(pc.dim(err.stack));
    }
  } finally {
    executing = false;
  }

  state.turnCount++;
}

// ============================================
// BASH PASSTHROUGH
// ============================================

function executeBash(command: string): void {
  console.log(pc.dim(`  $ ${command}`));
  try {
    const output = execSync(command, {
      encoding: 'utf-8',
      timeout: 30_000,
      maxBuffer: 1024 * 1024,
      cwd: process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    if (output.trim()) {
      console.log(output.trimEnd());
    }
  } catch (err: any) {
    if (err.stdout) console.log(err.stdout.toString().trimEnd());
    if (err.stderr) console.log(pc.red(err.stderr.toString().trimEnd()));
    console.log(pc.dim(`  exit code: ${err.status ?? 1}`));
  }
}

// ============================================
// EXECUTION
// ============================================

async function executeWithStreaming(
  input: string,
  state: CLIState,
  renderer: StreamRenderer
): Promise<void> {
  const startTime = Date.now();

  // Build message history from session + new input
  const history = await state.session.getHistory();
  const userMessage: ModelMessage = { role: 'user', content: [{ type: 'text', text: input }] };
  const messages: ModelMessage[] = [...history, userMessage];
  const historyLen = history.length;

  // Create runner and stream
  const runner = new AgenticRunner({ maxTurns: state.config.maxTurns ?? 50 });
  const stream = runner.executeStream(state.agent, messages);

  let result: RunResult | undefined;
  let turnToolCalls = 0;

  try {
    for (;;) {
      const { value, done } = await stream.next();

      if (done) {
        result = value as RunResult;
        break;
      }

      const event = value as StreamEvent;
      renderer.render(event);

      if (event.type === 'tool-call') {
        turnToolCalls++;
      }
    }
  } catch (streamErr: any) {
    renderer.cleanup();
    throw new Error(`Stream failed: ${streamErr.message}`);
  }

  const duration = Date.now() - startTime;

  if (result) {
    // Update cumulative usage
    const turnUsage = new Usage({
      promptTokens: result.metadata.promptTokens,
      completionTokens: result.metadata.completionTokens,
      totalTokens: result.metadata.totalTokens,
    });
    state.cumulativeUsage.add(turnUsage);
    state.totalToolCalls += turnToolCalls;
    state.totalDuration += duration;

    // Render usage summary (with handoff chain if multi-agent)
    const cost = turnUsage.estimateCost({ model: state.modelId });
    renderer.renderUsage({
      inputTokens: result.metadata.promptTokens ?? 0,
      outputTokens: result.metadata.completionTokens ?? 0,
      totalTokens: result.metadata.totalTokens ?? 0,
      toolCalls: turnToolCalls,
      duration,
      cost,
      handoffChain: result.metadata.handoffChain,
    });

    // Save messages to session
    const newMessages = result.messages.slice(historyLen + 1);
    await state.session.addMessages([userMessage, ...newMessages]);
  }
}
