/**
 * Agent Class Implementation
 *
 * @module core/agent/agent-class
 * @description
 * Core Agent class providing autonomous AI agent capabilities.
 *
 * @author Tawk.to
 * @license MIT
 * @version 3.0.0
 */

import type { LanguageModel, ToolCallRepairFunction, StopCondition, PrepareStepFunction, ToolSet } from 'ai';
import { z } from 'zod';
import { AgentHooks } from '../../lifecycle';
import { createTransferTools } from '../transfers';
import type {
  AgentConfig,
  CoreTool,
  Guardrail,
  ModelSettings,
  RunContextWrapper,
  StepResult,
  TokenizerFn,
} from './types';

/** Default tokenizer: 4 chars ≈ 1 token */
export const defaultTokenizerFn: TokenizerFn = (text: string): number => {
  return Math.ceil(text.length / 4);
};

// ============================================
// AGENT CLASS
// ============================================

/**
 * Agent class representing an autonomous AI agent.
 *
 * @template TContext - Type of context object passed to tools and guardrails
 * @template TOutput - Type of the agent's output (defaults to string)
 *
 * @example
 * ```typescript
 * const agent = new Agent({
 *   name: 'Assistant',
 *   instructions: 'You are a helpful AI assistant.',
 *   model: openai('gpt-4o'),
 *
 *   tools: { search, calculator },
 *   subagents: [billingAgent],
 *
 *   output: { schema: mySchema, toon: true },
 *
 *   modelSettings: { temperature: 0.7 },
 *
 *   execution: { maxSteps: 15 },
 *
 *   hooks: { onStepFinish: (step) => console.log(step) },
 * });
 * ```
 */
export class Agent<TContext = any, TOutput = string> extends AgentHooks<TContext, TOutput> {
  // ─── Identity ───
  public readonly name: string;
  public transferDescription?: string;

  // ─── Core ───
  private instructions: string | ((context: RunContextWrapper<TContext>) => string | Promise<string>);
  private model: LanguageModel;
  private tools: Record<string, CoreTool>;
  private _subagents: Agent<TContext, any>[] = [];
  private guardrails: Guardrail<TContext>[];

  // ─── Output ───
  private outputSchema?: z.ZodSchema<TOutput>;
  private useTOON: boolean;

  // ─── Model settings ───
  private modelSettings?: ModelSettings;

  // ─── Execution ───
  private maxSteps: number;
  private tokenizerFn: TokenizerFn;
  private toolCallRepair?: ToolCallRepairFunction<ToolSet>;
  private stopWhen?: StopCondition<ToolSet> | StopCondition<ToolSet>[];
  private activeTools?: string[];
  private prepareStep?: PrepareStepFunction<ToolSet>;

  // ─── Hooks ───
  private onStepFinish?: (step: StepResult) => void | Promise<void>;
  private shouldFinish?: (context: TContext, toolResults: any[]) => boolean;

  // ─── Internal ───
  private cachedInstructions?: string;

  constructor(config: AgentConfig<TContext, TOutput>) {
    super();

    // ─── Identity ───
    this.name = config.name;
    this.transferDescription = config.transferDescription;
    this.instructions = config.instructions;
    this.model = config.model;

    // ─── Capabilities ───
    this.tools = config.tools || {};
    this._subagents = config.subagents || [];
    this.guardrails = config.guardrails || [];

    // ─── Output ───
    this.outputSchema = config.output?.schema;
    this.useTOON = config.output?.toon ?? false;

    // ─── Model settings ───
    this.modelSettings = config.modelSettings;

    // ─── Execution ───
    this.maxSteps = config.execution?.maxSteps ?? 10;
    this.tokenizerFn = config.execution?.tokenizer ?? defaultTokenizerFn;
    this.toolCallRepair = config.execution?.toolCallRepair;
    this.stopWhen = config.execution?.stopWhen;
    this.activeTools = config.execution?.activeTools;
    this.prepareStep = config.execution?.prepareStep;

    // ─── Hooks ───
    this.onStepFinish = config.hooks?.onStepFinish;
    this.shouldFinish = config.hooks?.shouldFinish;

    // Setup transfer tools for subagents
    this._setupTransferTools();
  }

  /**
   * Create an agent instance with better TypeScript inference.
   */
  static create<TContext = any, TOutput = string>(
    config: AgentConfig<TContext, TOutput>
  ): Agent<TContext, TOutput> {
    return new Agent(config);
  }

