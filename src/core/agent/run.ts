/**
 * Agent Execution Functions
 * 
 * @module core/agent/run
 * @description
 * Core execution functions for running agents.
 * Provides both standard and streaming execution modes.
 * 
 * **Features**:
 * - Standard execution with run()
 * - Streaming execution with runStream()
 * - State resumption
 * - Context injection
 * 
 * @author Tawk.to
 * @license MIT
 * @version 3.0.0
 */

import type { ModelMessage } from 'ai';
import type { Agent } from './agent-class';
import type {
  RunOptions,
  RunResult,
  StreamResult,
  StreamChunk,
  RunState,
} from './types';

/**
 * Execute an agent with a user message or messages.
 * This is the primary function for running agents.
 * 
 * @template TContext - Type of context object passed to tools
 * @template TOutput - Type of the agent's output
 * 
 * @param {Agent<TContext, TOutput>} agent - The agent to execute
 * @param {string | ModelMessage[] | RunState} input - User input (string, messages, or state to resume)
 * @param {RunOptions<TContext>} [options] - Execution options
 * @returns {Promise<RunResult<TOutput>>} Execution result with output and metadata
 * 
 * @example Basic Execution
 * ```typescript
 * import { Agent, run } from 'tawk-agents-sdk';
 * 
 * const agent = new Agent({
 *   name: 'Assistant',
 *   instructions: 'You are helpful.',
 *   model: openai('gpt-4')
 * });
 * 
 * const result = await run(agent, 'Hello!');
 * console.log(result.finalOutput);
 * ```
 * 
 * @example With Context
 * ```typescript
 * const result = await run(agent, 'What is my balance?', {
 *   context: {
 *     userId: '123',
 *     database: db
 *   },
 *   maxTurns: 10
 * });
 * ```
 * 
 * @example Resuming from State
 * ```typescript
 * // Save state when paused
 * const state = result.state;
 *
 * // Resume later
 * const resumed = await run(agent, state, options);
 * ```
 */
export async function run<TContext = any, TOutput = string>(
  agent: Agent<TContext, TOutput>,
  input: string | ModelMessage[] | RunState,
  options: RunOptions<TContext> = {}
): Promise<RunResult<TOutput>> {
  // Import runner dynamically to avoid circular dependencies
  const { AgenticRunner } = await import('../runner');
  
  // Handle resuming from RunState
  if (isRunState(input)) {
    return await resumeRun(input, options);
  }

  // Execute the agent (type assertion to handle module boundary)
  const runner = new AgenticRunner<TContext, TOutput>(options);
  return await runner.execute(agent as any, input, options);
}

/**
 * Execute an agent with streaming responses.
 * Provides real-time text chunks as they're generated.
 * 
 * @template TContext - Type of context object passed to tools
 * @template TOutput - Type of the agent's output
 * 
 * @param {Agent<TContext, TOutput>} agent - The agent to execute
 * @param {string | ModelMessage[]} input - User input (string or messages array)
 * @param {RunOptions<TContext>} [options] - Execution options
 * @returns {Promise<StreamResult<TOutput>>} Streaming result with text stream and completion promise
 * 
 * @example Stream Text Chunks
 * ```typescript
 * import { Agent, runStream } from 'tawk-agents-sdk';
 * 
 * const agent = new Agent({
 *   name: 'Storyteller',
 *   instructions: 'Tell engaging stories.',
 *   model: openai('gpt-4')
 * });
 * 
 * const stream = await runStream(agent, 'Tell me a story');
 * 
 * // Stream text as it's generated
 * for await (const chunk of stream.textStream) {
 *   process.stdout.write(chunk);
 * }
 * 
 * // Get final result
 * const result = await stream.completed;
 * console.log('\\nDone!', result.metadata);
 * ```
 * 
 * @example Stream with Full Events
 * ```typescript
 * const stream = await runStream(agent, 'Calculate 5 + 3');
 * 
 * for await (const event of stream.fullStream) {
 *   switch (event.type) {
 *     case 'text-delta':
 *       process.stdout.write(event.textDelta);
 *       break;
 *     case 'tool-call':
 *       console.log('Tool:', event.toolCall?.toolName);
 *       break;
 *     case 'tool-result':
 *       console.log('Result:', event.toolResult?.result);
 *       break;
 *   }
 * }
 * ```
 */
