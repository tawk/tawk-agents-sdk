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

import {
  generateText,
  streamText,
  Output,
  pruneMessages,
  type LanguageModel,
  type ModelMessage,
  type ToolCallRepairFunction,
  type StopCondition,
  type PrepareStepFunction,
  type ToolSet,
} from 'ai';
import type { Agent, RunContextWrapper } from './agent';
import { RunState, NextStepType } from './runstate';
import { executeSingleStep } from './execution';
import {
  createTrace,
  isLangfuseEnabled,
  formatMessagesForLangfuse,
  extractModelName,
  getLangfuse,
} from '../lifecycle/langfuse';
import {
  getCurrentTrace,
  setCurrentSpan,
  runWithTraceContext,
} from '../tracing/context';
import { RunHooks } from '../lifecycle';
import { sanitizeError } from '../helpers/sanitize';

/** Error thrown when agent run exceeds token budget */
export class TokenLimitExceededError extends Error {
  public readonly estimatedTokens: number;
  public readonly maxTokens: number;
  public readonly usedTokens: number;

  constructor(options: { estimatedTokens: number; maxTokens: number; usedTokens: number }) {
    const { estimatedTokens, maxTokens, usedTokens } = options;
    super(
      `Token limit exceeded: estimated request (${estimatedTokens} tokens) would exceed ` +
      `budget (${maxTokens} max, ${usedTokens} already used, ${maxTokens - usedTokens} remaining)`
    );
    this.name = 'TokenLimitExceededError';
    this.estimatedTokens = estimatedTokens;
    this.maxTokens = maxTokens;
    this.usedTokens = usedTokens;
  }
}

/**
 * Token budget tracker
 */
export class TokenBudgetTracker {
  private maxTokens: number | undefined;
  private tokenizerFn: (text: string) => number | Promise<number>;
  private estimatedContextTokens: number = 0;
  private reservedResponseTokens: number;
  private alreadyUsedTokens: number = 0;
  
  public hasReachedLimit: boolean = false;

  constructor(options: {
    maxTokens?: number;
    tokenizerFn: (text: string) => number | Promise<number>;
    reservedResponseTokens?: number;
    alreadyUsedTokens?: number;
  }) {
    this.maxTokens = options.maxTokens;
    this.tokenizerFn = options.tokenizerFn;
    this.reservedResponseTokens = options.reservedResponseTokens ?? 1500;
    this.alreadyUsedTokens = options.alreadyUsedTokens ?? 0;
  }

  isEnabled(): boolean {
    return this.maxTokens !== undefined;
  }

  async estimateTokens(content: string | object): Promise<number> {
    const text = typeof content === 'string' ? content : JSON.stringify(content);
    return await this.tokenizerFn(text);
  }

  setInitialContext(tokens: number): void {
    this.estimatedContextTokens = tokens;
  }

  addTokens(tokens: number): void {
    this.estimatedContextTokens += tokens;
  }

  getTotalTokens(): number {
    return this.alreadyUsedTokens + this.estimatedContextTokens;
  }

  getRemainingBudget(): number {
    if (!this.maxTokens) return Infinity;
    return this.maxTokens - this.getTotalTokens() - this.reservedResponseTokens;
  }

  canAddMessage(messageTokens: number): boolean {
    if (!this.maxTokens) return true;
    if (this.hasReachedLimit) return false;
    
    const wouldUse = this.getTotalTokens() + messageTokens;
    const wouldRemain = this.maxTokens - wouldUse;
    
    return wouldRemain >= this.reservedResponseTokens;
  }

  isInitialContextExceeded(): boolean {
    if (!this.maxTokens) return false;
    return this.getTotalTokens() + this.reservedResponseTokens > this.maxTokens;
  }

  markLimitReached(): void {
    this.hasReachedLimit = true;
  }

  getStats(): { estimated: number; used: number; total: number; max: number | undefined; remaining: number } {
    return {
      estimated: this.estimatedContextTokens,
      used: this.alreadyUsedTokens,
      total: this.getTotalTokens(),
      max: this.maxTokens,
      remaining: this.getRemainingBudget(),
    };
  }
}

