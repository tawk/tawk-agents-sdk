/**
 * Stream event renderer for tawk-cli
 *
 * Maps StreamEvent types to colored terminal output with inline spinner.
 */

import pc from 'picocolors';
import type { StreamEvent } from '../../src';

// ============================================
// INLINE SPINNER (zero-dependency)
// ============================================

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

class Spinner {
  private interval: ReturnType<typeof setInterval> | null = null;
  private frameIndex = 0;
  private message = '';

  start(message: string): void {
    this.stop();
    this.message = message;
    this.frameIndex = 0;
    this.render();
    this.interval = setInterval(() => this.render(), 80);
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      // Clear the spinner line
      process.stderr.write('\r\x1b[K');
    }
  }

  isRunning(): boolean {
    return this.interval !== null;
  }

  private render(): void {
    const frame = SPINNER_FRAMES[this.frameIndex % SPINNER_FRAMES.length];
    process.stderr.write(`\r\x1b[K${pc.yellow(frame)} ${pc.dim(this.message)}`);
    this.frameIndex++;
  }
}

// ============================================
// RENDERER
// ============================================

export class StreamRenderer {
  private spinner = new Spinner();
  private inTextStream = false;
  private verbose: boolean;
  private toolStartTimes = new Map<string, number>();

  constructor(verbose = false) {
    this.verbose = verbose;
  }

  setVerbose(verbose: boolean): void {
    this.verbose = verbose;
  }

  /**
   * Render a stream event to the terminal
   */
  render(event: StreamEvent): void {
    switch (event.type) {
      case 'agent-start':
        this.endTextStream();
        process.stdout.write(
          '\n' + pc.cyan(pc.bold(`Agent: ${event.agentName}`)) + ' ' + pc.dim('─'.repeat(40)) + '\n'
        );
        break;

      case 'text-delta':
        this.spinner.stop();
        if (!this.inTextStream) {
          this.inTextStream = true;
        }
        process.stdout.write(event.textDelta);
        break;

      case 'tool-call':
        this.endTextStream();
        this.spinner.stop();
        this.toolStartTimes.set(event.toolCallId, Date.now());
        {
          const argsStr = truncate(formatArgs(event.args), getTermWidth() - 30);
          process.stdout.write(
            pc.yellow(`  ⚡ Tool  ${event.toolName}`) +
            (argsStr ? ' ' + pc.dim(argsStr) : '') +
            '\n'
          );
        }
        this.spinner.start(`Executing ${event.toolName}...`);
        break;

      case 'tool-result':
        this.spinner.stop();
        {
          const startTime = this.toolStartTimes.get(event.toolCallId);
          const duration = startTime ? Date.now() - startTime : 0;
          this.toolStartTimes.delete(event.toolCallId);

          const preview = truncate(formatResult(event.result), 200);
          process.stdout.write(
            pc.green(`  ✓ Result`) +
            ' ' + pc.dim(preview) +
            (duration ? ' ' + pc.dim(`(${formatDuration(duration)})`) : '') +
            '\n'
          );
        }
        break;

      case 'transfer':
        this.endTextStream();
        this.spinner.stop();
        process.stdout.write(
          pc.magenta(pc.bold(`  ↗ Transfer  ${event.from} → ${event.to}`)) +
          (event.reason ? ' ' + pc.dim(event.reason) : '') +
          '\n'
        );
        break;

      case 'step-start':
        if (this.verbose) {
          this.endTextStream();
          process.stdout.write(pc.dim(`--- Step ${event.stepNumber} ---`) + '\n');
        }
        break;

      case 'step-complete':
        if (this.verbose) {
          this.endTextStream();
          process.stdout.write(pc.dim(`--- Step ${event.stepNumber} complete ---`) + '\n');
        }
        break;

      case 'guardrail-check':
        if (this.verbose) {
          this.endTextStream();
          const status = event.passed ? pc.green('✓') : pc.red('✗');
          process.stdout.write(
            pc.dim(`  Guardrail: ${event.guardrailName} ${status}`) + '\n'
          );
        }
        break;

      case 'agent-end':
        this.endTextStream();
        break;

      case 'finish':
        this.endTextStream();
        this.spinner.stop();
        break;
    }
  }

  /**
   * Display usage summary after a turn
   */
  renderUsage(meta: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    toolCalls: number;
    duration: number;
    cost: number;
  }): void {
    this.endTextStream();
    process.stdout.write(
      '\n' +
      pc.dim(
        `  Tokens  in: ${fmt(meta.inputTokens)}  out: ${fmt(meta.outputTokens)}` +
        `  total: ${fmt(meta.totalTokens)}` +
        `  |  Tools: ${meta.toolCalls}` +
        `  |  Duration: ${formatDuration(meta.duration)}` +
        `  |  Cost: ~$${meta.cost.toFixed(4)}`
      ) +
      '\n'
    );
  }

  /**
   * End current text stream with a newline if needed
   */
  endTextStream(): void {
    if (this.inTextStream) {
      process.stdout.write('\n');
      this.inTextStream = false;
    }
  }

  cleanup(): void {
    this.spinner.stop();
    this.endTextStream();
  }
}

// ============================================
// HELPERS
// ============================================

function formatArgs(args: any): string {
  if (!args) return '';
  try {
    const str = JSON.stringify(args);
    return str === '{}' ? '' : str;
  } catch {
    return String(args);
  }
}

function formatResult(result: any): string {
  if (result === undefined || result === null) return '(empty)';
  if (typeof result === 'string') return result;
  try {
    return JSON.stringify(result);
  } catch {
    return String(result);
  }
}

function truncate(str: string, maxLen: number): string {
  // Replace newlines for display
  const clean = str.replace(/\n/g, '↵');
  if (clean.length <= maxLen) return clean;
  return clean.slice(0, maxLen - 3) + '...';
}

function fmt(n: number): string {
  return n.toLocaleString('en-US');
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function getTermWidth(): number {
  return process.stdout.columns || 80;
}
