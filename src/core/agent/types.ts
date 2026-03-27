/**
 * Agent Type Definitions
 * 
 * @module core/agent/types
 * @description
 * Core type definitions for the Tawk Agents SDK.
 * All interfaces and types used across the agent system.
 * 
 * **Type Categories**:
 * - Agent Configuration
 * - Execution Options and Results
 * - Streaming Interfaces
 * - Session Management
 * - Guardrails
 * - Context and State
 * 
 * @author Tawk.to
 * @license MIT
 * @version 1.0.0
 */

import type { ModelMessage, LanguageModel, Schema, JSONSchema7 } from 'ai';
import type { z } from 'zod';
import type { Usage } from '../usage';

// ============================================
// TOKENIZER FUNCTION TYPE
// ============================================

/** Tokenizer function for estimating token counts. Can be sync or async. */
export type TokenizerFn = (text: string) => number | Promise<number>;

/** Image tokenizer function for estimating token counts of image content parts. */
export type ImageTokenizerFn = (imagePart: object) => number | Promise<number>;

// ============================================
// TOOL DEFINITIONS
// ============================================

/**
 * Flexible input schema type that accepts:
 * - Zod schemas (z.ZodType)
 * - JSON Schema (JSONSchema7)
 * - AI SDK Schema objects (created via jsonSchema())
 */
export type FlexibleInputSchema = 
  | z.ZodType
  | JSONSchema7
  | Schema;

/**
 * Tool definition compatible with AI SDK v5.
 * 
 * @property {string} [description] - Human-readable description of what the tool does
 * @property {FlexibleInputSchema} [inputSchema] - Schema for validating tool inputs (Zod, JSON Schema, or AI SDK Schema)
 * @property {Function} execute - Function that executes the tool logic
 * @property {boolean | Function} [enabled] - Whether the tool is enabled (can be dynamic)
 */
export type CoreTool = {
  description?: string;
  inputSchema?: FlexibleInputSchema;
  execute: (args: any, context?: any) => Promise<any> | any;
  enabled?: boolean | ((context: any) => boolean | Promise<boolean>);
};

// ============================================
// AGENT CONFIGURATION
// ============================================

/**
 * Configuration for creating an Agent instance.
 * 
 * @template TContext - Type of context object passed to tools and guardrails
 * @template TOutput - Type of the agent's output (defaults to string)
 * 
 * @property {string} name - Unique identifier for the agent (used in logging and tracing)
 * @property {string | Function} instructions - System prompt or function that returns instructions dynamically
 * @property {LanguageModel} [model] - AI model to use (defaults to global default model)
 * @property {Record<string, CoreTool>} [tools] - Dictionary of tools the agent can use
 * @property {Agent[]} [subagents] - List of sub-agents this agent can transfer to
 * @property {string} [transferDescription] - Description of when to transfer to this agent
 * @property {Guardrail[]} [guardrails] - Input/output validation rules
 * @property {z.ZodSchema} [outputSchema] - Schema for structured output parsing
 * @property {z.ZodSchema} [outputType] - Alias for outputSchema (for backward compatibility)
 * @property {number} [maxSteps] - Maximum number of steps before stopping (default: 10)
 * @property {Object} [modelSettings] - Model generation parameters
 * @property {number} [modelSettings.temperature] - Sampling temperature (0-2)
 * @property {number} [modelSettings.topP] - Nucleus sampling parameter
 * @property {number} [modelSettings.responseTokens] - Maximum tokens the LLM should respond with per generation
 * @property {number} [modelSettings.maxTokens] - Maximum total token budget for the entire agent run (undefined = no limit)
 * @property {number} [modelSettings.presencePenalty] - Presence penalty (-2 to 2)
 * @property {number} [modelSettings.frequencyPenalty] - Frequency penalty (-2 to 2)
 * @property {Function} [onStepFinish] - Callback invoked after each step completes
 * @property {TokenizerFn} [tokenizerFn] - Custom tokenizer function for calculating token counts (default: 4 chars = 1 token)
 * @property {Function} [shouldFinish] - Custom function to determine if agent should stop
 * @property {boolean} [useTOON] - Enable TOON encoding for 18-33% token reduction
 * 
 * @example
 * ```typescript
 * const config: AgentConfig = {
 *   name: 'Assistant',
 *   instructions: 'You are a helpful AI assistant.',
 *   model: openai('gpt-4'),
 *   tools: { calculator, search },
 *   subagents: [specialist],
 *   guardrails: [contentSafety]
 * };
 * ```
 */