export interface RunOptions<TContext = any> {
  context?: TContext;
  session?: any; // Session for conversation history
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
    /** True when output guardrails were skipped (e.g. token limit exceeded) */
    guardrailBypassed?: boolean;
  };
}

/**
 * Stream event types
 */
export type StreamEvent =
  | { type: 'text-delta'; textDelta: string; }
  | { type: 'tool-call-start'; toolName: string; toolCallId: string; }
  | { type: 'tool-call'; toolName: string; args: any; toolCallId: string; }
  | { type: 'tool-result'; toolName: string; result: any; toolCallId: string; }
  | { type: 'agent-start'; agentName: string; }
  | { type: 'agent-end'; agentName: string; }
  | { type: 'transfer'; from: string; to: string; reason: string; }
  | { type: 'guardrail-check'; guardrailName: string; passed: boolean; }
  | { type: 'step-start'; stepNumber: number; }
  | { type: 'step-complete'; stepNumber: number; }
  | { type: 'finish'; finishReason?: string; };

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
 * 3. Agent-driven handoffs with context
 * 
 * @template TContext - Type of context object
 * @template TOutput - Type of output
 */
export class AgenticRunner<TContext = any, TOutput = string> extends RunHooks<TContext, TOutput> {
  private options: RunOptions<TContext>;

