/**
 * Agent Execution Runner
 *
 * @module core/runner
 * @description
 * Production-grade agent execution engine implementing true agentic architecture.
 *
 * **Core Principles**:
 * - Agents drive their own execution lifecycle
 * - Parallel tool execution for optimal performance
 * - Autonomous decision-making (agent-controlled, not SDK-controlled)
 * - State management for interruption and resumption
 * - Seamless multi-agent coordination and transfers
 * - End-to-end observability with Langfuse tracing
 *
 * **Features**:
 * - Streaming support for real-time responses
 * - Input/output guardrails with automatic feedback
 * - Token usage tracking and optimization
 * - Comprehensive error handling
 * - Production-ready reliability
 *
 * @author Tawk.to
 * @license MIT
 * @version 1.0.0
 */
import { type ModelMessage } from 'ai';
import type { Agent } from './agent';
import { RunState } from './runstate';
import { RunHooks } from '../lifecycle';
/** Error thrown when agent run exceeds token budget */
export declare class TokenLimitExceededError extends Error {
    readonly estimatedTokens: number;
    readonly maxTokens: number;
    readonly usedTokens: number;
    constructor(options: {
        estimatedTokens: number;
        maxTokens: number;
        usedTokens: number;
    });
}
/**
 * Token budget tracker
 */
export declare class TokenBudgetTracker {
    private maxTokens;
    private tokenizerFn;
    private imageTokenizerFn;
    private estimatedContextTokens;
    private reservedResponseTokens;
    private alreadyUsedTokens;
    hasReachedLimit: boolean;
    constructor(options: {
        maxTokens?: number;
        tokenizerFn: (text: string) => number | Promise<number>;
        imageTokenizerFn?: (imagePart: object) => number | Promise<number>;
        reservedResponseTokens?: number;
        alreadyUsedTokens?: number;
    });
    isEnabled(): boolean;
    estimateTokens(content: string | object): Promise<number>;
    estimateMessageTokens(content: unknown): Promise<number>;
    setInitialContext(tokens: number): void;
    addTokens(tokens: number): void;
    getTotalTokens(): number;
    getRemainingBudget(): number;
    canAddMessage(messageTokens: number): boolean;
    isInitialContextExceeded(): boolean;
    markLimitReached(): void;
    getStats(): {
        estimated: number;
        used: number;
        total: number;
        max: number | undefined;
        remaining: number;
    };
}
export interface RunOptions<TContext = any> {
    context?: TContext;
    session?: any;
    maxTurns?: number;
    stream?: boolean;
    signal?: AbortSignal;
}
/**
 * Result of running an agent
 */
export interface RunResult<TOutput = string> {
    finalOutput: TOutput;
    messages: ModelMessage[];
    steps: any[];
    state: RunState;
    metadata: {
        totalTokens: number;
        promptTokens: number;
        completionTokens: number;
        finishReason?: string;
        totalToolCalls: number;
        handoffChain?: string[];
        agentMetrics: any[];
        duration: number;
    };
}
/**
 * Stream event types
 */
export type StreamEvent = {
    type: 'text-delta';
    textDelta: string;
} | {
    type: 'tool-call-start';
    toolName: string;
    toolCallId: string;
} | {
    type: 'tool-call';
    toolName: string;
    args: any;
    toolCallId: string;
} | {
    type: 'tool-result';
    toolName: string;
    result: any;
    toolCallId: string;
} | {
    type: 'agent-start';
    agentName: string;
} | {
    type: 'agent-end';
    agentName: string;
} | {
    type: 'transfer';
    from: string;
    to: string;
    reason: string;
} | {
    type: 'guardrail-check';
    guardrailName: string;
    passed: boolean;
} | {
    type: 'step-start';
    stepNumber: number;
} | {
    type: 'step-complete';
    stepNumber: number;
} | {
    type: 'finish';
    finishReason?: string;
};
/**
 * Stream result for streaming execution
 */
export interface StreamResult<TOutput = string> {
    textStream: AsyncIterable<string>;
    fullStream: AsyncIterable<StreamEvent>;
    completed: Promise<RunResult<TOutput>>;
}
/**
 * Runner - Orchestrates agent execution with true agentic patterns
 *
 * Key differences from old implementation:
 * 1. Agents decide when to continue/finish (not SDK)
 * 2. Tools execute in parallel (not sequential)
 * 3. Proper state management for interruption/resumption
 * 4. Agent-driven handoffs with context
 *
 * @template TContext - Type of context object
 * @template TOutput - Type of output
 */
export declare class AgenticRunner<TContext = any, TOutput = string> extends RunHooks<TContext, TOutput> {
    private options;
    constructor(options?: RunOptions<TContext>);
    /**
     * Execute an agent run with true agentic patterns
     *
     * @param agent - The agent to execute
     * @param input - User input
     * @param options - Run options
     * @returns Run result
     */
    execute(agent: Agent<TContext, TOutput>, input: string | ModelMessage[], options?: RunOptions<TContext>): Promise<RunResult<TOutput>>;
    /**
     * Main agent execution loop
     */
    private executeAgentLoop;
    /**
     * Get context wrapper for tool execution
     */
    private getContextWrapper;
    /**
     * Run input guardrails with tracing at TRACE level
     */
    private runInputGuardrails;
    /**
     * Run output guardrails with retry mechanism and tracing at TRACE level
     * Returns specific, actionable feedback when validation fails
     */
    private runOutputGuardrails;
    /**
     * Flush Langfuse traces to ensure they're sent
     */
    private flushTraces;
}
/**
 * Run an agent with true agentic patterns
 *
 * @param agent - Agent to execute
 * @param input - User input
 * @param options - Run options
 * @returns Run result
 */
export declare function run<TContext = any, TOutput = string>(agent: Agent<TContext, TOutput>, input: string | ModelMessage[], options?: RunOptions<TContext>): Promise<RunResult<TOutput>>;
//# sourceMappingURL=runner.d.ts.map