export interface AgentConfig<TContext = any, TOutput = string> {
  name: string;
  instructions: string | ((context: RunContextWrapper<TContext>) => string | Promise<string>);
  model?: LanguageModel;
  tools?: Record<string, CoreTool>;
  subagents?: any[]; // Agent<TContext, any>[] - circular dependency resolved at runtime
  transferDescription?: string;
  
  // Legacy support (deprecated - use subagents instead)
  /** @deprecated Use subagents instead */
  handoffs?: any[]; // Agent<TContext, any>[]
  /** @deprecated Use transferDescription instead */
  handoffDescription?: string;
  
  guardrails?: Guardrail<TContext>[];
  outputSchema?: z.ZodSchema<TOutput>;
  outputType?: z.ZodSchema<TOutput>;
  maxSteps?: number;
  modelSettings?: {
    temperature?: number;
    topP?: number;
    responseTokens?: number;
    maxTokens?: number;
    presencePenalty?: number;
    frequencyPenalty?: number;
    toolChoice?: 'auto' | 'required' | 'none' | ((turn: number) => 'auto' | 'required' | 'none');
    providerOptions?: Record<string, Record<string, unknown>>;
  };
  /** Custom tokenizer (default: 4 chars = 1 token) */
  tokenizerFn?: TokenizerFn;
  /** Custom image tokenizer (default: 2840 tokens per image) */
  imageTokenizerFn?: ImageTokenizerFn;
  onStepFinish?: (step: StepResult) => void | Promise<void>;
  shouldFinish?: (context: TContext, toolResults: any[]) => boolean;
  useTOON?: boolean;
}

// ============================================
// EXECUTION OPTIONS
// ============================================

/**
 * Options for running an agent.
 * 
 * @template TContext - Type of context object passed to tools
 * 
 * @property {TContext} [context] - Request-scoped context available to all tools
 * @property {Session} [session] - Session for maintaining conversation history
 * @property {boolean} [stream] - Whether to stream responses (use runStream() instead)
 * @property {Function} [sessionInputCallback] - Transform messages before agent execution
 * @property {number} [maxTurns] - Maximum conversation turns before stopping (default: 50)
 * 
 * @example
 * ```typescript
 * const options: RunOptions<MyContext> = {
 *   context: { userId: '123', database: db },
 *   session: new MemorySession('user-123'),
 *   maxTurns: 20
 * };
 * ```
 */
export interface RunOptions<TContext = any> {
  context?: TContext;
  session?: Session<TContext>;
  stream?: boolean;
  sessionInputCallback?: (history: ModelMessage[], newInput: ModelMessage[]) => ModelMessage[];
  maxTurns?: number;
}

// ============================================
// EXECUTION RESULTS
// ============================================

/**
 * Result of running an agent.
 * 
 * @template TOutput - Type of the final output
 * 
 * @property {TOutput} finalOutput - The agent's final response/output
 * @property {ModelMessage[]} messages - Complete conversation history including all turns
 * @property {StepResult[]} steps - Individual steps taken during execution
 * @property {RunState} [state] - Current execution state (for resuming)
 * @property {Object} metadata - Execution metadata and metrics
 * @property {number} [metadata.totalTokens] - Total tokens used
 * @property {number} [metadata.promptTokens] - Tokens in prompts
 * @property {number} [metadata.completionTokens] - Tokens in completions
 * @property {string} [metadata.finishReason] - Why execution finished ('stop', 'length', etc.)
 * @property {number} [metadata.totalToolCalls] - Total number of tool calls made
 * @property {string[]} [metadata.handoffChain] - Chain of agent names involved in handoffs
 * @property {AgentMetric[]} [metadata.agentMetrics] - Performance metrics per agent
 * @property {string[]} [metadata.raceParticipants] - Agent names in race execution
 * @property {string[]} [metadata.raceWinners] - Winning agent names from race
 */
