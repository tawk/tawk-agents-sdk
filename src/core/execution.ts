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
 * Checks if a tool is disabled for the current execution context
 * @param tool Tool to check
 * @param contextWrapper Execution context
 * @returns True if the tool is disabled
 */
async function isToolDisabled<TContext>(
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
      // Use allSettled so one tool failure doesn't kill the entire batch
      const settled = await Promise.allSettled(batch);
      for (const entry of settled) {
        if (entry.status === 'fulfilled') {
          results.push(entry.value);
        } else {
          // This shouldn't happen since executeSingleTool already catches,
          // but handle it defensively
          results.push({
            toolName: 'unknown',
            toolCallId: '',
            args: {},
            result: null,
            error: entry.reason instanceof Error ? entry.reason : new Error(String(entry.reason)),
            duration: 0,
          });
        }
      }
      batch = [];
    }
  }

  if (batch.length > 0) {
    const settled = await Promise.allSettled(batch);
    for (const entry of settled) {
      if (entry.status === 'fulfilled') {
        results.push(entry.value);
      } else {
        results.push({
          toolName: 'unknown',
          toolCallId: '',
          args: {},
          result: null,
          error: entry.reason instanceof Error ? entry.reason : new Error(String(entry.reason)),
          duration: 0,
        });
      }
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

  const disabled = await isToolDisabled(tool, contextWrapper);

  if (disabled) {
    return {
      toolName,
      toolCallId,
      args,
      result: null,
      error: new Error(`Tool ${toolName} is not available in the current context`),
      duration: Date.now() - startTime,
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
  response: GenerateTextResult<T, any>
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

      if (message.role === 'tool') {
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
              type: 'tool-call',
              toolCallId: part.toolCallId,
              toolName: part.toolName,
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
  modelResponse: GenerateTextResult<ToolSet, any>
): Promise<SingleStepResult> {
  const processed = processModelResponse(modelResponse);

  const toolCallInputs: ToolCallInput[] = [];
  for (const toolCall of processed.toolCalls) {
    toolCallInputs.push({
      toolName: toolCall.toolName,
      args: toolCall.args,
      toolCallId: toolCall.toolCallId,
    });
  }

  const toolResults = await executeToolsInParallel(
    agent._tools,
    toolCallInputs,
    contextWrapper
  );

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

  if (toolResults.length > 0) {
    const toolResultParts: Array<{
      type: 'tool-result';
      toolCallId: string;
      toolName: string;
      output: { type: 'error-text'; value: string } | { type: 'json'; value: unknown };
    }> = [];

    for (const toolResult of toolResults) {
      let output: { type: 'error-text'; value: string } | { type: 'json'; value: unknown };
      if (toolResult.error) {
        output = { type: 'error-text', value: toolResult.error.message };
      } else {
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
        } else {
          tokenBudget.markLimitReached();
          toolResultParts.push({
            type: 'tool-result',
            toolCallId: toolResult.toolCallId,
            toolName: toolResult.toolName,
            output: { type: 'error-text' as const, value: 'Tool result unavailable' },
          });
        }
      } else {
        toolResultParts.push({
          type: 'tool-result',
          toolCallId: toolResult.toolCallId,
          toolName: toolResult.toolName,
          output,
        });
      }
    }

    const toolMessage = {
      role: 'tool' as const,
      content: toolResultParts,
    } as ModelMessage;
    newMessages.push(toolMessage);
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
