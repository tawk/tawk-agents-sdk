"use strict";
/**
 * Agent Execution Engine
 * @module core/execution
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.executeToolsInParallel = executeToolsInParallel;
exports.processModelResponse = processModelResponse;
exports.determineNextStep = determineNextStep;
exports.executeSingleStep = executeSingleStep;
const runstate_1 = require("./runstate");
const context_1 = require("../tracing/context");
const TRANSFER_PREFIXES = ['transfer_to_', 'handoff_to_'];
const TOOL_EXECUTION_BATCH_SIZE = 3;
/**
 * Checks if a tool name is a transfer/handoff tool
 * @param toolName Tool name to check
 * @returns True if the tool is a transfer tool
 */
function isTransferTool(toolName) {
    for (const prefix of TRANSFER_PREFIXES) {
        if (toolName.startsWith(prefix)) {
            return true;
        }
    }
    return false;
}
/**
 * Extracts target agent name from transfer tool name
 * @param toolName Transfer tool name (e.g., "transfer_to_sales_agent")
 * @returns Agent name with underscores replaced by spaces
 */
function extractTargetAgentName(toolName) {
    for (const prefix of TRANSFER_PREFIXES) {
        if (toolName.startsWith(prefix)) {
            return toolName.slice(prefix.length).replace(/_/g, ' ');
        }
    }
    return toolName;
}
/**
 * Checks if a tool requires approval before execution
 * @param tool Tool to check
 * @param contextWrapper Execution context
 * @returns True if the tool needs approval
 */
async function checkToolNeedsApproval(tool, contextWrapper) {
    const enabled = tool.enabled;
    if (enabled === undefined || enabled === true) {
        return false;
    }
    if (enabled === false) {
        return true;
    }
    if (typeof enabled === 'function') {
        const isEnabled = await enabled(contextWrapper);
        return !isEnabled;
    }
    return false;
}
/**
 * Executes tool calls in parallel batches to reduce system strain
 * @param tools Available tools dictionary
 * @param toolCalls Tool calls to execute
 * @param contextWrapper Execution context
 * @returns Array of tool execution results
 */
async function executeToolsInParallel(tools, toolCalls, contextWrapper) {
    if (toolCalls.length === 0) {
        return [];
    }
    const results = [];
    let batch = [];
    for (const toolCall of toolCalls) {
        batch.push(executeSingleTool(tools, toolCall, contextWrapper));
        if (batch.length === TOOL_EXECUTION_BATCH_SIZE) {
            const batchResults = await Promise.all(batch);
            for (const batchResult of batchResults) {
                results.push(batchResult);
            }
            batch = [];
        }
    }
    if (batch.length > 0) {
        const batchResults = await Promise.all(batch);
        for (const batchResult of batchResults) {
            results.push(batchResult);
        }
    }
    return results;
}
/**
 * Executes a single tool call with tracing and error handling
 * @param tools Available tools dictionary
 * @param toolCall Tool call to execute
 * @param contextWrapper Execution context
 * @returns Tool execution result with duration and any errors
 */
async function executeSingleTool(tools, toolCall, contextWrapper) {
    const startTime = Date.now();
    const toolName = toolCall.toolName;
    const args = toolCall.args;
    const toolCallId = toolCall.toolCallId;
    const tool = tools[toolName];
    if (!tool) {
        return {
            toolName,
            toolCallId,
            args,
            result: null,
            error: new Error(`Tool ${toolName} not found`),
            duration: Date.now() - startTime,
        };
    }
    const needsApproval = await checkToolNeedsApproval(tool, contextWrapper);
    if (needsApproval) {
        return {
            toolName,
            toolCallId,
            args,
            result: null,
            duration: Date.now() - startTime,
            needsApproval: true,
            approved: false,
        };
    }
    const argsRecord = args;
    const argsKeys = Object.keys(argsRecord);
    const span = (0, context_1.createContextualSpan)(`Tool: ${toolName}`, {
        input: args,
        metadata: {
            toolName,
            agentName: contextWrapper.agent.name,
            argsReceived: argsKeys.length > 0,
            argsKeys,
        },
    });
    try {
        const result = await tool.execute(args, contextWrapper);
        if (span) {
            const outputString = typeof result === 'string' ? result : JSON.stringify(result);
            span.end({ output: outputString });
        }
        return {
            toolName,
            toolCallId,
            args,
            result,
            duration: Date.now() - startTime,
        };
    }
    catch (error) {
        const normalizedError = error instanceof Error ? error : new Error(String(error));
        if (span) {
            span.end({
                output: normalizedError.message,
                level: 'ERROR',
            });
        }
        return {
            toolName,
            toolCallId,
            args,
            result: null,
            error: normalizedError,
            duration: Date.now() - startTime,
        };
    }
}
/**
 * Processes model response and categorizes actions
 * @param response The result from generateText
 * @returns Processed response with categorized tool calls, handoffs, and messages
 */