export interface RunResult<TOutput = string> {
  finalOutput: TOutput;
  messages: ModelMessage[];
  steps: StepResult[];
  state?: RunState;
  metadata: {
    totalTokens?: number;
    promptTokens?: number;
    completionTokens?: number;
    finishReason?: string;
    totalToolCalls?: number;
    handoffChain?: string[];
    agentMetrics?: AgentMetric[];
    raceParticipants?: string[];
    raceWinners?: string[];
  };
}

/**
 * Performance metrics for a single agent during execution.
 * 
 * @property {string} agentName - Name of the agent
 * @property {number} turns - Number of turns this agent executed
 * @property {Object} tokens - Token usage breakdown
 * @property {number} tokens.input - Input tokens used
 * @property {number} tokens.output - Output tokens generated
 * @property {number} tokens.total - Total tokens used
 * @property {number} toolCalls - Number of tool calls made
 * @property {number} duration - Execution duration in milliseconds
 */
export interface AgentMetric {
  agentName: string;
  turns: number;
  tokens: {
    input: number;
    output: number;
    total: number;
  };
  toolCalls: number;
  duration: number;
}

/**
 * Result of a single agent execution step.
 * 
 * @property {number} stepNumber - Sequential step number (1-indexed)
 * @property {Array} toolCalls - Tools called during this step
 * @property {string} toolCalls[].toolName - Name of the tool
 * @property {any} toolCalls[].args - Arguments passed to the tool
 * @property {any} toolCalls[].result - Result returned by the tool
 * @property {string} [text] - Text generated in this step
 * @property {string} [finishReason] - Reason step finished ('stop', 'tool-calls', 'length', etc.)
 */
export interface StepResult {
  stepNumber: number;
  toolCalls: Array<{
    toolName: string;
    args: any;
    result: any;
  }>;
  text?: string;
  finishReason?: string;
}

// ============================================
// STREAMING INTERFACES
// ============================================

/**
 * Result of streaming an agent execution.
 * 
 * @template TOutput - Type of the final output
 * 
 * @property {AsyncIterable<string>} textStream - Stream of text chunks as they're generated
 * @property {AsyncIterable<StreamChunk>} fullStream - Stream of all events (text, tool calls, etc.)
 * @property {Promise<RunResult<TOutput>>} completed - Promise that resolves with final result
 * 
 * @example
 * ```typescript
 * const stream = await runStream(agent, 'Hello');
 * 
 * // Stream text only
 * for await (const text of stream.textStream) {
 *   process.stdout.write(text);
 * }
 * 
 * // Or get full result
 * const result = await stream.completed;
 * ```
 */
export interface StreamResult<TOutput = string> {
  textStream: AsyncIterable<string>;
  fullStream: AsyncIterable<StreamChunk>;
  completed: Promise<RunResult<TOutput>>;
}

/**
 * A single chunk in the streaming response.
 * 
 * @property {string} type - Type of chunk: 'text-delta', 'tool-call', 'tool-result', 'step-finish', or 'finish'
 * @property {string} [textDelta] - Text chunk (for 'text-delta' type)
 * @property {Object} [toolCall] - Tool call information (for 'tool-call' type)
 * @property {string} toolCall.toolName - Name of the tool being called
 * @property {any} toolCall.args - Arguments passed to the tool
 * @property {Object} [toolResult] - Tool execution result (for 'tool-result' type)
 * @property {string} toolResult.toolName - Name of the tool that executed
 * @property {any} toolResult.result - Result returned by the tool
 * @property {StepResult} [step] - Step result (for 'step-finish' type)
 */
export interface StreamChunk {
  type: 'text-delta' | 'tool-call' | 'tool-result' | 'step-finish' | 'finish';
  textDelta?: string;
  toolCall?: {
    toolName: string;
    args: any;
  };
  toolResult?: {
    toolName: string;
    result: any;
  };
  step?: StepResult;
}

// ============================================
// STATE MANAGEMENT
// ============================================

