/**
 * Agent Type Definitions
 *
 * @module core/agent/types
 * @description
 * Core type definitions for the Tawk Agents SDK.
 *
 * @author Tawk.to
 * @license MIT
 * @version 3.0.0
 */

import type {
  ModelMessage,
  LanguageModel,
  Schema,
  JSONSchema7,
  ToolCallRepairFunction,
  StopCondition,
  PrepareStepFunction,
  ToolSet,
} from 'ai';
import type { z } from 'zod';
import type { Usage } from '../usage';

// ============================================
// TOKENIZER FUNCTION TYPE
// ============================================

/** Tokenizer function for estimating token counts. Can be sync or async. */
export type TokenizerFn = (text: string) => number | Promise<number>;

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
 * Tool definition compatible with AI SDK v6.
 */
export type CoreTool = {
  description?: string;
  inputSchema?: FlexibleInputSchema;
  execute: (args: any, context?: any) => Promise<any> | any;
  enabled?: boolean | ((context: any) => boolean | Promise<boolean>);
  /** Enable TOON encoding for this tool's results (overrides agent-level useTOON) */
  useTOON?: boolean;
};

// ============================================
// AGENT CONFIGURATION — GROUPED
// ============================================

/** Output configuration */
export interface AgentOutputConfig<TOutput = string> {
  /** Zod schema for structured output parsing */
  schema?: z.ZodSchema<TOutput>;
  /** Enable TOON encoding for tool results (~40% token reduction) */
  toon?: boolean;
}

/** Model tuning parameters */
export interface ModelSettings {
  temperature?: number;
  topP?: number;
  /** Max tokens per LLM response */
  responseTokens?: number;
  /** Total token budget for entire agent run (undefined = no limit) */
  maxTokens?: number;
  /** When set, pruneMessages() is applied before each model call */
  maxInputTokens?: number;
  presencePenalty?: number;
  frequencyPenalty?: number;
}

/** Execution behavior settings */
export interface ExecutionConfig {
  /** Maximum steps per generateText call (default: 10) */
  maxSteps?: number;
  /** Condition(s) for stopping multi-step execution */
  stopWhen?: StopCondition<ToolSet> | StopCondition<ToolSet>[];
  /** Limit available tools per step */
  activeTools?: string[];
  /** Dynamically adjust settings before each generation step */
  prepareStep?: PrepareStepFunction<ToolSet>;
  /** Auto-repair malformed tool call arguments */
  toolCallRepair?: ToolCallRepairFunction<ToolSet>;
  /** Custom tokenizer (default: 4 chars = 1 token) */
  tokenizer?: TokenizerFn;
}

/** Lifecycle hook callbacks */
export interface AgentHooksConfig<TContext = any> {
  /** Called after each step completes */
  onStepFinish?: (step: StepResult) => void | Promise<void>;
  /** Return true to stop execution early */
  shouldFinish?: (context: TContext, toolResults: any[]) => boolean;
}

/**
 * Agent configuration — clean, grouped structure.
 *
 * @template TContext - Type of context object passed to tools and guardrails
 * @template TOutput - Type of the agent's output (defaults to string)
 *
 * @example
 * ```typescript
 * const agent = new Agent({
 *   name: 'Assistant',
 *   instructions: 'You are a helpful assistant.',
 *   model: openai('gpt-4o'),
 *
 *   tools: { search, calculator },
 *   subagents: [billingAgent],
 *   guardrails: [contentSafety],
 *
 *   output: {
 *     schema: z.object({ answer: z.string() }),
 *     toon: true,
 *   },
 *
 *   modelSettings: {
 *     temperature: 0.7,
 *     maxTokens: 100000,
 *   },
 *
 *   execution: {
 *     maxSteps: 15,
 *     stopWhen: stepCountIs(5),
 *   },
 *
 *   hooks: {
 *     onStepFinish: (step) => console.log(step),
 *   },
 * });
 * ```
 */
export interface AgentConfig<TContext = any, TOutput = string> {
  // ─── Required ───
  name: string;
  instructions: string | ((context: RunContextWrapper<TContext>) => string | Promise<string>);
  model: LanguageModel;

  // ─── Capabilities ───
  tools?: Record<string, CoreTool>;
  subagents?: any[]; // Agent<TContext, any>[]
  transferDescription?: string;
  guardrails?: Guardrail<TContext>[];

  // ─── Configuration Groups ───
  output?: AgentOutputConfig<TOutput>;
  modelSettings?: ModelSettings;
  execution?: ExecutionConfig;
  hooks?: AgentHooksConfig<TContext>;
}

// ============================================
// EXECUTION OPTIONS
// ============================================

/**
 * Options for running an agent.
 */
export interface RunOptions<TContext = any> {
  context?: TContext;
  stream?: boolean;
  maxTurns?: number;
}

// ============================================
// EXECUTION RESULTS
// ============================================

/**
 * Result of running an agent.
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
 */
export interface StreamResult<TOutput = string> {
  textStream: AsyncIterable<string>;
  fullStream: AsyncIterable<StreamChunk>;
  completed: Promise<RunResult<TOutput>>;
}

/**
 * A single chunk in the streaming response.
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
 * Execution state for resuming a paused agent run.
 */
export interface RunState {
  currentAgent: any;
  messages: ModelMessage[];
  context: any;
  stepNumber: number;
}

/**
 * Context wrapper passed to tools and guardrails during execution.
 */
export interface RunContextWrapper<TContext> {
  context: TContext;
  agent: any;
  messages: ModelMessage[];
  usage: Usage;
}

// ============================================
// GUARDRAILS
// ============================================

/**
 * Guardrail for validating input or output content.
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
 */
export interface GuardrailResult {
  passed: boolean;
  message?: string;
  metadata?: Record<string, any>;
}
