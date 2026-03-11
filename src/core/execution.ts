/**
 * Agent Execution Engine
 * @module core/execution
 */

import type { Agent, CoreTool, RunContextWrapper } from './agent';
import type {
  ModelMessage,
  GenerateTextResult,
  ToolSet,
  FinishReason,
  TypedToolCall,
} from 'ai';
import type { RunState, NextStep, StepResult } from './runstate';
import { SingleStepResult, NextStepType } from './runstate';
import { createContextualSpan } from '../tracing/context';

const TRANSFER_PREFIXES = ['transfer_to_', 'handoff_to_'] as const;
const TOOL_EXECUTION_BATCH_SIZE = 3;

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
 * Checks if a tool name is a transfer/handoff tool
 * @param toolName Tool name to check
 * @returns True if the tool is a transfer tool
 */
function isTransferTool(toolName: string): boolean {
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
function extractTargetAgentName(toolName: string): string {
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
async function checkToolNeedsApproval<TContext>(
  tool: CoreTool,
  contextWrapper: RunContextWrapper<TContext>
): Promise<boolean> {
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
export async function executeToolsInParallel<TContext = unknown>(
  tools: Record<string, CoreTool>,
  toolCalls: ToolCallInput[],
  contextWrapper: RunContextWrapper<TContext>
): Promise<ToolExecutionResult[]> {
  if (toolCalls.length === 0) {
    return [];
  }

  const results: ToolExecutionResult[] = [];
  let batch: Promise<ToolExecutionResult>[] = [];

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
async function executeSingleTool<TContext>(
  tools: Record<string, CoreTool>,
  toolCall: ToolCallInput,
  contextWrapper: RunContextWrapper<TContext>
): Promise<ToolExecutionResult> {
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

  const argsRecord = args as Record<string, unknown>;
  const argsKeys = Object.keys(argsRecord);

  const span = createContextualSpan(`Tool: ${toolName}`, {
    input: args,
    metadata: {
      toolName,
      agentName: contextWrapper.agent.name,
      argsReceived: argsKeys.length > 0,
      argsKeys,
    },
  });

  try {
    const result: unknown = await tool.execute(args, contextWrapper);

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
  } catch (error) {
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
export function processModelResponse<T extends ToolSet = ToolSet>(
  response: GenerateTextResult<T, unknown>
): ProcessedResponse {
  const toolCalls: ExtractedToolCall[] = [];
  const handoffRequests: HandoffRequest[] = [];
  const responseToolCalls = response.toolCalls ?? [];

  for (const responseToolCall of responseToolCalls) {
    const toolCall = responseToolCall as TypedToolCall<T>;
    const toolName = toolCall.toolName;
    const toolCallId = toolCall.toolCallId;
    const rawInput = (toolCall as { input?: unknown }).input;

    let toolArgs: Record<string, unknown>;
    if (rawInput !== undefined && rawInput !== null && typeof rawInput === 'object') {
      toolArgs = rawInput as Record<string, unknown>;
    } else {
      toolArgs = {};
    }

    if (isTransferTool(toolName)) {
      const reason =
        typeof toolArgs.reason === 'string' && toolArgs.reason
          ? toolArgs.reason
          : 'Transfer requested';

      const context =
        typeof toolArgs.context === 'string' ? toolArgs.context : undefined;

      const handoff: HandoffRequest = {
        agentName: extractTargetAgentName(toolName),
        reason,
        context,
      };
      handoffRequests.push(handoff);
    } else {
      const extracted: ExtractedToolCall = {
        toolName,
        args: toolArgs,
        toolCallId,
      };
      toolCalls.push(extracted);
    }
  }

  const newMessages: ModelMessage[] = [];
  const responseMessages = response.response?.messages;

  if (responseMessages && responseMessages.length > 0) {
    for (const responseMessage of responseMessages) {
      const message = responseMessage as ModelMessage;

      // Include tool messages from AI SDK — they contain auto-executed results
      if (message.role === 'tool') {
        newMessages.push(message);
        continue;
      }

      if (message.role === 'assistant' && Array.isArray(message.content)) {
        const transformedContent: Array<{
          type: string;
          toolCallId?: string;
          toolName?: string;
          input?: unknown;
          [key: string]: unknown;
        }> = [];

        for (const contentPart of message.content) {
          const part = contentPart as {
            type: string;
            toolCallId: string;
            toolName: string;
            input?: unknown;
            args?: unknown;
            [key: string]: unknown;
          };

          if (part.type === 'tool-call') {
            // AI SDK uses 'input', but 'args' is kept for backwards compatibility with older versions
            const toolInput = part.input ?? part.args ?? {};

            transformedContent.push({
              ...part,
              input: typeof toolInput === 'object' ? toolInput : {},
            });
          } else {
            transformedContent.push(part);
          }
        }

        const transformedMessage = {
          role: 'assistant' as const,
          content: transformedContent,
        } as ModelMessage;
        newMessages.push(transformedMessage);
      } else {
        newMessages.push(message);
      }
    }
  } else if (response.text) {
    const textMessage: ModelMessage = {
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
export async function determineNextStep<TContext = unknown>(
  agent: Agent<TContext, unknown>,
  processed: ProcessedResponse,
  toolResults: ToolExecutionResult[],
  context: TContext
): Promise<NextStep> {
  let needsApproval = false;
  for (const toolResult of toolResults) {
    if (toolResult.needsApproval && !toolResult.approved) {
      needsApproval = true;
      break;
    }
  }

  if (needsApproval) {
    const interruptions: Array<{ toolName: string; args: unknown; type: string }> = [];

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
      type: NextStepType.INTERRUPTION,
      interruptions,
    };
  }

  if (processed.handoffRequests.length > 0) {
    const handoff = processed.handoffRequests[0];
    const targetAgentName = handoff.agentName.toLowerCase().replace(/\s+/g, '_');

    let targetAgent: Agent<TContext, unknown> | undefined;
    for (const subagent of agent.handoffs) {
      if (subagent.name.toLowerCase().replace(/\s+/g, '_') === targetAgentName) {
        targetAgent = subagent;
        break;
      }
    }

    if (targetAgent) {
      return {
        type: NextStepType.HANDOFF,
        newAgent: targetAgent,
        reason: handoff.reason,
        context: handoff.context,
      };
    }
  }

  if (agent._shouldFinish) {
    const results: unknown[] = [];
    for (const toolResult of toolResults) {
      results.push(toolResult.result);
    }

    const shouldFinish = agent._shouldFinish(context, results);

    if (shouldFinish && processed.text) {
      return {
        type: NextStepType.FINAL_OUTPUT,
        output: processed.text,
      };
    }
  }

  const hasToolCalls = processed.toolCalls.length > 0;
  const hasText = processed.text !== '';
  const finishedReason =
    processed.finishReason === 'stop' || processed.finishReason === 'length';

  if (!hasToolCalls && hasText && finishedReason) {
    return {
      type: NextStepType.FINAL_OUTPUT,
      output: processed.text,
    };
  }

  return {
    type: NextStepType.RUN_AGAIN,
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
export async function executeSingleStep<TContext = unknown>(
  agent: Agent<TContext, unknown>,
  state: RunState<TContext, Agent<TContext, unknown>>,
  contextWrapper: RunContextWrapper<TContext>,
  modelResponse: GenerateTextResult<ToolSet, unknown>,
  toolExecutionMeta?: Map<string, { duration: number; error?: Error }>
): Promise<SingleStepResult> {
  const processed = processModelResponse(modelResponse);

  // Extract tool results from AI SDK response (already executed via wrapped tools in runner.ts)
  const toolResults: ToolExecutionResult[] = [];

  const aiToolResults = modelResponse.toolResults ?? [];
  for (const aiResult of aiToolResults as any[]) {
    const meta = toolExecutionMeta?.get(aiResult.toolName);
    toolResults.push({
      toolName: aiResult.toolName,
      toolCallId: aiResult.toolCallId,
      args: aiResult.input,
      result: aiResult.output,
      duration: meta?.duration ?? 0,
      error: meta?.error,
    });
  }

  // Also extract tool errors from AI SDK content parts
  const contentParts = (modelResponse as any).content ?? [];
  for (const part of contentParts) {
    if (part.type === 'tool-error') {
      const meta = toolExecutionMeta?.get(part.toolName);
      // Only add if not already tracked via toolResults
      const alreadyTracked = toolResults.some(r => r.toolCallId === part.toolCallId);
      if (!alreadyTracked) {
        toolResults.push({
          toolName: part.toolName,
          toolCallId: part.toolCallId,
          args: part.input,
          result: null,
          error: part.error instanceof Error ? part.error : new Error(String(part.error)),
          duration: meta?.duration ?? 0,
        });
      }
    }
  }

  const preStepMessages: ModelMessage[] = [];
  for (const message of state.messages) {
    preStepMessages.push(message);
  }

  const newMessages: ModelMessage[] = [];
  for (const message of processed.newMessages) {
    newMessages.push(message);
  }

  const tokenBudget = state._tokenBudget as {
    isEnabled(): boolean;
    canAddMessage(tokens: number): boolean;
    estimateTokens(content: string | object): Promise<number>;
    addTokens(tokens: number): void;
    markLimitReached(): void;
    hasReachedLimit: boolean;
  } | undefined;

  // Token budget enforcement on tool messages already included from AI SDK response
  if (tokenBudget?.isEnabled() && toolResults.length > 0) {
    for (const msg of newMessages) {
      if (msg.role === 'tool' && Array.isArray(msg.content)) {
        for (const part of msg.content as any[]) {
          if (part.type === 'tool-result') {
            const resultContent = JSON.stringify(part.output);
            const estimatedTokens = await tokenBudget.estimateTokens(resultContent);

            if (tokenBudget.hasReachedLimit || !tokenBudget.canAddMessage(estimatedTokens)) {
              tokenBudget.markLimitReached();
              part.output = 'Tool result unavailable';
            } else {
              tokenBudget.addTokens(estimatedTokens);
            }
          }
        }
      }
    }
  }

  const combinedMessages: ModelMessage[] = [];
  for (const message of state.messages) {
    combinedMessages.push(message);
  }
  for (const message of newMessages) {
    combinedMessages.push(message);
  }

  const stepToolCalls: Array<{ toolName: string; args: unknown; result: unknown }> = [];
  for (const toolResult of toolResults) {
    stepToolCalls.push({
      toolName: toolResult.toolName,
      args: toolResult.args,
      result: toolResult.result,
    });
  }

  const stepResult: StepResult = {
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

    state.updateAgentMetrics(
      agent.name,
      {
        input: inputTokens,
        output: outputTokens,
        total: totalTokens,
      },
      toolResults.length
    );

    state.usage.inputTokens += inputTokens;
    state.usage.outputTokens += outputTokens;
    state.usage.totalTokens += totalTokens;
  }

  if (toolResults.length > 0) {
    const toolNames: string[] = [];
    for (const toolResult of toolResults) {
      toolNames.push(toolResult.toolName);
    }
    state.toolUseTracker.addToolUse(agent, toolNames);
  }

  const nextStep = await determineNextStep(agent, processed, toolResults, state.context);

  return new SingleStepResult(
    state.originalInput,
    combinedMessages,
    preStepMessages,
    newMessages,
    nextStep,
    stepResult
  );
}
