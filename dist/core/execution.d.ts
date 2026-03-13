/**
 * Agent Execution Engine
 * @module core/execution
 */
import type { Agent, CoreTool, RunContextWrapper } from './agent';
import type { ModelMessage, GenerateTextResult, ToolSet, FinishReason } from 'ai';
import type { RunState, NextStep } from './runstate';
import { SingleStepResult } from './runstate';
/** Tool call extracted from model response */
export interface ExtractedToolCall {
    toolName: string;
    args: Record<string, unknown>;
    toolCallId: string;
}
/** Handoff/transfer request extracted from model response */
export interface HandoffRequest {
    agentName: string;
    reason: string;
    context?: string;
}
/** Processed model response with categorized actions */
export interface ProcessedResponse {
    text: string;
    finishReason: FinishReason;
    toolCalls: ExtractedToolCall[];
    handoffRequests: HandoffRequest[];
    newMessages: ModelMessage[];
}
/** Tool execution result */
export interface ToolExecutionResult {
    toolName: string;
    toolCallId: string;
    args: unknown;
    result: unknown;
    error?: Error;
    duration: number;
    needsApproval?: boolean;
    approved?: boolean;
}
interface ToolCallInput {
    toolName: string;
    args: unknown;
    toolCallId: string;
}
/**
 * Checks if a tool requires approval before execution
 * @param tool Tool to check
 * @param contextWrapper Execution context
 * @returns True if the tool needs approval
 */
export declare function checkToolNeedsApproval<TContext>(tool: CoreTool, contextWrapper: RunContextWrapper<TContext>): Promise<boolean>;
/**
 * Executes tool calls in parallel batches to reduce system strain
 * @param tools Available tools dictionary
 * @param toolCalls Tool calls to execute
 * @param contextWrapper Execution context
 * @returns Array of tool execution results
 */
export declare function executeToolsInParallel<TContext = unknown>(tools: Record<string, CoreTool>, toolCalls: ToolCallInput[], contextWrapper: RunContextWrapper<TContext>): Promise<ToolExecutionResult[]>;
/**
 * Processes model response and categorizes actions
 * @param response The result from generateText
 * @returns Processed response with categorized tool calls, handoffs, and messages
 */
export declare function processModelResponse<T extends ToolSet = ToolSet>(response: GenerateTextResult<T, unknown>): ProcessedResponse;
/**
 * Determines the next step based on agent's decision
 * @param agent Current agent
 * @param processed Processed model response
 * @param toolResults Tool execution results
 * @param context Execution context
 * @returns Next step decision
 */
export declare function determineNextStep<TContext = unknown>(agent: Agent<TContext, unknown>, processed: ProcessedResponse, toolResults: ToolExecutionResult[], context: TContext): Promise<NextStep>;
/**
 * Executes a single agent step with autonomous decision making
 * @param agent Current agent
 * @param state Run state
 * @param contextWrapper Execution context wrapper
 * @param modelResponse Response from generateText
 * @returns Single step result with next step decision
 */
export declare function executeSingleStep<TContext = unknown>(agent: Agent<TContext, unknown>, state: RunState<TContext, Agent<TContext, unknown>>, contextWrapper: RunContextWrapper<TContext>, modelResponse: GenerateTextResult<ToolSet, unknown>, toolExecutionMeta?: Map<string, {
    duration: number;
    error?: Error;
    needsApproval?: boolean;
}>): Promise<SingleStepResult>;
export {};
//# sourceMappingURL=execution.d.ts.map