function processModelResponse(response) {
    const toolCalls = [];
    const handoffRequests = [];
    const responseToolCalls = response.toolCalls ?? [];
    for (const responseToolCall of responseToolCalls) {
        const toolCall = responseToolCall;
        const toolName = toolCall.toolName;
        const toolCallId = toolCall.toolCallId;
        const rawInput = toolCall.input;
        let toolArgs;
        if (rawInput !== undefined && rawInput !== null && typeof rawInput === 'object') {
            toolArgs = rawInput;
        }
        else {
            toolArgs = {};
        }
        if (isTransferTool(toolName)) {
            const reason = typeof toolArgs.reason === 'string' && toolArgs.reason
                ? toolArgs.reason
                : 'Transfer requested';
            const context = typeof toolArgs.context === 'string' ? toolArgs.context : undefined;
            const handoff = {
                agentName: extractTargetAgentName(toolName),
                reason,
                context,
            };
            handoffRequests.push(handoff);
        }
        else {
            const extracted = {
                toolName,
                args: toolArgs,
                toolCallId,
            };
            toolCalls.push(extracted);
        }
    }
    const newMessages = [];
    const responseMessages = response.response?.messages;
    if (responseMessages && responseMessages.length > 0) {
        for (const responseMessage of responseMessages) {
            const message = responseMessage;
            if (message.role === 'tool') {
                continue;
            }
            if (message.role === 'assistant' && Array.isArray(message.content)) {
                const transformedContent = [];
                for (const contentPart of message.content) {
                    const part = contentPart;
                    if (part.type === 'tool-call') {
                        // AI SDK uses 'input', but 'args' is kept for backwards compatibility with older versions
                        const toolInput = part.input ?? part.args ?? {};
                        transformedContent.push({
                            ...part,
                            input: typeof toolInput === 'object' ? toolInput : {},
                        });
                    }
                    else {
                        transformedContent.push(part);
                    }
                }
                const transformedMessage = {
                    role: 'assistant',
                    content: transformedContent,
                };
                newMessages.push(transformedMessage);
            }
            else {
                newMessages.push(message);
            }
        }
    }
    else if (response.text) {
        const textMessage = {
            role: 'assistant',
            content: response.text,
        };
        newMessages.push(textMessage);
    }
    return {
        text: response.text,
        finishReason: response.finishReason,
        toolCalls,
        handoffRequests,
        newMessages,
    };
}
/**
 * Determines the next step based on agent's decision
 * @param agent Current agent
 * @param processed Processed model response
 * @param toolResults Tool execution results
 * @param context Execution context
 * @returns Next step decision
 */
async function determineNextStep(agent, processed, toolResults, context) {
    let needsApproval = false;
    for (const toolResult of toolResults) {
        if (toolResult.needsApproval && !toolResult.approved) {
            needsApproval = true;
            break;
        }
    }
    if (needsApproval) {
        const interruptions = [];
        for (const toolResult of toolResults) {
            if (toolResult.needsApproval && !toolResult.approved) {
                interruptions.push({
                    toolName: toolResult.toolName,
                    args: toolResult.args,
                    type: 'tool_approval',
                });
            }
        }
        return {
            type: runstate_1.NextStepType.INTERRUPTION,
            interruptions,
        };
    }
    if (processed.handoffRequests.length > 0) {
        const handoff = processed.handoffRequests[0];
        const targetAgentName = handoff.agentName.toLowerCase().replace(/\s+/g, '_');
        let targetAgent;
        for (const subagent of agent.handoffs) {
            if (subagent.name.toLowerCase().replace(/\s+/g, '_') === targetAgentName) {
                targetAgent = subagent;
                break;
            }
        }
        if (targetAgent) {
            return {
                type: runstate_1.NextStepType.HANDOFF,
                newAgent: targetAgent,
                reason: handoff.reason,
                context: handoff.context,
            };
        }
    }
    if (agent._shouldFinish) {
        const results = [];
        for (const toolResult of toolResults) {
            results.push(toolResult.result);
        }
        const shouldFinish = agent._shouldFinish(context, results);
        if (shouldFinish && processed.text) {
            return {
                type: runstate_1.NextStepType.FINAL_OUTPUT,
                output: processed.text,
            };
        }
    }
    const hasToolCalls = processed.toolCalls.length > 0;
    const hasText = processed.text !== '';
    const finishedReason = processed.finishReason === 'stop' || processed.finishReason === 'length';
    if (!hasToolCalls && hasText && finishedReason) {
        return {
            type: runstate_1.NextStepType.FINAL_OUTPUT,
            output: processed.text,
        };
    }
    return {
        type: runstate_1.NextStepType.RUN_AGAIN,
    };
}
/**
 * Executes a single agent step with autonomous decision making
 * @param agent Current agent
 * @param state Run state
 * @param contextWrapper Execution context wrapper
 * @param modelResponse Response from generateText
 * @returns Single step result with next step decision
 */
