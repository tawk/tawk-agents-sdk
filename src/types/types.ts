/**
 * Enhanced Types for Full Feature Support
 * 
 * Includes: Error types, Background results, Tracing, MCP
 */

import { z } from 'zod';
import type { ModelMessage } from 'ai';

// Re-export ModelMessage for convenience
export type Message = ModelMessage;

// ============================================
// BACKGROUND RESULT SUPPORT
// ============================================

/**
 * Background result - tool execution that continues in background
 * Useful for long-running operations that don't block agent flow
 */
export class BackgroundResult<T> {
  readonly isBackground = true;
  constructor(public promise: Promise<T>) {}
}

export function backgroundResult<T>(promise: Promise<T>): BackgroundResult<T> {
  return new BackgroundResult(promise);
}

export function isBackgroundResult(value: any): value is BackgroundResult<any> {
  return value && typeof value === 'object' && value.isBackground === true;
}

// ============================================
// ERROR TYPES
// ============================================

export class MaxTurnsExceededError extends Error {
  constructor(maxTurns: number) {
    super(`Maximum number of turns (${maxTurns}) exceeded`);
    this.name = 'MaxTurnsExceededError';
  }
}

export class GuardrailTripwireTriggered extends Error {
  constructor(
    public guardrailName: string,
    message: string,
    public metadata?: Record<string, any>
  ) {
    super(message);
    this.name = 'GuardrailTripwireTriggered';
  }
}

export class ToolExecutionError extends Error {
  constructor(
    public toolName: string,
    message: string,
    public originalError?: Error
  ) {
    super(message);
    this.name = 'ToolExecutionError';
  }
}

export class HandoffError extends Error {
  constructor(
    public fromAgent: string,
    public toAgent: string,
    message: string,
    public originalError?: Error
  ) {
    super(message);
    this.name = 'HandoffError';
  }
}

// ============================================
// TRACING TYPES (for Langfuse integration)
// ============================================

export interface TraceOptions {
  traceId?: string;
  userId?: string;
  sessionId?: string;
  metadata?: Record<string, any>;
  tags?: string[];
}

export interface TraceEvent {
  type: 'agent-start' | 'agent-end' | 'tool-start' | 'tool-end' | 'handoff' | 'error' | 'guardrail';
  timestamp: number;
  data: any;
}

export type TraceCallback = (event: TraceEvent) => void | Promise<void>;

// ============================================
// MCP (Model Context Protocol) TYPES
// ============================================

export interface MCPServerConfig {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  tools?: string[]; // Specific tools to enable from this server
}

export interface MCPTool {
  name: string;
  serverName: string;
  description: string;
  inputSchema: any;
}

export interface MCPToolCall {
  toolName: string;
  serverName: string;
  args: any;
  result?: any;
}

// ============================================
// ENHANCED METADATA TYPES
// ============================================

export interface StepMetadata {
  duration?: number;
  tokens?: {
    total: number;
    prompt: number;
    completion: number;
  };
  timestamp?: number;
  agentName?: string;
  handoffInfo?: {
    fromAgent: string;
    toAgent: string;
    reason?: string;
  };
}

export interface RunMetadata {
  totalTokens?: number;
  promptTokens?: number;
  completionTokens?: number;
  finishReason?: string;
  duration?: number;
  agentName?: string;
  handoffCount?: number;
  totalSteps?: number;
  toolCallsCount?: number;
  guardrailsRan?: number;
  traceId?: string;
}

// ============================================
// STRUCTURED OUTPUT TYPES
// ============================================

export interface StructuredOutputConfig<T> {
  schema: z.ZodSchema<T>;
  /**
   * How to handle validation errors
   */
  onValidationError?: 'throw' | 'retry' | 'ignore';
  /**
   * Maximum retry attempts for validation
   */
  maxRetries?: number;
}

// ============================================
// AGENT CONFIG WITH ALL FEATURES
// ============================================

export interface EnhancedAgentConfig<TContext = any, TOutput = string> {
  name: string;
  instructions: string | ((context: RunContextWrapper<TContext>) => string | Promise<string>);
  model?: any;
  tools?: Record<string, ToolDefinition>;
  handoffs?: Agent<TContext, any>[];
  guardrails?: Guardrail<TContext>[];
  
  // Structured output
  outputSchema?: z.ZodSchema<TOutput>;
  structuredOutput?: StructuredOutputConfig<TOutput>;
  
  // Loop control
  maxSteps?: number;
  maxTurns?: number; // Alias for maxSteps
  
  // Model settings
  modelSettings?: ModelSettings;
  
  // Callbacks
  onStepFinish?: (step: StepResult) => void | Promise<void>;
  shouldFinish?: (context: TContext, toolResults: any[]) => boolean;
  
  // MCP support
  mcpServers?: MCPServerConfig[];

