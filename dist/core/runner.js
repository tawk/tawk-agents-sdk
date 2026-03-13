"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgenticRunner = exports.TokenBudgetTracker = exports.TokenLimitExceededError = void 0;
exports.run = run;
const ai_1 = require("ai");
const runstate_1 = require("./runstate");
const execution_1 = require("./execution");
const langfuse_1 = require("../lifecycle/langfuse");
const context_1 = require("../tracing/context");
const lifecycle_1 = require("../lifecycle");
/** Error thrown when agent run exceeds token budget */
class TokenLimitExceededError extends Error {
    constructor(options) {
        const { estimatedTokens, maxTokens, usedTokens } = options;
        super(`Token limit exceeded: estimated request (${estimatedTokens} tokens) would exceed ` +
            `budget (${maxTokens} max, ${usedTokens} already used, ${maxTokens - usedTokens} remaining)`);
        this.name = 'TokenLimitExceededError';
        this.estimatedTokens = estimatedTokens;
        this.maxTokens = maxTokens;
        this.usedTokens = usedTokens;
    }
}
exports.TokenLimitExceededError = TokenLimitExceededError;
/**
 * Token budget tracker
 */
class TokenBudgetTracker {
    constructor(options) {
        this.estimatedContextTokens = 0;
        this.alreadyUsedTokens = 0;
        this.hasReachedLimit = false;
        this.maxTokens = options.maxTokens;
        this.tokenizerFn = options.tokenizerFn;
        this.imageTokenizerFn = options.imageTokenizerFn || (() => 2840);
        this.reservedResponseTokens = options.reservedResponseTokens ?? 1500;
        this.alreadyUsedTokens = options.alreadyUsedTokens ?? 0;
    }
    isEnabled() {
        return this.maxTokens !== undefined;
    }
    async estimateTokens(content) {
        const text = typeof content === 'string' ? content : JSON.stringify(content);
        return await this.tokenizerFn(text);
    }
    async estimateMessageTokens(content) {
        if (typeof content === 'string') {
            return await this.estimateTokens(content);
        }
        if (Array.isArray(content)) {
            let total = 0;
            for (const part of content) {
                if (part && typeof part === 'object' && 'type' in part && part.type === 'image') {
                    total += await this.imageTokenizerFn(part);
                }
                else {
                    total += await this.estimateTokens(part);
                }
            }
            return total;
        }
        return await this.estimateTokens(content);
    }
    setInitialContext(tokens) {
        this.estimatedContextTokens = tokens;
    }
    addTokens(tokens) {
        this.estimatedContextTokens += tokens;
    }
    getTotalTokens() {
        return this.alreadyUsedTokens + this.estimatedContextTokens;
    }
    getRemainingBudget() {
        if (!this.maxTokens)
            return Infinity;
        return this.maxTokens - this.getTotalTokens() - this.reservedResponseTokens;
    }
    canAddMessage(messageTokens) {
        if (!this.maxTokens)
            return true;
        if (this.hasReachedLimit)
            return false;
        const wouldUse = this.getTotalTokens() + messageTokens;
        const wouldRemain = this.maxTokens - wouldUse;
        return wouldRemain >= this.reservedResponseTokens;
    }
    isInitialContextExceeded() {
        if (!this.maxTokens)
            return false;
        return this.getTotalTokens() + this.reservedResponseTokens > this.maxTokens;
    }
    markLimitReached() {
        this.hasReachedLimit = true;
    }
    getStats() {
        return {
            estimated: this.estimatedContextTokens,
            used: this.alreadyUsedTokens,
            total: this.getTotalTokens(),
            max: this.maxTokens,
            remaining: this.getRemainingBudget(),
        };
    }
}
exports.TokenBudgetTracker = TokenBudgetTracker;
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
class AgenticRunner extends lifecycle_1.RunHooks {
    constructor(options = {}) {
        super();
        this.options = options;
    }
    /**
     * Execute an agent run with true agentic patterns
     *
     * @param agent - The agent to execute
     * @param input - User input
     * @param options - Run options
     * @returns Run result
     */
    async execute(agent, input, options = {}) {
        const mergedOptions = { ...this.options, ...options };
        const context = mergedOptions.context || {};
        const maxTurns = mergedOptions.maxTurns || 50;
        // Initialize run state
        const state = new runstate_1.RunState(agent, input, context, maxTurns);
        // Auto-initialize Langfuse tracing
        (0, langfuse_1.isLangfuseEnabled)();
        // Get or create trace
        let trace = (0, context_1.getCurrentTrace)();
        if (!trace && (0, langfuse_1.isLangfuseEnabled)()) {
            const initialInput = typeof input === 'string'
                ? input
                : input.find((m) => m.role === 'user')?.content || input;
            trace = (0, langfuse_1.createTrace)({
                name: `Agent Run`,
                input: initialInput,
                metadata: {
                    initialAgent: agent.name,
                    maxTurns,
                },
                tags: ['agent', 'run', 'agentic'],
            });
        }
        state.trace = trace;
        // Run everything within trace context so spans nest properly
        return await (0, context_1.runWithTraceContext)(trace, async () => {
            // Run input guardrails
            await this.runInputGuardrails(agent, state);
            // Emit agent_start event
            const contextWrapper = this.getContextWrapper(agent, state);
            this.emit('agent_start', contextWrapper, agent);
            agent.emit('agent_start', contextWrapper, agent);
            try {
                return await this.executeAgentLoop(agent, state, contextWrapper, maxTurns);
            }
            catch (error) {
                if (state.currentAgentSpan) {
                    state.currentAgentSpan.end({
                        output: { error: String(error) },
                        level: 'ERROR',
                    });
                }
                throw error;
            }
        });
    }
    /**
     * Main agent execution loop
     */
    async executeAgentLoop(agent, state, contextWrapper, maxTurns) {
        try {
            // Main agentic execution loop
            while (!state.isMaxTurnsExceeded()) {
                state.incrementTurn();
                // Create agent span if needed
                // IMPORTANT: Create spans directly from TRACE to maintain sibling hierarchy
                if (!state.currentAgentSpan || state.currentAgentSpan._agentName !== state.currentAgent.name) {
                    if (state.currentAgentSpan) {
                        // End previous agent span with accumulated token usage
                        const prevAgentName = state.currentAgentSpan._agentName;
                        const prevAgentMetrics = prevAgentName ? state.agentMetrics.get(prevAgentName) : null;
                        state.currentAgentSpan.end({
                            usage: prevAgentMetrics ? {
                                input: prevAgentMetrics.tokens.input,
                                output: prevAgentMetrics.tokens.output,
                                total: prevAgentMetrics.tokens.total
                            } : undefined
                        });
                    }
                    // Create span as direct child of trace to maintain proper hierarchy
                    // This makes all agents siblings instead of nested
                    const agentSpan = state.trace?.span({
                        name: `Agent: ${state.currentAgent.name}`,
                        input: { messages: (0, langfuse_1.formatMessagesForLangfuse)(state.messages) },
                        metadata: {
                            agentName: state.currentAgent.name,
                            tools: Object.keys(state.currentAgent._tools || {}),
                            subagents: state.currentAgent.subagents.map((a) => a.name),
                            turn: state.currentTurn,
                        },
                    });
                    state.currentAgentSpan = agentSpan;
                    if (agentSpan) {
                        agentSpan._agentName = state.currentAgent.name;
                        // Update context span for nested generations/tools
                        (0, context_1.setCurrentSpan)(agentSpan);
                    }
                }
                // Get system instructions
                const systemMessage = await state.currentAgent.getInstructions(contextWrapper);
                // Get model
                const model = state.currentAgent._model;
                const toolsDisabledDueToTokenLimit = state._toolsDisabledDueToTokenLimit;
                const tools = toolsDisabledDueToTokenLimit ? {} : state.currentAgent._tools;
                const estimatedResponseTokens = state.currentAgent._modelSettings?.responseTokens ?? 1024;
                const tokenBudget = new TokenBudgetTracker({
                    maxTokens: state.currentAgent._modelSettings?.maxTokens,
                    tokenizerFn: state.currentAgent._tokenizerFn,
                    imageTokenizerFn: state.currentAgent._imageTokenizerFn,
                    reservedResponseTokens: estimatedResponseTokens,
                    alreadyUsedTokens: 0, // Don't count previous usage - only current context matters
                });
                if (tokenBudget.isEnabled()) {
                    let estimatedInputTokens = await tokenBudget.estimateTokens(systemMessage);
                    for (const msg of state.messages) {
                        estimatedInputTokens += await tokenBudget.estimateMessageTokens(msg.content);
                    }
                    if (tools && Object.keys(tools).length > 0) {
                        estimatedInputTokens += await tokenBudget.estimateTokens(tools);
                    }
                    tokenBudget.setInitialContext(estimatedInputTokens);
                    if (tokenBudget.isInitialContextExceeded()) {
                        // Token limit exceeded - try to return last assistant output instead of erroring
                        let lastAssistantOutput = null;
                        for (let i = state.messages.length - 1; i >= 0; i--) {
                            const message = state.messages[i];
                            if (message.role === 'assistant') {
                                if (typeof message.content === 'string') {
                                    lastAssistantOutput = message.content;
                                    break;
                                }
                                // Handle array content (e.g., with tool calls)
                                if (Array.isArray(message.content)) {
                                    for (const part of message.content) {
                                        const contentPart = part;
                                        if (contentPart.type === 'text' && contentPart.text) {
                                            lastAssistantOutput = contentPart.text;
                                            break;
                                        }
                                    }
                                    if (lastAssistantOutput) {
                                        break;
                                    }
                                }
                            }
                        }
                        if (lastAssistantOutput) {
                            // Return the last output even though it may have failed guardrails
                            // Better to return something than to error out
                            if (state.currentAgentSpan) {
                                state.currentAgentSpan.end({
                                    output: lastAssistantOutput,
                                    metadata: {
                                        reason: 'token_limit_exceeded',
                                        guardrailBypassed: true
                                    }
                                });
                            }
                            if (state.trace) {
                                state.trace.update({
                                    output: lastAssistantOutput,
                                    metadata: {
                                        tokenLimitExceeded: true,
                                        guardrailBypassed: true
                                    }
                                });
                            }
                            await this.flushTraces();
                            return {
                                finalOutput: lastAssistantOutput,
                                messages: state.messages,
                                steps: state.steps,
                                state,
                                metadata: {
                                    totalTokens: state.usage.totalTokens,
                                    promptTokens: state.usage.inputTokens,
                                    completionTokens: state.usage.outputTokens,
                                    finishReason: 'token_limit_exceeded',
                                    totalToolCalls: state.steps.reduce((sum, s) => sum + s.toolCalls.length, 0),
                                    handoffChain: state.handoffChain.length > 0 ? state.handoffChain : undefined,
                                    agentMetrics: Array.from(state.agentMetrics.values()),
                                    duration: state.getDuration(),
                                },
                            };
                        }
                        // No previous output to return - throw error
                        const stats = tokenBudget.getStats();
                        throw new TokenLimitExceededError({
                            estimatedTokens: stats.total,
                            maxTokens: stats.max,
                            usedTokens: stats.used
                        });
                    }
                }
                state._tokenBudget = tokenBudget;
                // Create GENERATION (not span) for LLM call - this properly tracks tokens in Langfuse
                const generation = state.currentAgentSpan?.generation({
                    name: `LLM Generation: ${state.currentAgent.name}`,
                    model: (0, langfuse_1.extractModelName)(model),
                    modelParameters: {
                        temperature: state.currentAgent._modelSettings?.temperature,
                        topP: state.currentAgent._modelSettings?.topP,
                        maxTokens: state.currentAgent._modelSettings?.responseTokens,
                    },
                    input: {
                        system: systemMessage,
                        messages: state.messages.map(m => {
                            if (typeof m.content === 'string') {
                                return { role: m.role, content: m.content };
                            }
                            return { role: m.role, content: JSON.stringify(m.content) };
                        }),
                        tools: Object.keys(tools || {})
                    },
                    metadata: {
                        agentName: state.currentAgent.name,
                        turn: state.currentTurn,
                        modelName: (0, langfuse_1.extractModelName)(model),
                        toolCount: Object.keys(tools || {}).length
                    }
                });
                // Wrap tool execute functions to bridge contextWrapper and add Langfuse tracing.
                // AI SDK v5 auto-executes tools with execute functions inside generateText.
                // By wrapping them, we get tracing + context passing in a single execution.
                const toolExecutionMeta = new Map();
                const wrappedTools = {};
                for (const [name, tool] of Object.entries(tools)) {
                    if (!tool.execute) {
                        wrappedTools[name] = tool;
                        continue;
                    }
                    const originalExecute = tool.execute;
                    wrappedTools[name] = {
                        ...tool,
                        execute: async (args, aiSdkOptions) => {
                            const toolCallId = aiSdkOptions?.toolCallId || `${name}_${Date.now()}`;
                            const metaKey = toolCallId;
                            // Check if tool requires approval before executing
                            const needsApproval = await (0, execution_1.checkToolNeedsApproval)(tool, contextWrapper);
                            if (needsApproval) {
                                toolExecutionMeta.set(metaKey, { duration: 0, needsApproval: true });
                                return 'Tool execution requires approval';
                            }
                            const argsRecord = (args ?? {});
                            const argsKeys = Object.keys(argsRecord);
                            const span = (0, context_1.createContextualSpan)(`Tool: ${name}`, {
                                input: args,
                                metadata: {
                                    toolName: name,
                                    toolCallId,
                                    agentName: state.currentAgent.name,
                                    argsReceived: argsKeys.length > 0,
                                    argsKeys,
                                },
                            });
                            const startTime = Date.now();
                            try {
                                const result = await originalExecute(args, contextWrapper);
                                const duration = Date.now() - startTime;
                                toolExecutionMeta.set(metaKey, { duration });
                                if (span) {
                                    let outputStr;
                                    try {
                                        outputStr = typeof result === 'string' ? result : JSON.stringify(result ?? null);
                                    }
                                    catch {
                                        outputStr = '[unserializable tool result]';
                                    }
                                    span.end({ output: outputStr });
                                }
                                return result;
                            }
                            catch (error) {
                                const normalizedError = error instanceof Error ? error : new Error(String(error));
                                const duration = Date.now() - startTime;
                                toolExecutionMeta.set(metaKey, { duration, error: normalizedError });
                                if (span) {
                                    span.end({ output: normalizedError.message, level: 'ERROR' });
                                }
                                throw error;
                            }
                        },
                    };
                }
                // Call model — AI SDK will auto-execute tools via our wrapped execute functions
                const modelResponse = await (0, ai_1.generateText)({
                    model: model,
                    system: systemMessage,
                    messages: state.messages,
                    tools: wrappedTools,
                    temperature: state.currentAgent._modelSettings?.temperature,
                    topP: state.currentAgent._modelSettings?.topP,
                    maxOutputTokens: state.currentAgent._modelSettings?.responseTokens,
                    presencePenalty: state.currentAgent._modelSettings?.presencePenalty,
                    frequencyPenalty: state.currentAgent._modelSettings?.frequencyPenalty,
                    providerOptions: state.currentAgent._modelSettings?.providerOptions,
                });
                // End generation with proper usage tracking
                if (generation) {
                    const usage = modelResponse.usage || {};
                    generation.end({
                        output: {
                            text: modelResponse.text,
                            toolCalls: modelResponse.toolCalls?.length || 0,
                            finishReason: modelResponse.finishReason
                        },
                        // Use Langfuse's usage parameter to track tokens properly
                        usage: {
                            input: usage.inputTokens || 0,
                            output: usage.outputTokens || 0,
                            total: usage.totalTokens || 0,
                        },
                        metadata: {
                            finishReason: modelResponse.finishReason,
                        }
                    });
                }
                // Execute single step with AUTONOMOUS decision making
                const stepResult = await (0, execution_1.executeSingleStep)(state.currentAgent, state, contextWrapper, modelResponse, toolExecutionMeta);
                // Update state with new messages
                state.messages = stepResult.messages;
                if (tokenBudget.hasReachedLimit) {
                    state._toolsDisabledDueToTokenLimit = true;
                }
                // Handle next step based on AGENT's decision
                const nextStep = stepResult.nextStep;
                if (nextStep.type === runstate_1.NextStepType.FINAL_OUTPUT) {
                    // Agent decided to finish - check guardrails first
                    const guardrailResult = await this.runOutputGuardrails(state.currentAgent, state, nextStep.output);
                    // Determine if we can retry: guardrail failed AND we have token budget for feedback
                    let canRetry = false;
                    if (!guardrailResult.passed) {
                        // Recalculate context size with current messages (including assistant's response)
                        let currentContextTokens = await state.currentAgent._tokenizerFn(systemMessage);
                        for (const msg of state.messages) {
                            const msgContent = typeof msg.content === 'string'
                                ? msg.content
                                : JSON.stringify(msg.content);
                            currentContextTokens += await state.currentAgent._tokenizerFn(msgContent);
                        }
                        const feedbackTokens = await state.currentAgent._tokenizerFn(guardrailResult.feedback || '');
                        const totalAfterFeedback = currentContextTokens + feedbackTokens;
                        const maxTokens = state.currentAgent._modelSettings?.maxTokens;
                        const responseBuffer = state.currentAgent._modelSettings?.responseTokens ?? 1024;
                        // Can retry if: total context + feedback + response buffer fits in max tokens
                        if (maxTokens) {
                            canRetry = (totalAfterFeedback + responseBuffer) <= maxTokens;
                        }
                        else {
                            canRetry = true; // No limit set, always allow retry
                        }
                    }
                    if (!guardrailResult.passed && canRetry) {
                        // Guardrail failed but we can retry - add feedback and loop
                        state.messages.push({
                            role: 'system',
                            content: guardrailResult.feedback || 'Please regenerate your response.'
                        });
                        continue;
                    }
                    // Either guardrail passed OR we can't retry (token limit) - return current output
                    // Parse output if schema provided
                    let finalOutput;
                    if (state.currentAgent._outputSchema) {
                        try {
                            const parsed = JSON.parse(nextStep.output);
                            finalOutput = state.currentAgent._outputSchema.parse(parsed);
                        }
                        catch {
                            finalOutput = nextStep.output;
                        }
                    }
                    else {
                        finalOutput = nextStep.output;
                    }
                    // IMPORTANT: For user-facing output, always ensure it's a string
                    // If outputSchema returned an object, stringify it
                    const finalOutputString = typeof finalOutput === 'string'
                        ? finalOutput
                        : JSON.stringify(finalOutput, null, 2);
                    // End agent span with accumulated token usage
                    if (state.currentAgentSpan) {
                        const agentMetrics = state.agentMetrics.get(state.currentAgent.name);
                        state.currentAgentSpan.end({
                            output: finalOutputString,
                            usage: agentMetrics ? {
                                input: agentMetrics.tokens.input,
                                output: agentMetrics.tokens.output,
                                total: agentMetrics.tokens.total
                            } : undefined
                        });
                    }
                    // Emit agent_end event
                    this.emit('agent_end', contextWrapper, agent, finalOutputString);
                    agent.emit('agent_end', contextWrapper, finalOutputString);
                    // Update trace with final output and aggregated metadata
                    if (state.trace) {
                        state.trace.update({
                            output: finalOutputString, // Just the text, not an object
                            metadata: {
                                agentPath: state.handoffChain.length > 0 ? state.handoffChain : [agent.name],
                                success: true,
                                totalTokens: state.usage.totalTokens,
                                promptTokens: state.usage.inputTokens,
                                completionTokens: state.usage.outputTokens,
                                totalCost: (state.usage.totalTokens || 0) * 0.00000015, // ~$0.15 per 1M tokens
                                duration: state.getDuration(),
                                agentCount: state.agentMetrics.size,
                                totalToolCalls: state.steps.reduce((sum, s) => sum + (s.toolCalls?.length || 0), 0),
                                totalTransfers: state.handoffChain.length,
                                finishReason: stepResult.stepResult?.finishReason,
                            }
                        });
                    }
                    // Flush Langfuse traces before returning
                    await this.flushTraces();
                    // Return final result (always ensure finalOutput is a string)
                    return {
                        finalOutput: finalOutputString,
                        messages: state.messages,
                        steps: state.steps,
                        state,
                        metadata: {
                            totalTokens: state.usage.totalTokens,
                            promptTokens: state.usage.inputTokens,
                            completionTokens: state.usage.outputTokens,
                            finishReason: stepResult.stepResult?.finishReason,
                            totalToolCalls: state.steps.reduce((sum, s) => sum + s.toolCalls.length, 0),
                            handoffChain: state.handoffChain.length > 0 ? state.handoffChain : undefined,
                            agentMetrics: Array.from(state.agentMetrics.values()),
                            duration: state.getDuration(),
                        },
                    };
                }
                else if (nextStep.type === runstate_1.NextStepType.HANDOFF) {
                    // Agent decided to transfer to another agent
                    if (state.currentAgentSpan) {
                        const agentMetrics = state.agentMetrics.get(state.currentAgent.name);
                        state.currentAgentSpan.end({
                            output: {
                                transferTo: nextStep.newAgent.name,
                                transferReason: nextStep.reason,
                            },
                            metadata: {
                                type: 'transfer',
                                isolated: true, // Context isolation enabled
                                // Include usage in metadata for Langfuse visibility
                                usage: agentMetrics ? {
                                    input: agentMetrics.tokens.input,
                                    output: agentMetrics.tokens.output,
                                    total: agentMetrics.tokens.total
                                } : undefined
                            },
                            usage: agentMetrics ? {
                                input: agentMetrics.tokens.input,
                                output: agentMetrics.tokens.output,
                                total: agentMetrics.tokens.total
                            } : undefined
                        });
                        state.currentAgentSpan = undefined;
                    }
                    // Track transfer in chain
                    state.trackHandoff(nextStep.newAgent.name);
                    // Switch to new agent
                    const previousAgent = state.currentAgent;
                    state.currentAgent = nextStep.newAgent;
                    // Emit transfer event
                    this.emit('agent_handoff', contextWrapper, previousAgent, nextStep.newAgent);
                    previousAgent.emit('agent_handoff', contextWrapper, nextStep.newAgent);
                    // CONTEXT ISOLATION: Reset messages to only user query
                    // Extract original user query
                    const originalUserMessage = Array.isArray(state.originalInput)
                        ? state.originalInput.filter((m) => m.role === 'user')
                        : [{ role: 'user', content: state.originalInput }];
                    // Reset messages to just the user query
                    state.messages = [...originalUserMessage];
                    state._toolsDisabledDueToTokenLimit = false;
                    // Add transfer context as system message (optional: remove if too verbose)
                    if (nextStep.reason) {
                        state.messages.push({
                            role: 'system',
                            content: `[Transfer] Transferred to ${nextStep.newAgent.name}. Reason: ${nextStep.reason}${nextStep.context ? `. Context: ${nextStep.context}` : ''}`,
                        });
                    }
                    // Continue loop with new agent (now with isolated context)
                    continue;
                }
                else if (nextStep.type === runstate_1.NextStepType.INTERRUPTION) {
                    // Agent needs human approval
                    state.pendingInterruptions = nextStep.interruptions;
                    // Return with interruption state
                    return {
                        finalOutput: null,
                        messages: state.messages,
                        steps: state.steps,
                        state,
                        metadata: {
                            totalTokens: state.usage.totalTokens,
                            promptTokens: state.usage.inputTokens,
                            completionTokens: state.usage.outputTokens,
                            finishReason: 'interrupted',
                            totalToolCalls: state.steps.reduce((sum, s) => sum + s.toolCalls.length, 0),
                            handoffChain: state.handoffChain,
                            agentMetrics: Array.from(state.agentMetrics.values()),
                            duration: state.getDuration(),
                        },
                    };
                }
                else if (nextStep.type === runstate_1.NextStepType.RUN_AGAIN) {
                    // Agent decided to continue
                    continue;
                }
            }
            // Max turns exceeded
            throw new Error(`Max turns (${maxTurns}) exceeded`);
        }
        catch (error) {
            if (state.currentAgentSpan) {
                state.currentAgentSpan.end({
                    output: { error: String(error) },
                    level: 'ERROR',
                });
            }
            throw error;
        }
    }
    /**
     * Get context wrapper for tool execution
     */
    getContextWrapper(agent, state) {
        return {
            context: state.context,
            agent,
            messages: state.messages,
            usage: state.usage,
        };
    }
    /**
     * Run input guardrails with tracing at TRACE level
     */
    async runInputGuardrails(agent, state) {
        const guardrails = agent._guardrails.filter((g) => g.type === 'input');
        if (guardrails.length === 0)
            return;
        const lastUserMessage = [...state.messages]
            .reverse()
            .find((m) => m.role === 'user');
        if (!lastUserMessage || typeof lastUserMessage.content !== 'string')
            return;
        const contextWrapper = this.getContextWrapper(agent, state);
        // Calculate lengths upfront for logging
        const inputContent = lastUserMessage.content;
        const characterLength = inputContent.length;
        const tokenCount = await agent._tokenizerFn(inputContent);
        // Create parent span for all input guardrails UNDER the agent span
        const guardrailsSpan = state.currentAgentSpan?.span({
            name: 'Input Guardrails',
            metadata: {
                type: 'input',
                guardrailCount: guardrails.length,
                agentName: agent.name,
                characterLength,
                tokenCount
            }
        });
        try {
            for (const guardrail of guardrails) {
                // Create individual guardrail span under guardrailsSpan
                const guardrailSpan = guardrailsSpan?.span({
                    name: `Guardrail: ${guardrail.name}`,
                    input: {
                        content: inputContent,
                        characterLength,
                        tokenCount
                    },
                    metadata: {
                        guardrailName: guardrail.name,
                        guardrailType: 'input',
                        agentName: agent.name
                    }
                });
                try {
                    const result = await guardrail.validate(inputContent, contextWrapper);
                    if (guardrailSpan) {
                        guardrailSpan.end({
                            output: {
                                passed: result.passed,
                                message: result.message,
                                metadata: result.metadata
                            },
                            level: result.passed ? 'DEFAULT' : 'WARNING'
                        });
                    }
                    if (!result.passed) {
                        if (guardrailsSpan)
                            guardrailsSpan.end({ level: 'ERROR' });
                        throw new Error(`Input guardrail "${guardrail.name}" failed: ${result.message}`);
                    }
                }
                catch (error) {
                    if (guardrailSpan) {
                        guardrailSpan.end({
                            output: { error: String(error) },
                            level: 'ERROR'
                        });
                    }
                    throw error;
                }
            }
            // Close parent guardrails span
            if (guardrailsSpan) {
                guardrailsSpan.end({
                    output: { allPassed: true },
                    metadata: { totalChecks: guardrails.length }
                });
            }
        }
        catch (error) {
            if (guardrailsSpan)
                guardrailsSpan.end({ level: 'ERROR' });
            throw error;
        }
    }
    /**
     * Run output guardrails with retry mechanism and tracing at TRACE level
     * Returns specific, actionable feedback when validation fails
     */
    async runOutputGuardrails(agent, state, output) {
        const guardrails = agent._guardrails.filter((g) => g.type === 'output');
        if (guardrails.length === 0)
            return { passed: true };
        const contextWrapper = this.getContextWrapper(agent, state);
        // Calculate lengths upfront for logging
        const characterLength = output.length;
        const tokenCount = await agent._tokenizerFn(output);
        // Create parent span for all output guardrails UNDER the agent span
        const guardrailsSpan = state.currentAgentSpan?.span({
            name: 'Output Guardrails',
            metadata: {
                type: 'output',
                guardrailCount: guardrails.length,
                agentName: agent.name,
                characterLength,
                tokenCount
            }
        });
        for (const guardrail of guardrails) {
            // Create individual guardrail span under guardrailsSpan
            const guardrailSpan = guardrailsSpan?.span({
                name: `Guardrail: ${guardrail.name}`,
                input: {
                    content: output,
                    characterLength,
                    tokenCount
                },
                metadata: {
                    guardrailName: guardrail.name,
                    guardrailType: 'output',
                    agentName: agent.name
                }
            });
            try {
                const result = await guardrail.validate(output, contextWrapper);
                if (guardrailSpan) {
                    guardrailSpan.end({
                        output: {
                            passed: result.passed,
                            message: result.message,
                            willRetry: !result.passed,
                            metadata: result.metadata
                        },
                        level: result.passed ? 'DEFAULT' : 'WARNING'
                    });
                }
                if (!result.passed) {
                    let actionableFeedback = result.message || 'Validation failed';
                    if (guardrail.name === 'length_check') {
                        const metadata = result.metadata;
                        let currentLength;
                        if (metadata.unit === 'characters') {
                            currentLength = metadata.characterLength;
                        }
                        else {
                            currentLength = metadata.tokenCount;
                        }
                        const overagePercent = Math.round((currentLength / metadata.maxLength - 1) * 100);
                        if (metadata.unit === 'tokens') {
                            const currentWords = Math.round(metadata.tokenCount * 0.75);
                            const maxWords = Math.round(metadata.maxLength * 0.75);
                            actionableFeedback = `YOUR PREVIOUS RESPONSE WAS TOO LONG (~${currentWords} words, limit ~${maxWords} words, ${overagePercent}% over). YOU MUST REWRITE IT SHORTER. Take your previous response above and rewrite it with these changes:\n- Remove filler words and redundant phrases\n- Use shorter sentences\n- Keep only essential information\n- If listing items, use minimal descriptions\nOutput ONLY the shortened rewrite, nothing else.`;
                        }
                        else if (metadata.unit === 'characters') {
                            const currentChars = metadata.characterLength;
                            const maxChars = metadata.maxLength;
                            actionableFeedback = `YOUR PREVIOUS RESPONSE WAS TOO LONG (${currentChars} chars, limit ${maxChars}, ${overagePercent}% over). YOU MUST REWRITE IT SHORTER. Take your previous response above and rewrite it with these changes:\n- Remove filler words\n- Use abbreviations where possible\n- Keep only the most critical info\n- If listing items, show fewer with minimal text\nOutput ONLY the shortened rewrite, nothing else.`;
                        }
                        else {
                            const currentWords = output.split(/\s+/).length;
                            actionableFeedback = `YOUR PREVIOUS RESPONSE WAS TOO LONG (${currentWords} words, limit ${metadata.maxLength}). YOU MUST REWRITE IT SHORTER. Take your previous response above and rewrite it more concisely. Output ONLY the shortened rewrite.`;
                        }
                    }
                    else if (guardrail.name === 'pii_check' || result.message?.includes('PII')) {
                        actionableFeedback = `Your response contains personally identifiable information (PII). Please rewrite your response without including any personal data, email addresses, phone numbers, or sensitive information.`;
                    }
                    else if (result.message?.includes('profanity') || result.message?.includes('inappropriate')) {
                        actionableFeedback = `Your response contains inappropriate content. Please rewrite your response using professional and appropriate language.`;
                    }
                    else if (result.message?.includes('format')) {
                        actionableFeedback = `Your response format is invalid. ${result.message}. Please reformat your response to match the required structure.`;
                    }
                    else {
                        // Generic actionable feedback
                        actionableFeedback = `Your response failed validation: ${result.message}. Please revise your response to address this issue without fetching additional data.`;
                    }
                    if (guardrailsSpan) {
                        guardrailsSpan.end({
                            output: {
                                someFailed: true,
                                feedback: actionableFeedback
                            },
                            level: 'WARNING'
                        });
                    }
                    return {
                        passed: false,
                        feedback: actionableFeedback
                    };
                }
                if (guardrailSpan)
                    guardrailSpan.end();
            }
            catch (error) {
                if (guardrailSpan) {
                    guardrailSpan.end({
                        output: { error: String(error) },
                        level: 'ERROR'
                    });
                }
                // Return error as feedback
                if (guardrailsSpan)
                    guardrailsSpan.end({ level: 'ERROR' });
                return {
                    passed: false,
                    feedback: `Guardrail check failed: ${String(error)}. Please regenerate your response.`
                };
            }
        }
        // Close parent guardrails span
        if (guardrailsSpan) {
            guardrailsSpan.end({
                output: { allPassed: true },
                metadata: { totalChecks: guardrails.length }
            });
        }
        return { passed: true };
    }
    /**
     * Flush Langfuse traces to ensure they're sent
     */
    async flushTraces() {
        if (!(0, langfuse_1.isLangfuseEnabled)())
            return;
        try {
            const langfuse = (0, langfuse_1.getLangfuse)();
            if (langfuse) {
                await langfuse.flushAsync();
            }
        }
        catch (_error) {
            // Silently fail - tracing errors should not break execution
        }
    }
}
exports.AgenticRunner = AgenticRunner;
/**
 * Run an agent with true agentic patterns
 *
 * @param agent - Agent to execute
 * @param input - User input
 * @param options - Run options
 * @returns Run result
 */
async function run(agent, input, options = {}) {
    const runner = new AgenticRunner(options);
    return await runner.execute(agent, input, options);
}
//# sourceMappingURL=runner.js.map