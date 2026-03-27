/**
 * Agent Class Implementation
 *
 * @module core/agent/agent-class
 * @description
 * Core Agent class providing autonomous AI agent capabilities.
 *
 * **Features**:
 * - Flexible configuration with sensible defaults
 * - Support for tools and subagents (transfers)
 * - Dynamic or static instructions
 * - Guardrails for safety
 * - Structured output parsing
 * - Event hooks for lifecycle management
 * - Agent-as-tool pattern support
 *
 * @author Tawk.to
 * @license MIT
 * @version 1.0.0
 */
import type { LanguageModel } from 'ai';
import { z } from 'zod';
import { AgentHooks } from '../../lifecycle';
import type { AgentConfig, CoreTool, Guardrail, ImageTokenizerFn, RunContextWrapper, StepResult, TokenizerFn } from './types';
/** Default tokenizer: 4 chars ≈ 1 token */
export declare const defaultTokenizerFn: TokenizerFn;
/** Default image tokenizer: fixed 2840 tokens per image (matches legacy estimate) */
export declare const defaultImageTokenizerFn: ImageTokenizerFn;
/**
 * Set the default language model for all agents.
 * Agents without an explicit model will use this default.
 *
 * @param {LanguageModel} model - The language model to use as default
 *
 * @example
 * ```typescript
 * import { openai } from '@ai-sdk/openai';
 * import { setDefaultModel } from 'tawk-agents-sdk';
 *
 * setDefaultModel(openai('gpt-4'));
 *
 * // Now all agents use GPT-4 by default
 * const agent = new Agent({
 *   name: 'assistant',
 *   instructions: 'You are helpful.'
 *   // model is optional now
 * });
 * ```
 */
export declare function setDefaultModel(model: LanguageModel): void;
/**
 * Get the current default language model.
 * Throws an error if no default model has been set.
 *
 * @returns {LanguageModel} The default language model
 * @throws {Error} If no default model is configured
 * @internal
 */
export declare function getDefaultModel(): LanguageModel;
/**
 * Agent class representing an autonomous AI agent.
 *
 * @template TContext - Type of context object passed to tools and guardrails
 * @template TOutput - Type of the agent's output (defaults to string)
 *
 * @example Basic Agent
 * ```typescript
 * import { Agent } from 'tawk-agents-sdk';
 * import { openai } from '@ai-sdk/openai';
 *
 * const agent = new Agent({
 *   name: 'Assistant',
 *   instructions: 'You are a helpful AI assistant.',
 *   model: openai('gpt-4')
 * });
 * ```
 *
 * @example Agent with Tools and Subagents
 * ```typescript
 * const specialist = new Agent({
 *   name: 'Specialist',
 *   instructions: 'You are a domain specialist.',
 *   tools: { calculator, search }
 * });
 *
 * const coordinator = new Agent({
 *   name: 'Coordinator',
 *   instructions: 'You coordinate tasks.',
 *   subagents: [specialist]
 * });
 * ```
 */