  // Tracing
  tracing?: {
    enabled: boolean;
    callback?: TraceCallback;
    metadata?: Record<string, any>;
  };
}

export interface ModelSettings {
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  presencePenalty?: number;
  frequencyPenalty?: number;
}

export interface ToolDefinition {
  description: string;
  parameters?: z.ZodSchema<any>; // For backward compatibility
  inputSchema?: z.ZodSchema<any>; // AI SDK v5 standard
  execute: (args: any, context?: any) => Promise<any> | any | BackgroundResult<any>;

  // Optional: MCP tool info
  mcpServer?: string;
  
  /**
   * Optional: Control whether this tool is available for the current execution context
   * Can be a boolean or a function that returns a boolean (sync or async)
   * If false or function returns false, the tool will not be available to the model
   * 
   * @example
   * // Static enabled/disabled
   * enabled: true
   * 
   * @example
   * // Dynamic based on context
   * enabled: (ctx) => ctx.user.isPremium
   * 
   * @example
   * // Async check (e.g., database lookup)
   * enabled: async (ctx) => {
   *   const user = await getUser(ctx.userId);
   *   return user.tier === 'premium';
   * }
   */
  enabled?: boolean | ((context: RunContextWrapper<any>) => boolean | Promise<boolean>);
}

export interface RunContextWrapper<TContext> {
  context: TContext;
  agent: Agent<TContext, any>;
  messages: Message[];
  traceId?: string;
}

export interface Guardrail<TContext = any> {
  name: string;
  type: 'input' | 'output';
  validate: (
    content: string,
    context: RunContextWrapper<TContext>
  ) => Promise<GuardrailResult> | GuardrailResult;
}

export interface GuardrailResult {
  passed: boolean;
  message?: string;
  metadata?: Record<string, any>;
}

export interface StepResult {
  stepNumber: number;
  agentName: string;
  toolCalls: ToolCall[];
  text?: string;
  finishReason?: string;
  duration?: number;
  tokens?: {
    total: number;
    prompt: number;
    completion: number;
  };
  metadata?: StepMetadata;
}

export interface ToolCall {
  toolName: string;
  args: any;
  result?: any;
  id?: string;
}

export interface Agent<TContext = any, TOutput = string> {
  readonly name: string;
  getInstructions(context: RunContextWrapper<TContext>): Promise<string>;
  clone(overrides: Partial<EnhancedAgentConfig<TContext, TOutput>>): Agent<TContext, TOutput>;
  asTool(options?: { toolName?: string; toolDescription?: string }): ToolDefinition;
  
  // Internal access
  readonly _model: any;
  readonly _tools: Record<string, ToolDefinition>;
  readonly _guardrails: Guardrail<TContext>[];
  readonly _handoffs: Agent<TContext, any>[];
  readonly _outputSchema?: z.ZodSchema<TOutput>;
  readonly _maxSteps: number;
  readonly _modelSettings?: ModelSettings;
  readonly _onStepFinish?: (step: StepResult) => void | Promise<void>;
  readonly _shouldFinish?: (context: TContext, toolResults: any[]) => boolean;
  readonly _mcpServers?: MCPServerConfig[];
  readonly _tracing?: EnhancedAgentConfig<TContext, TOutput>['tracing'];
}

export interface RunOptions<TContext = any> {
  context?: TContext;
  session?: Session<TContext>;
  maxTurns?: number;
  
  // Tracing
  tracing?: TraceOptions;
  onTrace?: TraceCallback;

  // Metadata
  metadata?: Record<string, any>;
}

export interface RunResult<TOutput = string> {
  finalOutput: TOutput;
  messages: Message[];
  steps: StepResult[];
  state?: RunState;
  metadata: RunMetadata;
}

export interface RunState {
  agent: Agent<any, any>;
  messages: Message[];
  context: any;
  stepNumber: number;
  traceId?: string;
}

export interface Session<_TContext = any> {
  id: string;
  getHistory(): Promise<Message[]>;
  addMessages(messages: Message[]): Promise<void>;
  clear(): Promise<void>;
  getMetadata(): Promise<Record<string, any>>;
  updateMetadata(metadata: Record<string, any>): Promise<void>;
}

export interface StreamResult<TOutput = string> {
  textStream: AsyncIterable<string>;
  fullStream: AsyncIterable<StreamEvent>;
  completed: Promise<RunResult<TOutput>>;
}

export interface StreamEvent {
  type: 'text-delta' | 'tool-call' | 'tool-result' | 'step-finish' | 'finish' | 'error' | 'handoff' | 'trace';
  textDelta?: string;
  toolCall?: ToolCall;
  toolResult?: any;
  step?: StepResult;
  error?: Error;
  handoff?: {
    fromAgent: string;
    toAgent: string;
    reason?: string;
  };
  trace?: TraceEvent;
}
