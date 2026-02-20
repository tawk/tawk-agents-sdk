/**
 * REPL loop for tawk-cli
 *
 * readline-based interactive loop with session management,
 * streaming execution, and slash command dispatch.
 */

import * as readline from 'readline';
import pc from 'picocolors';
import type { ModelMessage } from 'ai';
import { AgenticRunner } from '../../src';
import { Usage } from '../../src/core/usage';
import type { StreamEvent, RunResult } from '../../src';
import { StreamRenderer } from './renderer';
import { handleCommand } from './commands';
import type { CLIState } from './types';

/**
 * Start the interactive REPL
 */
export async function startRepl(state: CLIState): Promise<void> {
  const renderer = new StreamRenderer(state.verbose);
  let currentPrompt = `${pc.cyan(pc.bold(state.agent.name))} > `;

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: currentPrompt,
    historySize: 200,
    terminal: true,
  });

  function setPrompt(prompt: string): void {
    currentPrompt = prompt;
    rl.setPrompt(prompt);
  }

  // Graceful shutdown
  const cleanup = () => {
    renderer.cleanup();
    rl.close();
    console.log(pc.dim('\nGoodbye!'));
    process.exit(0);
  };

  process.on('SIGINT', cleanup);

  rl.prompt();

  for await (const line of rl) {
    const input = line.trim();

    if (!input) {
      rl.prompt();
      continue;
    }

    // Slash commands
    if (input.startsWith('/')) {
      const result = await handleCommand(input, state, setPrompt);
      renderer.setVerbose(state.verbose);
      if (result.exit) {
        cleanup();
        return;
      }
      rl.prompt();
      continue;
    }

    // Regular input → execute with agent
    try {
      await executeWithStreaming(input, state, renderer);
    } catch (err: any) {
      renderer.cleanup();
      console.log(pc.red(`\nError: ${err.message}`));
      if (state.verbose && err.stack) {
        console.log(pc.dim(err.stack));
      }
    }

    state.turnCount++;
    rl.prompt();
  }

  // readline stream ended (e.g. piped input)
  cleanup();
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
  const runner = new AgenticRunner({ maxTurns: 50 });
  const stream = runner.executeStream(state.agent, messages);

  let result: RunResult | undefined;
  let turnToolCalls = 0;

  // Iterate the async generator — try/catch so streaming errors don't crash the REPL
  try {
    for (;;) {
      const { value, done } = await stream.next();

      if (done) {
        // Generator return value is the RunResult
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

    // Render usage summary
    const cost = turnUsage.estimateCost({ model: state.modelId });
    renderer.renderUsage({
      inputTokens: result.metadata.promptTokens,
      outputTokens: result.metadata.completionTokens,
      totalTokens: result.metadata.totalTokens,
      toolCalls: turnToolCalls,
      duration,
      cost,
    });

    // Save messages to session: the user message + new messages produced by the run.
    // result.messages includes all messages the runner operated on. The new messages
    // (assistant responses, tool calls/results) start after the input we sent in.
    const newMessages = result.messages.slice(historyLen + 1);
    await state.session.addMessages([userMessage, ...newMessages]);
  }
}