export declare class Agent<TContext = any, TOutput = string> extends AgentHooks<TContext, TOutput> {
    /** Unique identifier for the agent */
    readonly name: string;
    /** Description of when to transfer to this agent */
    transferDescription?: string;
    /** @deprecated Use transferDescription instead */
    handoffDescription?: string;
    /** System prompt or dynamic instructions function */
    private instructions;
    /** Language model for generation */
    private model;
    /** Available tools for the agent */
    private tools;
    /** Sub-agents this agent can transfer to */
    private _subagents;
    /** Input/output validation rules */
    private guardrails;
    /** Schema for structured output */
    private outputSchema?;
    /** Maximum steps before stopping */
    private maxSteps;
    /** Model generation settings */
    private modelSettings?;
    /** Callback after each step */
    private onStepFinish?;
    /** Custom termination condition */
    private shouldFinish?;
    /** Enable TOON encoding for token reduction */
    private useTOON?;
    /** Tokenizer function for calculating token counts */
    private tokenizerFn;
    /** Image tokenizer function for calculating image token counts */
    private imageTokenizerFn;
    /** Cached static instructions for performance */
    private cachedInstructions?;
    /**
     * Create a new Agent instance.
     *
     * @param {AgentConfig<TContext, TOutput>} config - Agent configuration
     *
     * @throws {Error} If no model is provided and no default model is set
     */
    constructor(config: AgentConfig<TContext, TOutput>);
    /**
     * Create an agent instance with better TypeScript inference.
     * Alternative to using the constructor directly.
     *
     * @template TContext - Type of context object
     * @template TOutput - Type of output
     * @param {AgentConfig<TContext, TOutput>} config - Agent configuration
     * @returns {Agent<TContext, TOutput>} New agent instance
     *
     * @example
     * ```typescript
     * const agent = Agent.create({
     *   name: 'assistant',
     *   instructions: 'You are helpful.',
     *   model: openai('gpt-4')
     * });
     * ```
     */
    static create<TContext = any, TOutput = string>(config: AgentConfig<TContext, TOutput>): Agent<TContext, TOutput>;
    /**
     * Get the list of sub-agents this agent can transfer to.
     *
     * @returns {Agent<TContext, any>[]} Array of sub-agents
     */
    get subagents(): Agent<TContext, any>[];
    /**
     * Set the list of sub-agents this agent can transfer to.
     * Automatically updates transfer tools when changed.
     *
     * @param {Agent<TContext, any>[]} agents - Array of sub-agents
     */
    set subagents(agents: Agent<TContext, any>[]);
    /**
     * Get handoffs (legacy/backward compatibility).
     * @deprecated Use subagents instead
     */
    get handoffs(): Agent<TContext, any>[];
    /**
     * Set handoffs (legacy/backward compatibility).
     * @deprecated Use subagents instead
     */
    set handoffs(agents: Agent<TContext, any>[]);
    /**
     * Setup transfer tools for delegating to sub-agents.
     * Creates transfer_to_X tools for each subagent.
     *
     * @private
     */
    private _setupTransferTools;
    /**
     * Get system instructions for the agent.
     * Supports both static strings and dynamic functions.
     * Caches static instructions for optimal performance.
     *
     * @param {RunContextWrapper<TContext>} context - Execution context
     * @returns {Promise<string>} System instructions
     * @internal
     */
    getInstructions(context: RunContextWrapper<TContext>): Promise<string>;
    /**
     * Create a clone of this agent with optional property overrides.
     * Useful for creating specialized variants of a base agent.
     *
     * @param {Partial<AgentConfig<TContext, TOutput>>} overrides - Properties to override
     * @returns {Agent<TContext, TOutput>} New agent instance
     *
     * @example
     * ```typescript
     * const baseAgent = new Agent({
     *   name: 'assistant',
     *   instructions: 'You are helpful.'
     * });
     *
     * const specializedAgent = baseAgent.clone({
     *   name: 'specialist',
     *   instructions: 'You are a domain specialist.'
     * });
     * ```
     */
    clone(overrides: Partial<AgentConfig<TContext, TOutput>>): Agent<TContext, TOutput>;
    /**
     * Convert this agent into a tool that can be used by other agents.
     * Enables the "agent as tool" pattern for hierarchical agent systems.
     *
     * @param {Object} [options] - Tool configuration options
     * @param {string} [options.toolName] - Custom tool name (defaults to agent_{agentName})
     * @param {string} [options.toolDescription] - Custom tool description
     * @returns {CoreTool} Tool definition that delegates to this agent
     *
     * @example
     * ```typescript
     * const researchAgent = new Agent({
     *   name: 'researcher',
     *   instructions: 'You research topics.'
     * });
     *
     * const coordinator = new Agent({
     *   name: 'coordinator',
     *   instructions: 'You coordinate tasks.',
     *   tools: {
     *     research: researchAgent.asTool({
     *       toolDescription: 'Research a topic'
     *     })
     *   }
     * });
     * ```
     */
    asTool(options?: {
        toolName?: string;
        toolDescription?: string;
    }): CoreTool;
    /**
     * Internal accessors for the runner and execution modules.
     * Not part of the public API.
     * @internal
     */
    get _model(): LanguageModel;
    get _tools(): Record<string, CoreTool>;
    get _guardrails(): Guardrail<TContext>[];
    get _outputSchema(): z.ZodType<TOutput, z.ZodTypeDef, TOutput> | undefined;
    get _maxSteps(): number;
    get _modelSettings(): {
        temperature?: number;
        topP?: number;
        responseTokens?: number;
        maxTokens?: number;
        presencePenalty?: number;
        frequencyPenalty?: number;
        toolChoice?: "auto" | "required" | "none" | ((turn: number) => "auto" | "required" | "none");
        providerOptions?: Record<string, Record<string, unknown>>;
    } | undefined;
    get _tokenizerFn(): TokenizerFn;
    get _imageTokenizerFn(): ImageTokenizerFn;
    get _onStepFinish(): ((step: StepResult) => void | Promise<void>) | undefined;
    get _shouldFinish(): ((context: TContext, toolResults: any[]) => boolean) | undefined;
    get _useTOON(): boolean | undefined;
}
//# sourceMappingURL=agent-class.d.ts.map