  constructor(options: RunOptions<TContext> = {}) {
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
  async execute(
    agent: Agent<TContext, TOutput>,
    input: string | ModelMessage[],
    options: RunOptions<TContext> = {}
  ): Promise<RunResult<TOutput>> {
    const mergedOptions = { ...this.options, ...options };
    const context = mergedOptions.context || ({} as TContext);
    const maxTurns = mergedOptions.maxTurns || 50;

    // Initialize run state (async factory handles UIMessage[] conversion in AI SDK v6)
    const state = await RunState.create<TContext, Agent<TContext, TOutput>>(
      agent,
      input,
      context,
      maxTurns
    );

    // Auto-initialize Langfuse tracing
    isLangfuseEnabled();

    // Get or create trace
    let trace = getCurrentTrace();
    if (!trace && isLangfuseEnabled()) {
      const initialInput = typeof input === 'string'
        ? input
        : input.find((m) => m.role === 'user')?.content || input;

      trace = createTrace({
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
    return await runWithTraceContext(trace, async () => {
      // Run input guardrails
      await this.runInputGuardrails(agent, state);

      // Emit agent_start event
      const contextWrapper = this.getContextWrapper(agent, state);
      this.emit('agent_start', contextWrapper, agent);
      agent.emit('agent_start', contextWrapper, agent);

      try {
        return await this.executeAgentLoop(agent, state, contextWrapper, maxTurns);
      } catch (error) {
        // Emit agent_end event on error so lifecycle listeners get matched start/end
        try {
          this.emit('agent_end', contextWrapper, agent, null as any);
          agent.emit('agent_end', contextWrapper, null as any);
        } catch (_eventError) {
          // Event errors must never mask the original error
        }
        try {
          if (state.currentAgentSpan) {
            state.currentAgentSpan.end({
              output: { error: sanitizeError(error) },
              level: 'ERROR',
            });
          }
        } catch (_tracingError) {
          // Tracing errors must never break execution
        }
        throw error;
      } finally {
        // Clean up runner listeners to prevent memory leaks (ADR-001)
        this.dispose();
      }
    });
  }

  /**
   * Main agent execution loop
   */
  private async executeAgentLoop(
    agent: Agent<TContext, TOutput>,
    state: RunState<TContext, Agent<TContext, TOutput>>,
    contextWrapper: RunContextWrapper<TContext>,
    maxTurns: number
  ): Promise<RunResult<TOutput>> {
    const MAX_GUARDRAIL_RETRIES = 3;
    let guardrailRetryCount = 0;

    try {
      // Main agentic execution loop
      while (!state.isMaxTurnsExceeded()) {
        state.incrementTurn();

        // Create agent span if needed
        // IMPORTANT: Create spans directly from TRACE to maintain sibling hierarchy
        if (!state.currentAgentSpan || state.currentAgentSpan._agentName !== state.currentAgent.name) {
          if (state.currentAgentSpan) {
            // End previous agent span with accumulated token usage
            try {
              const prevAgentName = state.currentAgentSpan._agentName;
              const prevAgentMetrics = prevAgentName ? state.agentMetrics.get(prevAgentName) : null;

              state.currentAgentSpan.end({
                usage: prevAgentMetrics ? {
                  input: prevAgentMetrics.tokens.input,
                  output: prevAgentMetrics.tokens.output,
                  total: prevAgentMetrics.tokens.total
                } : undefined
              });
            } catch (_tracingError) {
              // Tracing errors must never break execution
            }
          }

          // Create span as direct child of trace to maintain proper hierarchy
          // This makes all agents siblings instead of nested
          const agentSpan = state.trace?.span({
            name: `Agent: ${state.currentAgent.name}`,
            input: { messages: formatMessagesForLangfuse(state.messages) },
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
            setCurrentSpan(agentSpan);
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
          reservedResponseTokens: estimatedResponseTokens,
          alreadyUsedTokens: 0, // Don't count previous usage - only current context matters
        });

        if (tokenBudget.isEnabled()) {
          let estimatedInputTokens = 0;
          try {
            estimatedInputTokens = await tokenBudget.estimateTokens(systemMessage);
            for (const msg of state.messages) {
              estimatedInputTokens += await tokenBudget.estimateTokens(JSON.stringify(msg.content));
            }

            if (tools && Object.keys(tools).length > 0) {
              estimatedInputTokens += await tokenBudget.estimateTokens(tools);
            }
          } catch (_tokenError) {
            // Fallback: rough estimate of 4 chars per token
            const totalChars = systemMessage.length +
              state.messages.reduce((sum, m) => sum + JSON.stringify(m.content).length, 0);
            estimatedInputTokens = Math.ceil(totalChars / 4);
          }

          tokenBudget.setInitialContext(estimatedInputTokens);
          
          if (tokenBudget.isInitialContextExceeded()) {
            // Token limit exceeded - try to return last assistant output instead of erroring
            let lastAssistantOutput: string | null = null;
            
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
                    const contentPart = part as { type: string; text?: string };
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
              try {
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
              } catch (_tracingError) {
                // Tracing errors must never break execution
              }
              
              await this.flushTraces();
              
              return {
                finalOutput: lastAssistantOutput as TOutput,
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
                  guardrailBypassed: true,
                },
              };
            }
            
            // No previous output to return - throw error
            const stats = tokenBudget.getStats();
            throw new TokenLimitExceededError({
              estimatedTokens: stats.total,
              maxTokens: stats.max!,
              usedTokens: stats.used
            });
          }
        }
        
        state._tokenBudget = tokenBudget;

        // Create GENERATION (not span) for LLM call - this properly tracks tokens in Langfuse
        const generation = state.currentAgentSpan?.generation({
          name: `LLM Generation: ${state.currentAgent.name}`,
          model: extractModelName(model),
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
            modelName: extractModelName(model),
            toolCount: Object.keys(tools || {}).length
          }
        });

        // Apply pruneMessages if maxInputTokens is set
        let messagesToSend = state.messages;
        const maxInputTokens = state.currentAgent._modelSettings?.maxInputTokens;
        if (maxInputTokens) {
          messagesToSend = pruneMessages({
            messages: state.messages,
            toolCalls: 'before-last-message',
            emptyMessages: 'remove',
          });
        }

        // Build structured output specification if agent has outputSchema
        const outputSpec = state.currentAgent._outputSchema
          ? Output.object({ schema: state.currentAgent._outputSchema as any })
          : undefined;

        // Call model
        const modelResponse = await generateText({
          model: model as LanguageModel,
          system: systemMessage,
          messages: messagesToSend,
          tools: tools as any,
          output: outputSpec,
          temperature: state.currentAgent._modelSettings?.temperature,
          topP: state.currentAgent._modelSettings?.topP,
          maxOutputTokens: state.currentAgent._modelSettings?.responseTokens,
          presencePenalty: state.currentAgent._modelSettings?.presencePenalty,
          frequencyPenalty: state.currentAgent._modelSettings?.frequencyPenalty,
          experimental_repairToolCall: state.currentAgent._toolCallRepair as ToolCallRepairFunction<ToolSet> | undefined,
          stopWhen: state.currentAgent._stopWhen as StopCondition<ToolSet> | StopCondition<ToolSet>[] | undefined,
          activeTools: state.currentAgent._activeTools as any,
          prepareStep: state.currentAgent._prepareStep as PrepareStepFunction<ToolSet> | undefined,
        } as any);

        // End generation with proper usage tracking
        try {
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
        } catch (_tracingError) {
          // Tracing errors must never break execution
        }

        // Execute single step with AUTONOMOUS decision making
        const stepResult = await executeSingleStep(
          state.currentAgent,
          state,
          contextWrapper,
          modelResponse
        );

        // Update state with new messages
        state.messages = stepResult.messages;

        if (tokenBudget.hasReachedLimit) {
          state._toolsDisabledDueToTokenLimit = true;
        }

        // Handle next step based on AGENT's decision
        const nextStep = stepResult.nextStep;

        if (nextStep.type === NextStepType.FINAL_OUTPUT) {
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
            } else {
              canRetry = true; // No limit set, always allow retry
            }
          }
          
          if (!guardrailResult.passed && canRetry && guardrailRetryCount < MAX_GUARDRAIL_RETRIES) {
            // Guardrail failed but we can retry - add feedback and loop
            guardrailRetryCount++;
            state.messages.push({
              role: 'system',
              content: guardrailResult.feedback || 'Please regenerate your response.'
            });
            continue;
          }

          // Reset retry count on success
          if (guardrailResult.passed) {
            guardrailRetryCount = 0;
          }

          // If guardrails failed and we can't retry (or retries exhausted), reject the output for safety
          if (!guardrailResult.passed && (!canRetry || guardrailRetryCount >= MAX_GUARDRAIL_RETRIES)) {
            nextStep.output = `[Output blocked: content did not pass safety guardrails and retry budget exhausted]`;
          }

          // Parse output if schema provided
          // Prefer AI SDK v6 native structured output, fall back to JSON.parse
          let finalOutput: TOutput;
          if (state.currentAgent._outputSchema) {
            const nativeOutput = (modelResponse as any).output ?? (modelResponse as any).experimental_output;
            if (nativeOutput !== undefined && nativeOutput !== null) {
              finalOutput = nativeOutput as TOutput;
            } else {
              try {
                const parsed = JSON.parse(nextStep.output);
                finalOutput = state.currentAgent._outputSchema.parse(parsed);
              } catch {
                finalOutput = nextStep.output as TOutput;
              }
            }
          } else {
            finalOutput = nextStep.output as TOutput;
          }

          // IMPORTANT: For user-facing output, always ensure it's a string
          // If outputSchema returned an object, stringify it
          const finalOutputString = typeof finalOutput === 'string' 
            ? finalOutput 
            : JSON.stringify(finalOutput, null, 2);

          // End agent span with accumulated token usage
          try {
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
          } catch (_tracingError) {
            // Tracing errors must never break execution
          }

          // Emit agent_end event
          this.emit('agent_end', contextWrapper, agent, finalOutputString as any);
          agent.emit('agent_end', contextWrapper, finalOutputString as any);

          // Update trace with final output and aggregated metadata
          try {
            if (state.trace) {
              state.trace.update({
                output: finalOutputString, // Just the text, not an object
                metadata: {
                  agentPath: state.handoffChain.length > 0 ? state.handoffChain : [agent.name],
                  success: true,
                  totalTokens: state.usage.totalTokens,
                  promptTokens: state.usage.inputTokens,
                  completionTokens: state.usage.outputTokens,
                  duration: state.getDuration(),
                  agentCount: state.agentMetrics.size,
                  totalToolCalls: state.steps.reduce((sum, s) => sum + (s.toolCalls?.length || 0), 0),
                  totalTransfers: state.handoffChain.length,
                  finishReason: stepResult.stepResult?.finishReason,
                }
              });
            }
          } catch (_tracingError) {
            // Tracing errors must never break execution
          }

          // Flush Langfuse traces before returning
          await this.flushTraces();

          // Return final result (always ensure finalOutput is a string)
          return {
            finalOutput: finalOutputString as TOutput,
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
        } else if (nextStep.type === NextStepType.HANDOFF) {
          // Agent decided to transfer to another agent
          try {
            if (state.currentAgentSpan) {
              const agentMetrics = state.agentMetrics.get(state.currentAgent.name);

              state.currentAgentSpan.end({
                output: {
                  transferTo: nextStep.newAgent.name,
                  transferReason: nextStep.reason,
                },
                metadata: {
                  type: 'transfer',
                  isolated: true,  // Context isolation enabled
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
          } catch (_tracingError) {
            state.currentAgentSpan = undefined;
            // Tracing errors must never break execution
          }

          // Track transfer in chain
          state.trackHandoff(nextStep.newAgent.name);

          // Switch to new agent
          const previousAgent = state.currentAgent;
          state.currentAgent = nextStep.newAgent as any;

          // Emit transfer event
          this.emit('agent_handoff', contextWrapper, previousAgent, nextStep.newAgent);
          previousAgent.emit('agent_handoff', contextWrapper, nextStep.newAgent);

          // CONTEXT ISOLATION: Reset messages to only user query
          // Extract original user query
          const originalUserMessage = Array.isArray(state.originalInput)
            ? state.originalInput.filter((m: any) => m.role === 'user')
            : [{ role: 'user' as const, content: state.originalInput }];
          
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
        } else if (nextStep.type === NextStepType.RUN_AGAIN) {
          // Agent decided to continue
          continue;
        }
      }

      // Max turns exceeded
      throw new Error(`Max turns (${maxTurns}) exceeded`);
    } catch (error) {
      try {
        if (state.currentAgentSpan) {
          state.currentAgentSpan.end({
            output: { error: sanitizeError(error) },
            level: 'ERROR',
          });
        }
      } catch (_tracingError) {
        // Tracing errors must never break execution
      }
      throw error;
    }
  }

  /**
   * Execute an agent run with real streaming via streamText()
   *
   * Yields StreamEvent objects as the model generates text and calls tools.
   * Uses the same turn loop as execute() but swaps generateText for streamText.
   */
  async *executeStream(
    agent: Agent<TContext, TOutput>,
    input: string | ModelMessage[],
    options: RunOptions<TContext> = {}
  ): AsyncGenerator<StreamEvent, RunResult<TOutput>, undefined> {
    const mergedOptions = { ...this.options, ...options };
    const context = mergedOptions.context || ({} as TContext);
    const maxTurns = mergedOptions.maxTurns || 50;

    const state = await RunState.create<TContext, Agent<TContext, TOutput>>(
      agent,
      input,
      context,
      maxTurns
    );

    isLangfuseEnabled();

    let trace = getCurrentTrace();
    if (!trace && isLangfuseEnabled()) {
      const initialInput = typeof input === 'string'
        ? input
        : input.find((m) => m.role === 'user')?.content || input;

      trace = createTrace({
        name: `Agent Run (Stream)`,
        input: initialInput,
        metadata: { initialAgent: agent.name, maxTurns },
        tags: ['agent', 'run', 'agentic', 'stream'],
      });
    }
    state.trace = trace;

    const contextWrapper = this.getContextWrapper(agent, state);

    // Run input guardrails (non-streaming phase)
    await this.runInputGuardrails(agent, state);

    this.emit('agent_start', contextWrapper, agent);
    agent.emit('agent_start', contextWrapper, agent);

    yield { type: 'agent-start', agentName: agent.name };

    try {
      while (!state.isMaxTurnsExceeded()) {
        state.incrementTurn();

        yield { type: 'step-start', stepNumber: state.currentTurn };

        const systemMessage = await state.currentAgent.getInstructions(contextWrapper);
        const model = state.currentAgent._model;
        const toolsDisabledDueToTokenLimit = state._toolsDisabledDueToTokenLimit;
        const tools = toolsDisabledDueToTokenLimit ? {} : state.currentAgent._tools;

        // Apply pruneMessages if configured
        let messagesToSend = state.messages;
        const maxInputTokens = state.currentAgent._modelSettings?.maxInputTokens;
        if (maxInputTokens) {
          messagesToSend = pruneMessages({
            messages: state.messages,
            toolCalls: 'before-last-message',
            emptyMessages: 'remove',
          });
        }

        // Build structured output specification
        const outputSpec = state.currentAgent._outputSchema
          ? Output.object({ schema: state.currentAgent._outputSchema as any })
          : undefined;

        // Use streamText instead of generateText
        const streamResult = streamText({
          model: model as LanguageModel,
          system: systemMessage,
          messages: messagesToSend,
          tools: tools as any,
          output: outputSpec,
          temperature: state.currentAgent._modelSettings?.temperature,
          topP: state.currentAgent._modelSettings?.topP,
          maxOutputTokens: state.currentAgent._modelSettings?.responseTokens,
          presencePenalty: state.currentAgent._modelSettings?.presencePenalty,
          frequencyPenalty: state.currentAgent._modelSettings?.frequencyPenalty,
          experimental_repairToolCall: state.currentAgent._toolCallRepair as ToolCallRepairFunction<ToolSet> | undefined,
          stopWhen: state.currentAgent._stopWhen as StopCondition<ToolSet> | StopCondition<ToolSet>[] | undefined,
          activeTools: state.currentAgent._activeTools as any,
          prepareStep: state.currentAgent._prepareStep as PrepareStepFunction<ToolSet> | undefined,
        } as any);

        // Stream text deltas and tool events to the caller
        for await (const part of streamResult.fullStream) {
          const p = part as any;
          if (p.type === 'text-delta') {
            yield { type: 'text-delta', textDelta: p.text };
          } else if (p.type === 'tool-call') {
            yield {
              type: 'tool-call',
              toolName: p.toolName,
              args: p.input,
              toolCallId: p.toolCallId,
            };
          } else if (p.type === 'tool-result') {
            yield {
              type: 'tool-result',
              toolName: p.toolName,
              result: p.output,
              toolCallId: p.toolCallId,
            };
          }
        }

        // After stream completes, get the full result for state management
        const finalText = await streamResult.text;
        const finalToolCalls = await streamResult.toolCalls;
        const finalUsage = await streamResult.usage;
        const finishReason = await streamResult.finishReason;

        // Build a modelResponse-like object for executeSingleStep
        const modelResponse = {
          text: finalText,
          toolCalls: finalToolCalls,
          toolResults: await streamResult.toolResults,
          finishReason,
          usage: finalUsage,
          steps: await streamResult.steps,
          response: await streamResult.response,
        };

        // Execute step to update state (tool execution already happened via streamText)
        const stepResult = await executeSingleStep(
          state.currentAgent,
          state,
          contextWrapper,
          modelResponse as any
        );

        state.messages = stepResult.messages;

        yield { type: 'step-complete', stepNumber: state.currentTurn };

        const nextStep = stepResult.nextStep;

        if (nextStep.type === NextStepType.FINAL_OUTPUT) {
          // Parse structured output
          let finalOutput: TOutput;
          if (state.currentAgent._outputSchema) {
            const nativeOutput = (modelResponse as any).output ?? (modelResponse as any).experimental_output;
            if (nativeOutput !== undefined && nativeOutput !== null) {
              finalOutput = nativeOutput as TOutput;
            } else {
              try {
                const parsed = JSON.parse(nextStep.output);
                finalOutput = state.currentAgent._outputSchema.parse(parsed);
              } catch {
                finalOutput = nextStep.output as TOutput;
              }
            }
          } else {
            finalOutput = nextStep.output as TOutput;
          }

          const finalOutputString = typeof finalOutput === 'string'
            ? finalOutput
            : JSON.stringify(finalOutput, null, 2);

          this.emit('agent_end', contextWrapper, agent, finalOutputString as any);
          agent.emit('agent_end', contextWrapper, finalOutputString as any);

          yield { type: 'agent-end', agentName: agent.name };
          yield { type: 'finish', finishReason: stepResult.stepResult?.finishReason };

          await this.flushTraces();

          return {
            finalOutput: finalOutputString as TOutput,
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
        } else if (nextStep.type === NextStepType.HANDOFF) {
          state.trackHandoff(nextStep.newAgent.name);
          const previousAgent = state.currentAgent;
          state.currentAgent = nextStep.newAgent as any;

          yield {
            type: 'transfer',
            from: previousAgent.name,
            to: nextStep.newAgent.name,
            reason: nextStep.reason || '',
          };

          this.emit('agent_handoff', contextWrapper, previousAgent, nextStep.newAgent);
          previousAgent.emit('agent_handoff', contextWrapper, nextStep.newAgent);

          // Context isolation
          const originalUserMessage = Array.isArray(state.originalInput)
            ? state.originalInput.filter((m: any) => m.role === 'user')
            : [{ role: 'user' as const, content: state.originalInput }];

          state.messages = [...originalUserMessage];
          state._toolsDisabledDueToTokenLimit = false;

          if (nextStep.reason) {
            state.messages.push({
              role: 'system',
              content: `[Transfer] Transferred to ${nextStep.newAgent.name}. Reason: ${nextStep.reason}${nextStep.context ? `. Context: ${nextStep.context}` : ''}`,
            });
          }

          yield { type: 'agent-start', agentName: nextStep.newAgent.name };
          continue;
        } else if (nextStep.type === NextStepType.RUN_AGAIN) {
          continue;
        }
      }

      throw new Error(`Max turns (${maxTurns}) exceeded`);
    } catch (error) {
      try {
        this.emit('agent_end', contextWrapper, agent, null as any);
        agent.emit('agent_end', contextWrapper, null as any);
      } catch (_eventError) {
        // Event errors must never mask the original error
      }
      throw error;
    } finally {
      this.dispose();
    }
  }

  /**
   * Get context wrapper for tool execution
   */
  private getContextWrapper(
    agent: Agent<TContext, any>,
    state: RunState<TContext, any>
  ): RunContextWrapper<TContext> {
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
  private async runInputGuardrails(
    agent: Agent<TContext, any>,
    state: RunState<TContext, any>
  ): Promise<void> {
    const guardrails = agent._guardrails.filter((g) => g.type === 'input');
    if (guardrails.length === 0) return;

    const lastUserMessage = [...state.messages]
      .reverse()
      .find((m) => m.role === 'user');

    if (!lastUserMessage || typeof lastUserMessage.content !== 'string') return;

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
          if (guardrailsSpan) guardrailsSpan.end({ level: 'ERROR' });
          throw new Error(`Input guardrail "${guardrail.name}" failed: ${result.message}`);
        }
        } catch (error) {
          if (guardrailSpan) {
            guardrailSpan.end({
              output: { error: sanitizeError(error) },
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
    } catch (error) {
      if (guardrailsSpan) guardrailsSpan.end({ level: 'ERROR' });
      throw error;
    }
  }

  /**
   * Run output guardrails with retry mechanism and tracing at TRACE level
   * Returns specific, actionable feedback when validation fails
   */
  private async runOutputGuardrails(
    agent: Agent<TContext, any>,
    state: RunState<TContext, any>,
    output: string
  ): Promise<{ passed: boolean; feedback?: string }> {
    const guardrails = agent._guardrails.filter((g) => g.type === 'output');
    if (guardrails.length === 0) return { passed: true };

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
            const metadata = result.metadata as { 
              characterLength: number; 
              tokenCount: number; 
              unit: string;
              maxLength: number;
            };
            
            let currentLength: number;
            if (metadata.unit === 'characters') {
              currentLength = metadata.characterLength;
            } else {
              currentLength = metadata.tokenCount;
            }
            const overagePercent = Math.round((currentLength / metadata.maxLength - 1) * 100);
            
            if (metadata.unit === 'tokens') {
              const currentWords = Math.round(metadata.tokenCount * 0.75);
              const maxWords = Math.round(metadata.maxLength * 0.75);
              actionableFeedback = `YOUR PREVIOUS RESPONSE WAS TOO LONG (~${currentWords} words, limit ~${maxWords} words, ${overagePercent}% over). YOU MUST REWRITE IT SHORTER. Take your previous response above and rewrite it with these changes:\n- Remove filler words and redundant phrases\n- Use shorter sentences\n- Keep only essential information\n- If listing items, use minimal descriptions\nOutput ONLY the shortened rewrite, nothing else.`;
            } else if (metadata.unit === 'characters') {
              const currentChars = metadata.characterLength;
              const maxChars = metadata.maxLength;
              actionableFeedback = `YOUR PREVIOUS RESPONSE WAS TOO LONG (${currentChars} chars, limit ${maxChars}, ${overagePercent}% over). YOU MUST REWRITE IT SHORTER. Take your previous response above and rewrite it with these changes:\n- Remove filler words\n- Use abbreviations where possible\n- Keep only the most critical info\n- If listing items, show fewer with minimal text\nOutput ONLY the shortened rewrite, nothing else.`;
            } else {
              const currentWords = output.split(/\s+/).length;
              actionableFeedback = `YOUR PREVIOUS RESPONSE WAS TOO LONG (${currentWords} words, limit ${metadata.maxLength}). YOU MUST REWRITE IT SHORTER. Take your previous response above and rewrite it more concisely. Output ONLY the shortened rewrite.`;
            }
          } else if (guardrail.name === 'pii_check' || result.message?.includes('PII')) {
            actionableFeedback = `Your response contains personally identifiable information (PII). Please rewrite your response without including any personal data, email addresses, phone numbers, or sensitive information.`;
          } else if (result.message?.includes('profanity') || result.message?.includes('inappropriate')) {
            actionableFeedback = `Your response contains inappropriate content. Please rewrite your response using professional and appropriate language.`;
          } else if (result.message?.includes('format')) {
            actionableFeedback = `Your response format is invalid. ${result.message}. Please reformat your response to match the required structure.`;
          } else {
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
        
        if (guardrailSpan) guardrailSpan.end();
      } catch (error) {
        try {
          if (guardrailSpan) {
            guardrailSpan.end({
              output: { error: sanitizeError(error) },
              level: 'ERROR'
            });
          }
          if (guardrailsSpan) guardrailsSpan.end({ level: 'ERROR' });
        } catch (_tracingError) {
          // Tracing errors must never break execution
        }
        return {
          passed: false,
          feedback: `Guardrail check failed: ${sanitizeError(error)}. Please regenerate your response.`
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
  private async flushTraces(): Promise<void> {
    if (!isLangfuseEnabled()) return;
    
    try {
      const langfuse = getLangfuse();
      if (langfuse) {
        await langfuse.flushAsync();
      }
    } catch (_error) {
      // Silently fail - tracing errors should not break execution
    }
  }
}

/**
 * Run an agent with true agentic patterns
 * 
 * @param agent - Agent to execute
 * @param input - User input
 * @param options - Run options
 * @returns Run result
 */
export async function run<TContext = any, TOutput = string>(
  agent: Agent<TContext, TOutput>,
  input: string | ModelMessage[],
  options: RunOptions<TContext> = {}
): Promise<RunResult<TOutput>> {
  const runner = new AgenticRunner<TContext, TOutput>(options);
  return await runner.execute(agent, input, options);
}