export async function runStream<TContext = any, TOutput = string>(
  agent: Agent<TContext, TOutput>,
  input: string | ModelMessage[],
  options: RunOptions<TContext> = {}
): Promise<StreamResult<TOutput>> {
  // Import runner dynamically to avoid circular dependencies
  const { AgenticRunner } = await import('../runner');
  type StreamEvent = import('../runner').StreamEvent;

  const runner = new AgenticRunner<TContext, TOutput>(options);

  // Create the async generator from the runner
  const streamGen = runner.executeStream(agent as any, input, options);

  // Buffer for stream events that multiple consumers can read
  const eventBuffer: Array<StreamEvent | { type: 'done'; result: RunResult<TOutput> }> = [];
  let streamDone = false;
  let streamError: any = null;
  let finalResult: RunResult<TOutput> | null = null;
  const waiters: Array<() => void> = [];

  // Set up deferred completion
  let resolveCompleted!: (result: RunResult<TOutput>) => void;
  let rejectCompleted!: (error: any) => void;
  const completed = new Promise<RunResult<TOutput>>((resolve, reject) => {
    resolveCompleted = resolve;
    rejectCompleted = reject;
  });

  // Consume the generator in the background, buffering events
  (async () => {
    try {
      let iterResult = await streamGen.next();
      while (!iterResult.done) {
        eventBuffer.push(iterResult.value);
        // Notify waiting consumers
        for (const w of waiters) w();
        waiters.length = 0;
        iterResult = await streamGen.next();
      }
      // Generator returned the final RunResult
      finalResult = iterResult.value;
      streamDone = true;
      for (const w of waiters) w();
      waiters.length = 0;
      resolveCompleted(finalResult!);
    } catch (error) {
      streamError = error;
      streamDone = true;
      for (const w of waiters) w();
      waiters.length = 0;
      rejectCompleted(error);
    }
  })();

  // Helper to wait for new events
  function waitForEvent(): Promise<void> {
    return new Promise<void>((resolve) => { waiters.push(resolve); });
  }

  // Async generator for text stream (yields only text deltas)
  async function* createTextStream(): AsyncGenerator<string> {
    let index = 0;
    while (true) {
      while (index < eventBuffer.length) {
        const event = eventBuffer[index++];
        if ('type' in event && event.type === 'text-delta') {
          yield (event as any).textDelta;
        }
      }
      if (streamDone) break;
      await waitForEvent();
    }
    if (streamError) throw streamError;
  }

  // Async generator for full stream (yields all StreamChunk events)
  async function* createFullStream(): AsyncGenerator<StreamChunk> {
    let index = 0;
    while (true) {
      while (index < eventBuffer.length) {
        const event = eventBuffer[index++] as StreamEvent;
        // Map StreamEvent to StreamChunk
        if (event.type === 'text-delta') {
          yield { type: 'text-delta', textDelta: (event as any).textDelta };
        } else if (event.type === 'tool-call') {
          yield {
            type: 'tool-call',
            toolCall: { toolName: (event as any).toolName, args: (event as any).args },
          };
        } else if (event.type === 'tool-result') {
          yield {
            type: 'tool-result',
            toolResult: { toolName: (event as any).toolName, result: (event as any).result },
          };
        } else if (event.type === 'step-complete') {
          yield { type: 'step-finish' };
        } else if (event.type === 'finish') {
          yield { type: 'finish' };
        }
      }
      if (streamDone) break;
      await waitForEvent();
    }
    if (streamError) throw streamError;
  }

  return {
    textStream: createTextStream(),
    fullStream: createFullStream(),
    completed,
  };
}

/**
 * Resume a paused agent run from saved state.
 * 
 * @template TContext - Type of context object
 * @template TOutput - Type of output
 * @param {RunState} state - Saved run state
 * @param {RunOptions<TContext>} [options] - Execution options
 * @returns {Promise<RunResult<TOutput>>} Execution result
 * @internal
 */
async function resumeRun<TContext = any, TOutput = string>(
  state: RunState,
  options: RunOptions<TContext> = {}
): Promise<RunResult<TOutput>> {
  const { AgenticRunner } = await import('../runner');
  
  const runner = new AgenticRunner<TContext, TOutput>({
    ...options,
    context: state.context
  });
  
  return await runner.execute(state.currentAgent as any, state.messages, {
    ...options,
    context: state.context
  });
}

/**
 * Type guard to check if input is a RunState object.
 * 
 * @param {any} input - Input to check
 * @returns {boolean} True if input is a RunState
 * @internal
 */
function isRunState(input: any): input is RunState {
  return (
    input &&
    typeof input === 'object' &&
    'agent' in input &&
    'messages' in input &&
    'context' in input &&
    'stepNumber' in input
  );
}