async function executeSingleStep(agent, state, contextWrapper, modelResponse) {
    const processed = processModelResponse(modelResponse);
    const toolCallInputs = [];
    for (const toolCall of processed.toolCalls) {
        toolCallInputs.push({
            toolName: toolCall.toolName,
            args: toolCall.args,
            toolCallId: toolCall.toolCallId,
        });
    }
    const toolResults = await executeToolsInParallel(agent._tools, toolCallInputs, contextWrapper);
    const preStepMessages = [];
    for (const message of state.messages) {
        preStepMessages.push(message);
    }
    const newMessages = [];
    for (const message of processed.newMessages) {
        newMessages.push(message);
    }
    const tokenBudget = state._tokenBudget;
    if (toolResults.length > 0) {
        const toolResultParts = [];
        for (const toolResult of toolResults) {
            let output;
            if (toolResult.error) {
                output = { type: 'error-text', value: toolResult.error.message };
            }
            else {
                output = { type: 'json', value: toolResult.result ?? null };
            }
            if (tokenBudget?.isEnabled()) {
                const resultContent = JSON.stringify(output);
                const estimatedTokens = await tokenBudget.estimateTokens(resultContent);
                if (!tokenBudget.hasReachedLimit && tokenBudget.canAddMessage(estimatedTokens)) {
                    toolResultParts.push({
                        type: 'tool-result',
                        toolCallId: toolResult.toolCallId,
                        toolName: toolResult.toolName,
                        output,
                    });
                    tokenBudget.addTokens(estimatedTokens);
                }
                else {
                    tokenBudget.markLimitReached();
                    toolResultParts.push({
                        type: 'tool-result',
                        toolCallId: toolResult.toolCallId,
                        toolName: toolResult.toolName,
                        output: { type: 'error-text', value: 'Tool result unavailable' },
                    });
                }
            }
            else {
                toolResultParts.push({
                    type: 'tool-result',
                    toolCallId: toolResult.toolCallId,
                    toolName: toolResult.toolName,
                    output,
                });
            }
        }
        const toolMessage = {
            role: 'tool',
            content: toolResultParts,
        };
        newMessages.push(toolMessage);
    }
    const combinedMessages = [];
    for (const message of state.messages) {
        combinedMessages.push(message);
    }
    for (const message of newMessages) {
        combinedMessages.push(message);
    }
    const stepToolCalls = [];
    for (const toolResult of toolResults) {
        stepToolCalls.push({
            toolName: toolResult.toolName,
            args: toolResult.args,
            result: toolResult.result,
        });
    }
    const stepResult = {
        stepNumber: state.stepNumber + 1,
        agentName: agent.name,
        toolCalls: stepToolCalls,
        text: processed.text,
        finishReason: processed.finishReason,
        timestamp: Date.now(),
    };
    state.recordStep(stepResult);
    if (modelResponse.usage) {
        const inputTokens = modelResponse.usage.inputTokens || 0;
        const outputTokens = modelResponse.usage.outputTokens || 0;
        const totalTokens = modelResponse.usage.totalTokens || 0;
        state.updateAgentMetrics(agent.name, {
            input: inputTokens,
            output: outputTokens,
            total: totalTokens,
        }, toolResults.length);
        state.usage.inputTokens += inputTokens;
        state.usage.outputTokens += outputTokens;
        state.usage.totalTokens += totalTokens;
    }
    if (toolResults.length > 0) {
        const toolNames = [];
        for (const toolResult of toolResults) {
            toolNames.push(toolResult.toolName);
        }
        state.toolUseTracker.addToolUse(agent, toolNames);
    }
    const nextStep = await determineNextStep(agent, processed, toolResults, state.context);
    return new runstate_1.SingleStepResult(state.originalInput, combinedMessages, preStepMessages, newMessages, nextStep, stepResult);
}
//# sourceMappingURL=execution.js.map