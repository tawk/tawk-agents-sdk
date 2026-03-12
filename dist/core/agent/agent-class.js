"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.Agent = exports.defaultImageTokenizerFn = exports.defaultTokenizerFn = void 0;
exports.setDefaultModel = setDefaultModel;
exports.getDefaultModel = getDefaultModel;
const zod_1 = require("zod");
const lifecycle_1 = require("../../lifecycle");
const transfers_1 = require("../transfers");
// ============================================
// DEFAULT MODEL MANAGEMENT
// ============================================
let defaultModel = null;
/** Default tokenizer: 4 chars ≈ 1 token */
const defaultTokenizerFn = (text) => {
    return Math.ceil(text.length / 4);
};
exports.defaultTokenizerFn = defaultTokenizerFn;
/** Default image tokenizer: fixed 2840 tokens per image (matches legacy estimate) */
const defaultImageTokenizerFn = () => {
    return 2840;
};
exports.defaultImageTokenizerFn = defaultImageTokenizerFn;
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
function setDefaultModel(model) {
    defaultModel = model;
}
/**
 * Get the current default language model.
 * Throws an error if no default model has been set.
 *
 * @returns {LanguageModel} The default language model
 * @throws {Error} If no default model is configured
 * @internal
 */
function getDefaultModel() {
    if (!defaultModel) {
        throw new Error('No default model set. Call setDefaultModel() or provide a model in AgentConfig.');
    }
    return defaultModel;
}
// ============================================
// AGENT CLASS
// ============================================
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
class Agent extends lifecycle_1.AgentHooks {
    /**
     * Create a new Agent instance.
     *
     * @param {AgentConfig<TContext, TOutput>} config - Agent configuration
     *
     * @throws {Error} If no model is provided and no default model is set
     */
    constructor(config) {
        super(); // Initialize EventEmitter for hooks
        /** Sub-agents this agent can transfer to */
        this._subagents = [];
        this.name = config.name;
        // Support both new (transferDescription) and legacy (handoffDescription) terminology
        this.transferDescription = config.transferDescription || config.handoffDescription;
        this.handoffDescription = config.transferDescription || config.handoffDescription;
        this.instructions = config.instructions;
        this.model = config.model || getDefaultModel();
        this.tools = config.tools || {};
        // Support both new (subagents) and legacy (handoffs) terminology
        this._subagents = config.subagents || config.handoffs || [];
        this.guardrails = config.guardrails || [];
        this.outputSchema = config.outputSchema || config.outputType;
        this.maxSteps = config.maxSteps || 10;
        this.modelSettings = config.modelSettings;
        this.onStepFinish = config.onStepFinish;
        this.shouldFinish = config.shouldFinish;
        this.useTOON = config.useTOON || false;
        this.tokenizerFn = config.tokenizerFn || exports.defaultTokenizerFn;
        this.imageTokenizerFn = config.imageTokenizerFn || exports.defaultImageTokenizerFn;
        // Setup transfer tools for subagents
        this._setupTransferTools();
    }
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
    static create(config) {
        return new Agent(config);
    }
    // ============================================
    // SUBAGENTS MANAGEMENT
    // ============================================
    /**
     * Get the list of sub-agents this agent can transfer to.
     *
     * @returns {Agent<TContext, any>[]} Array of sub-agents
     */
    get subagents() {
        return this._subagents;
    }
    /**
     * Set the list of sub-agents this agent can transfer to.
     * Automatically updates transfer tools when changed.
     *
     * @param {Agent<TContext, any>[]} agents - Array of sub-agents
     */
    set subagents(agents) {
        // Remove old transfer/handoff tools
        const oldToolNames = Object.keys(this.tools).filter(name => name.startsWith('transfer_to_') || name.startsWith('handoff_to_'));
        for (const name of oldToolNames) {
            delete this.tools[name];
        }
        // Update subagents
        this._subagents = agents || [];
        // Re-setup transfer tools
        this._setupTransferTools();
    }
    /**
     * Get handoffs (legacy/backward compatibility).
     * @deprecated Use subagents instead
     */
    get handoffs() {
        return this._subagents;
    }
    /**
     * Set handoffs (legacy/backward compatibility).
     * @deprecated Use subagents instead
     */
    set handoffs(agents) {
        this.subagents = agents;
    }
    /**
     * Setup transfer tools for delegating to sub-agents.
     * Creates transfer_to_X tools for each subagent.
     *
     * @private
     */
    _setupTransferTools() {
        const transferTools = (0, transfers_1.createTransferTools)(this, this._subagents);
        Object.assign(this.tools, transferTools);
    }
    // ============================================
    // INSTRUCTIONS
    // ============================================
    /**
     * Get system instructions for the agent.
     * Supports both static strings and dynamic functions.
     * Caches static instructions for optimal performance.
     *
     * @param {RunContextWrapper<TContext>} context - Execution context
     * @returns {Promise<string>} System instructions
     * @internal
     */
    async getInstructions(context) {
        // Return cached if static instructions
        if (this.cachedInstructions !== undefined) {
            return this.cachedInstructions;
        }
        if (typeof this.instructions === 'function') {
            // Always call function as context might change
            return await this.instructions(context);
        }
        // Cache static string instructions for performance
        this.cachedInstructions = this.instructions;
        return this.cachedInstructions;
    }
    // ============================================
    // AGENT MANIPULATION
    // ============================================
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
    clone(overrides) {
        return new Agent({
            name: overrides.name ?? this.name,
            instructions: overrides.instructions ?? this.instructions,
            model: overrides.model ?? this.model,
            tools: overrides.tools ?? this.tools,
            subagents: overrides.subagents ?? this.subagents,
            handoffs: overrides.handoffs ?? this.handoffs,
            guardrails: overrides.guardrails ?? this.guardrails,
            outputSchema: overrides.outputSchema ?? this.outputSchema,
            maxSteps: overrides.maxSteps ?? this.maxSteps,
            modelSettings: overrides.modelSettings ?? this.modelSettings,
            tokenizerFn: overrides.tokenizerFn ?? this.tokenizerFn,
            imageTokenizerFn: overrides.imageTokenizerFn ?? this.imageTokenizerFn,
            onStepFinish: overrides.onStepFinish ?? this.onStepFinish,
            shouldFinish: overrides.shouldFinish ?? this.shouldFinish,
            useTOON: overrides.useTOON ?? this.useTOON
        });
    }
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
    asTool(options = {}) {
        const _toolName = options.toolName || `agent_${this.name.toLowerCase().replace(/\s+/g, '_')}`;
        const toolDescription = options.toolDescription || `Delegate to ${this.name}`;
        return {
            description: toolDescription,
            inputSchema: zod_1.z.object({
                query: zod_1.z.string().describe('Query or request for the agent')
            }),
            execute: async (_args, _context) => {
                // Note: Actual implementation requires importing run() function
                // This will be resolved when the full module is assembled
                throw new Error('asTool requires run() function - will be resolved in final assembly');
            }
        };
    }
    // ============================================
    // INTERNAL ACCESSORS
    // ============================================
    /**
     * Internal accessors for the runner and execution modules.
     * Not part of the public API.
     * @internal
     */
    get _model() { return this.model; }
    get _tools() { return this.tools; }
    get _guardrails() { return this.guardrails; }
    get _outputSchema() { return this.outputSchema; }
    get _maxSteps() { return this.maxSteps; }
    get _modelSettings() { return this.modelSettings; }
    get _tokenizerFn() { return this.tokenizerFn; }
    get _imageTokenizerFn() { return this.imageTokenizerFn; }
    get _onStepFinish() { return this.onStepFinish; }
    get _shouldFinish() { return this.shouldFinish; }
    get _useTOON() { return this.useTOON; }
}
exports.Agent = Agent;
//# sourceMappingURL=agent-class.js.map