  // ============================================
  // SUBAGENTS MANAGEMENT
  // ============================================

  get subagents(): Agent<TContext, any>[] {
    return this._subagents;
  }

  set subagents(agents: Agent<TContext, any>[]) {
    const oldToolNames = Object.keys(this.tools).filter(name =>
      name.startsWith('transfer_to_') || name.startsWith('handoff_to_')
    );
    for (const name of oldToolNames) {
      delete this.tools[name];
    }
    this._subagents = agents || [];
    this._setupTransferTools();
  }

  private _setupTransferTools(): void {
    const transferTools = createTransferTools(this as any, this._subagents as any);
    Object.assign(this.tools, transferTools);
  }

  // ============================================
  // INSTRUCTIONS
  // ============================================

  /** @internal */
  async getInstructions(context: RunContextWrapper<TContext>): Promise<string> {
    if (this.cachedInstructions !== undefined) {
      return this.cachedInstructions;
    }

    if (typeof this.instructions === 'function') {
      return await this.instructions(context);
    }

    this.cachedInstructions = this.instructions;
    return this.cachedInstructions;
  }

  // ============================================
  // AGENT MANIPULATION
  // ============================================

  /**
   * Create a clone with optional overrides.
   */
  clone(overrides: Partial<AgentConfig<TContext, TOutput>>): Agent<TContext, TOutput> {
    return new Agent({
      name: overrides.name ?? this.name,
      instructions: overrides.instructions ?? this.instructions,
      model: overrides.model ?? this.model,
      tools: overrides.tools ?? this.tools,
      subagents: overrides.subagents ?? this.subagents,
      guardrails: overrides.guardrails ?? this.guardrails,
      output: {
        schema: overrides.output?.schema ?? this.outputSchema,
        toon: overrides.output?.toon ?? this.useTOON,
      },
      modelSettings: overrides.modelSettings ?? this.modelSettings,
      execution: {
        maxSteps: overrides.execution?.maxSteps ?? this.maxSteps,
        tokenizer: overrides.execution?.tokenizer ?? this.tokenizerFn,
        toolCallRepair: overrides.execution?.toolCallRepair ?? this.toolCallRepair,
        stopWhen: overrides.execution?.stopWhen ?? this.stopWhen,
        activeTools: overrides.execution?.activeTools ?? this.activeTools,
        prepareStep: overrides.execution?.prepareStep ?? this.prepareStep,
      },
      hooks: {
        onStepFinish: overrides.hooks?.onStepFinish ?? this.onStepFinish,
        shouldFinish: overrides.hooks?.shouldFinish ?? this.shouldFinish,
      },
    });
  }

  /**
   * Convert this agent into a tool usable by other agents.
   */
  asTool(options: {
    toolName?: string;
    toolDescription?: string;
  } = {}): CoreTool {
    const toolDescription = options.toolDescription || `Delegate to ${this.name}`;

    return {
      description: toolDescription,
      inputSchema: z.object({
        query: z.string().describe('Query or request for the agent')
      }),
      execute: async (_args: { query: string }, _context: any) => {
        throw new Error('asTool requires run() function - will be resolved in final assembly');
      }
    };
  }

  // ============================================
  // INTERNAL ACCESSORS (used by runner/execution)
  // ============================================

  /** @internal */
  get _model() { return this.model; }
  /** @internal */
  get _tools() { return this.tools; }
  /** @internal */
  get _guardrails() { return this.guardrails; }
  /** @internal */
  get _outputSchema() { return this.outputSchema; }
  /** @internal */
  get _maxSteps() { return this.maxSteps; }
  /** @internal */
  get _modelSettings() { return this.modelSettings; }
  /** @internal */
  get _tokenizerFn() { return this.tokenizerFn; }
  /** @internal */
  get _onStepFinish() { return this.onStepFinish; }
  /** @internal */
  get _shouldFinish() { return this.shouldFinish; }
  /** @internal */
  get _useTOON() { return this.useTOON; }
  /** @internal */
  get _toolCallRepair() { return this.toolCallRepair; }
  /** @internal */
  get _stopWhen() { return this.stopWhen; }
  /** @internal */
  get _activeTools() { return this.activeTools; }
  /** @internal */
  get _prepareStep() { return this.prepareStep; }
}