/**
 * Execution state for resuming a paused agent run (e.g., for human-in-the-loop).
 * 
 * @property {Agent} agent - The agent being executed
 * @property {ModelMessage[]} messages - Current conversation messages
 * @property {any} context - Execution context
 * @property {number} stepNumber - Current step number
 * @property {Array} [pendingApprovals] - Pending tool approval requests
 * @property {string} pendingApprovals[].toolName - Name of tool awaiting approval
 * @property {any} pendingApprovals[].args - Arguments for the tool call
 * @property {boolean} pendingApprovals[].approved - Whether approval was granted
 */
export interface RunState {
  agent: any; // Agent<any, any> - circular dependency resolved at runtime
  messages: ModelMessage[];
  context: any;
  stepNumber: number;
  pendingApprovals?: Array<{
    toolName: string;
    args: any;
    approved: boolean;
  }>;
}

/**
 * Context wrapper passed to tools and guardrails during execution.
 * 
 * @template TContext - Type of the context object
 * 
 * @property {TContext} context - Request-scoped context (dependency injection)
 * @property {Agent} agent - The agent currently executing
 * @property {ModelMessage[]} messages - Current conversation history
 * @property {Usage} usage - Token usage tracker for the current run
 * 
 * @example
 * ```typescript
 * const tool = tool({
 *   description: 'Get user data',
 *   execute: async (args, wrapper: RunContextWrapper<MyContext>) => {
 *     const { context, agent, messages, usage } = wrapper;
 *     return await context.database.getUser(args.id);
 *   }
 * });
 * ```
 */
export interface RunContextWrapper<TContext> {
  context: TContext;
  agent: any; // Agent<TContext, any> - circular dependency resolved at runtime
  messages: ModelMessage[];
  usage: Usage;
}

// ============================================
// SESSION MANAGEMENT
// ============================================

/**
 * Session interface for maintaining conversation history across agent runs.
 * 
 * @template TContextType - Type of context stored in the session
 * 
 * @property {string} id - Unique identifier for this session
 * @property {Function} getHistory - Load conversation history from storage
 * @property {Function} addMessages - Add new messages to the session
 * @property {Function} clear - Clear session history
 * @property {Function} getMetadata - Get session metadata/context
 * @property {Function} updateMetadata - Update session metadata
 * 
 * @example
 * ```typescript
 * const session = new MemorySession('user-123');
 * await run(agent, 'Hello', { session });
 * 
 * const history = await session.getHistory();
 * console.log(history.length); // Includes all messages
 * ```
 */
export interface Session<_TContextType = any> {
  id: string;
  getHistory(): Promise<ModelMessage[]>;
  addMessages(messages: ModelMessage[]): Promise<void>;
  clear(): Promise<void>;
  getMetadata(): Promise<Record<string, any>>;
  updateMetadata(metadata: Record<string, any>): Promise<void>;
}

// ============================================
// GUARDRAILS
// ============================================

/**
 * Guardrail for validating input or output content.
 * 
 * @template TContext - Type of context available to validation
 * 
 * @property {string} name - Unique identifier for the guardrail
 * @property {'input' | 'output'} type - Whether this validates input or output
 * @property {Function} validate - Validation function that returns a result
 * @param {string} content - Content to validate
 * @param {RunContextWrapper} context - Execution context
 * @returns {Promise<GuardrailResult> | GuardrailResult} Validation result
 * 
 * @example
 * ```typescript
 * const lengthGuard: Guardrail = {
 *   name: 'length-check',
 *   type: 'output',
 *   validate: (content) => ({
 *     passed: content.length < 1000,
 *     message: content.length >= 1000 ? 'Too long' : undefined
 *   })
 * };
 * ```
 */
export interface Guardrail<TContext = any> {
  name: string;
  type: 'input' | 'output';
  validate: (
    content: string,
    context: RunContextWrapper<TContext>
  ) => Promise<GuardrailResult> | GuardrailResult;
}

/**
 * Result of a guardrail validation.
 * 
 * @property {boolean} passed - Whether validation passed
 * @property {string} [message] - Error message if validation failed
 * @property {Record<string, any>} [metadata] - Additional metadata about the validation
 */
export interface GuardrailResult {
  passed: boolean;
  message?: string;
  metadata?: Record<string, any>;
}

