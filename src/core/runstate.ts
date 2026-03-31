/**
 * Agent Run State Management
 * 
 * @module core/runstate
 * @description
 * Production-grade state container for agent execution lifecycle.
 * 
 * **Core Capabilities**:
 * - Stateful agent execution
 * - Type-safe state transitions
 * - Message history management
 * - Agent context tracking
 * - Metrics aggregation
 * 
 * **State Machine**:
 * - `next_step_run_again`: Continue execution
 * - `next_step_handoff`: Transfer to another agent
 * - `next_step_final_output`: Execution complete
 * 
 * **Architecture**:
 * Provides a clean abstraction over agent execution state,
 * enabling features like pause/resume, debugging, and
 * complex multi-agent coordination patterns.
 * 
 * @author Tawk.to
 * @license MIT
 * @version 3.0.0
 */

import type { Agent } from './agent';
import { convertToModelMessages, type ModelMessage, type UIMessage } from 'ai';
import { Usage } from './usage';

/**
 * Convert input messages to ModelMessage format.
 * Handles both UIMessage[] and ModelMessage[] inputs.
 * In AI SDK v6, convertToModelMessages is async.
 *
 * @param messages - Input messages (UIMessage[] or ModelMessage[])
 * @returns Promise<ModelMessage[]>
 */
async function toModelMessages(messages: unknown[]): Promise<ModelMessage[]> {
  // Check if this looks like UIMessage[] (has 'id' property typical of UIMessage)
  const isUIMessages = messages.length > 0 &&
    typeof messages[0] === 'object' &&
    messages[0] !== null &&
    'id' in messages[0];

  if (isUIMessages) {
    // Convert UIMessage[] to ModelMessage[] (async in AI SDK v6)
    return await convertToModelMessages(messages as UIMessage[]);
  }

  // Already ModelMessage[] format - return as-is
  return messages as ModelMessage[];
}

/** Constants for next step type values */
export const NextStepType = {
  RUN_AGAIN: 'next_step_run_again',
  HANDOFF: 'next_step_handoff',
  FINAL_OUTPUT: 'next_step_final_output',
} as const;

/**
 * Discriminated union for next step transitions
 * Enables type-safe state machine for agent execution
 */
export type NextStep =
  | { type: typeof NextStepType.RUN_AGAIN }
  | { type: typeof NextStepType.HANDOFF; newAgent: Agent<any, any>; reason?: string; context?: string }
  | { type: typeof NextStepType.FINAL_OUTPUT; output: string };

/**
 * Individual step result with tool outcomes
 */
export interface StepResult {
  stepNumber: number;
  agentName: string;
  toolCalls: Array<{
    toolName: string;
    args: any;
    result: any;
  }>;
  text?: string;
  finishReason?: string;
  timestamp: number;
}

/**
 * Agent execution metrics for observability
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
  startTime: number;
  endTime?: number;
}

/**
 * Tracks tool usage per agent for reset logic
 */
export class AgentToolUseTracker {
  private agentToTools = new Map<Agent<any, any>, string[]>();

  addToolUse(agent: Agent<any, any>, toolNames: string[]): void {
    this.agentToTools.set(agent, toolNames);
  }

  hasUsedTools(agent: Agent<any, any>): boolean {
    return this.agentToTools.has(agent);
  }

  getToolsUsed(agent: Agent<any, any>): string[] {
    return this.agentToTools.get(agent) || [];
  }

  toJSON(): Record<string, string[]> {
    return Object.fromEntries(
      Array.from(this.agentToTools.entries()).map(([agent, toolNames]) => [
        agent.name,
        toolNames,
      ])
    );
  }
}

/**
 * RunState - Encapsulates all state for an agent execution
 * 
 * This is the core of the agentic architecture. It maintains:
 * - Current agent and execution context
 * - Message history and generated items
 * - Step tracking and metrics
 * - Tracing spans and metadata
 * 
 * @template TContext - Type of context object
 * @template TAgent - Type of agent being executed
 */
export class RunState<TContext = any, TAgent extends Agent<TContext, any> = Agent<any, any>> {
  // Core execution state
  public currentAgent: TAgent;
  public originalInput: string | ModelMessage[];
  public messages: ModelMessage[];
  public context: TContext;
  public maxTurns: number;
  public currentTurn: number;
  public currentStep?: NextStep;

  // Step and metric tracking
  public steps: StepResult[] = [];
  public agentMetrics: Map<string, AgentMetric> = new Map();
  public toolUseTracker: AgentToolUseTracker = new AgentToolUseTracker();

  // Token usage tracking
  public usage: Usage = new Usage();

  // Handoff tracking
  public handoffChain: string[] = [];
  private handoffChainSet: Set<string> = new Set();

  // Tracing
  public trace?: any;
  public currentAgentSpan?: any;

  // Internal state
  public stepNumber: number = 0;
  private startTime: number;

  // Token budget tracking
  public _tokenBudget?: any;
  public _toolsDisabledDueToTokenLimit: boolean = false;


  /**
   * Async factory — use this when input may be UIMessage[] (requires async conversion in AI SDK v6).
   * For string or ModelMessage[] input, the constructor can still be used directly.
   */
  static async create<TC = any, TA extends Agent<TC, any> = Agent<any, any>>(
    agent: TA,
    input: string | ModelMessage[],
    context: TC,
    maxTurns: number = 50
  ): Promise<RunState<TC, TA>> {
    const messages = Array.isArray(input)
      ? await toModelMessages(input)
      : [{ role: 'user' as const, content: input }];
    return new RunState(agent, input, context, maxTurns, messages);
  }

