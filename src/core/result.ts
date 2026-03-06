/**
 * Result Types - Enhanced RunResult
 * 
 * Provides rich result types with history, output, metadata, and more.
 * 
 * @module result
 */

import type { Agent } from './agent';
import type { RunState, RunItem } from './runstate';
import type { ModelMessage } from 'ai';

/**
 * Enhanced RunResult with additional properties
 */
export class RunResult<TContext = any, TAgent extends Agent<TContext, any> = Agent<any, any>> {
  constructor(public readonly state: RunState<TContext>) {}

  /**
   * The history of the agent run.
   * Includes input items + new items generated during the run.
   * Can be used as input for the next agent run.
   */
  get history(): ModelMessage[] {
    const inputMessages = typeof this.state.originalInput === 'string'
      ? [{ role: 'user' as const, content: this.state.originalInput }]
      : this.state.originalInput;

    // Avoid duplicating input if it's already the prefix of state.messages
    // (which happens when the runner copies originalInput into messages at start)
    if (
      this.state.messages.length > 0 &&
      inputMessages.length > 0 &&
      this.state.messages[0] === inputMessages[0]
    ) {
      return [...this.state.messages];
    }

    return [...inputMessages, ...this.state.messages];
  }

  /**
   * The new items generated during the agent run.
   * These include messages, tool calls, tool outputs, etc.
   */
  get output(): ModelMessage[] {
    return this.state.messages;
  }

  /**
   * The original input items (before the run)
   */
  get input(): string | ModelMessage[] {
    return this.state.originalInput;
  }

  /**
   * All run items generated during the run (derived from steps)
   */
  get newItems(): RunItem[] {
    const items: RunItem[] = [];
    for (const step of this.state.steps) {
      for (const toolCall of step.toolCalls) {
        items.push({
          type: 'tool_call',
          toolName: toolCall.toolName,
          args: toolCall.args,
          result: toolCall.result,
        } as RunItem);
      }
      if (step.text) {
        items.push({
          role: 'assistant',
          content: step.text,
        } as RunItem);
      }
    }
    return items;
  }

  /**
   * The last agent that ran
   */
  get lastAgent(): TAgent | undefined {
    return this.state.currentAgent as TAgent;
  }

  /**
   * The current agent (alias for lastAgent)
   */
  get currentAgent(): TAgent | undefined {
    return this.lastAgent;
  }

  /**
   * Input guardrail results
   */
  get inputGuardrailResults(): any[] {
    return (this.state as any).inputGuardrailResults || [];
  }

  /**
   * Output guardrail results
   */
  get outputGuardrailResults(): any[] {
    return (this.state as any).outputGuardrailResults || [];
  }

  /**
   * Final output (already available in base result)
   */
  get finalOutput(): any {
    // This will be set by the caller
    return (this as any)._finalOutput;
  }

  set finalOutput(value: any) {
    (this as any)._finalOutput = value;
  }

  /**
   * Steps taken during the run
   */
  get steps(): any[] {
    return (this as any)._steps || [];
  }

  set steps(value: any[]) {
    (this as any)._steps = value;
  }

  /**
   * Metadata
   */
  get metadata(): any {
    return (this as any)._metadata || {};
  }

  set metadata(value: any) {
    (this as any)._metadata = value;
  }

  /**
   * Messages
   */
  get messages(): ModelMessage[] {
    return this.state.messages;
  }
}

/**
 * Streaming run result
 */
export class StreamedRunResult<TContext = any, TAgent extends Agent<TContext, any> = Agent<any, any>>
  extends RunResult<TContext, TAgent>
  implements AsyncIterable<any> {

  private _currentTurn: number = 0;
  private _maxTurns: number | undefined;
  private _cancelled: boolean = false;
  private _error: unknown = null;
  private _completed: Promise<void>;
  private _resolveCompleted?: () => void;
  private _rejectCompleted?: (err: unknown) => void;

  /** Internal event buffer filled by the streaming runner */
  private _events: Array<{ type: string; [key: string]: any }> = [];
  private _eventsDone: boolean = false;
  private _eventWaiters: Array<() => void> = [];

  constructor(state: RunState<TContext>) {
    super(state);

    this._completed = new Promise((resolve, reject) => {
      this._resolveCompleted = resolve;
      this._rejectCompleted = reject;
    });
  }

  /**
   * Current turn number
   */
  get currentTurn(): number {
    return this._currentTurn;
  }

  set currentTurn(value: number) {
    this._currentTurn = value;
  }

  /**
   * Maximum turns
   */
  get maxTurns(): number | undefined {
    return this._maxTurns;
  }

  set maxTurns(value: number | undefined) {
    this._maxTurns = value;
  }

  /**
   * Whether the stream has been cancelled
   */
  get cancelled(): boolean {
    return this._cancelled;
  }

  /**
   * Cancel the stream
   */
  cancel(): void {
    this._cancelled = true;
  }

  /**
   * Promise that resolves when stream completes
   */
  get completed(): Promise<void> {
    return this._completed;
  }

  /**
   * Error that occurred during streaming
   */
  get error(): unknown {
    return this._error;
  }

  /**
   * Push an event into the buffer (called by the streaming runner)
   */
  _pushEvent(event: { type: string; [key: string]: any }): void {
    this._events.push(event);
    for (const w of this._eventWaiters) w();
    this._eventWaiters.length = 0;
  }

  /**
   * Mark as done
   */
  _done(): void {
    this._eventsDone = true;
    for (const w of this._eventWaiters) w();
    this._eventWaiters.length = 0;
    this._resolveCompleted?.();
  }

  /**
   * Set error
   */
  _raiseError(err: unknown): void {
    this._error = err;
    this._eventsDone = true;
    for (const w of this._eventWaiters) w();
    this._eventWaiters.length = 0;
    this._rejectCompleted?.(err);
  }

  /**
   * Async iterator — yields all events (text deltas, tool calls, etc.)
   */
  async *[Symbol.asyncIterator](): AsyncIterator<any> {
    let index = 0;
    while (true) {
      while (index < this._events.length) {
        if (this._cancelled) return;
        yield this._events[index++];
      }
      if (this._eventsDone) break;
      await new Promise<void>((resolve) => { this._eventWaiters.push(resolve); });
    }
    if (this._error) throw this._error;
  }

  /**
   * Convert to text stream — yields only text delta strings
   */
  toTextStream(): AsyncIterable<string> {
    const self = this;
    return {
      async *[Symbol.asyncIterator]() {
        for await (const event of self) {
          if (event.type === 'text-delta' && event.textDelta) {
            yield event.textDelta as string;
          }
        }
      }
    };
  }
}