  constructor(
    agent: TAgent,
    input: string | ModelMessage[],
    context: TContext,
    maxTurns: number = 50,
    messages?: ModelMessage[]
  ) {
    this.currentAgent = agent;
    this.originalInput = input;
    // Use pre-converted messages if provided, otherwise assume input is already ModelMessage[] or string
    this.messages = messages ?? (
      Array.isArray(input)
        ? (input as ModelMessage[])
        : [{ role: 'user' as const, content: input }]
    );
    this.context = context;
    this.maxTurns = maxTurns;
    this.currentTurn = 0;
    this.startTime = Date.now();

    // Initialize handoff chain with starting agent
    this.handoffChain.push(agent.name);
    this.handoffChainSet.add(agent.name);
  }

  /**
   * Record a step in the execution
   */
  recordStep(step: StepResult): void {
    this.steps.push(step);
    this.stepNumber++;
  }

  /**
   * Update agent metrics
   */
  updateAgentMetrics(
    agentName: string,
    tokens: { input: number; output: number; total: number },
    toolCallCount: number = 0
  ): void {
    const existing = this.agentMetrics.get(agentName);
    
    if (existing) {
      existing.turns++;
      existing.tokens.input += tokens.input;
      existing.tokens.output += tokens.output;
      existing.tokens.total += tokens.total;
      existing.toolCalls += toolCallCount;
      existing.endTime = Date.now();
      existing.duration = existing.endTime - existing.startTime;
    } else {
      const now = Date.now();
      this.agentMetrics.set(agentName, {
        agentName,
        turns: 1,
        tokens: {
          input: tokens.input,
          output: tokens.output,
          total: tokens.total,
        },
        toolCalls: toolCallCount,
        duration: 0,
        startTime: now,
      });
    }
  }

  /**
   * Track a handoff to a new agent
   */
  trackHandoff(agentName: string): void {
    if (!this.handoffChainSet.has(agentName)) {
      this.handoffChain.push(agentName);
      this.handoffChainSet.add(agentName);
    }
  }

  /**
   * Get total execution duration
   */
  getDuration(): number {
    return Date.now() - this.startTime;
  }

  /**
   * Convert to a serializable format for persistence
   */
  toJSON(): any {
    return {
      currentAgent: this.currentAgent.name,
      originalInput: this.originalInput,
      messages: this.messages,
      context: this.context,
      maxTurns: this.maxTurns,
      currentTurn: this.currentTurn,
      currentStep: this.currentStep,
      steps: this.steps,
      agentMetrics: Array.from(this.agentMetrics.values()),
      toolUseTracker: this.toolUseTracker.toJSON(),
      usage: this.usage.toJSON(),
      handoffChain: this.handoffChain,
      stepNumber: this.stepNumber,
      duration: this.getDuration(),
    };
  }

  /**
   * Check if we've exceeded max turns
   */
  isMaxTurnsExceeded(): boolean {
    return this.currentTurn >= this.maxTurns;
  }

  /**
   * Increment turn counter
   */
  incrementTurn(): void {
    this.currentTurn++;
  }
}

/**
 * Result of a single turn/step execution
 * Used internally by the runner to manage state transitions
 */
export class SingleStepResult {
  constructor(
    public originalInput: string | ModelMessage[],
    public messages: ModelMessage[],
    public preStepMessages: ModelMessage[],
    public newMessages: ModelMessage[],
    public nextStep: NextStep,
    public stepResult?: StepResult
  ) {}
}

// ============================================
// LEGACY COMPATIBILITY TYPES
// ============================================

/**
 * @deprecated Use ModelMessage from 'ai' instead
 */
export type RunMessageItem = ModelMessage;

/**
 * @deprecated Use StepResult instead
 */
export interface RunToolCallItem {
  type: 'tool_call';
  toolName: string;
  args: any;
  result: any;
}

/**
 * @deprecated Use StepResult instead
 */
export interface RunToolResultItem {
  type: 'tool_result';
  toolName: string;
  result: any;
}

/**
 * @deprecated Use StepResult instead
 */
export interface RunHandoffCallItem {
  type: 'handoff_call';
  agentName: string;
  reason?: string;
}

/**
 * @deprecated Use StepResult instead
 */
export interface RunHandoffOutputItem {
  type: 'handoff_output';
  agentName: string;
  output: any;
}

/**
 * @deprecated Use StepResult instead
 */
export interface RunGuardrailItem {
  type: 'guardrail';
  name: string;
  passed: boolean;
  message?: string;
}

/**
 * @deprecated Union type for legacy compatibility
 */
export type RunItem =
  | RunMessageItem
  | RunToolCallItem
  | RunToolResultItem
  | RunHandoffCallItem
  | RunHandoffOutputItem
  | RunGuardrailItem;

/**
 * @deprecated Use discriminated union types
 */
export type RunItemType =
  | 'message'
  | 'tool_call'
  | 'tool_result'
  | 'handoff_call'
  | 'handoff_output'
  | 'guardrail';

/**
 * @deprecated Use response types from AI SDK
 */
export interface ModelResponse {
  text?: string;
  toolCalls?: Array<{
    toolName: string;
    args: any;
    toolCallId?: string;
  }>;
  finishReason?: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  response?: {
    messages: ModelMessage[];
  };
}
