/**
 * Stream event renderer for tawk-cli
 *
 * Claude Code-style inline transcript rendering:
 * - Responses stream inline as flowing text
 * - Tool calls shown as compact "⎿ ToolName(args)" lines
 * - Subagent flow: agent headers, transfers, indented nesting
 * - Spinner on stderr (doesn't interfere with readline)
 * - No bordered panels — clean scrolling transcript
 */

import pc from 'picocolors';
import type { StreamEvent } from '../../src';

// ============================================
// SPINNER (stderr-only, readline-safe)
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
      process.stderr.write('\r\x1b[K');
    }
  }

  isRunning(): boolean {
    return this.interval !== null;
  }

  private render(): void {
    const frame = SPINNER_FRAMES[this.frameIndex % SPINNER_FRAMES.length];
    process.stderr.write(`\r\x1b[K${pc.cyan(frame)} ${pc.dim(this.message)}`);
    this.frameIndex++;
  }
}

// ============================================
// USAGE META
// ============================================

export interface UsageMeta {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  toolCalls: number;
  duration: number;
  cost: number;
  handoffChain?: string[];
}

// ============================================
// RENDERER
// ============================================

export class StreamRenderer {
  private spinner = new Spinner();
  private inTextStream = false;
  private verbose: boolean;
  private toolStartTimes = new Map<string, number>();

  // Subagent tracking
  private currentAgent: string | null = null;
  private agentCount = 0;
  private isFirstAgent = true;

  constructor(verbose = false) {
    this.verbose = verbose;
  }

  async init(): Promise<void> {
    // No-op — kept for API compatibility.
  }

  setVerbose(verbose: boolean): void {
    this.verbose = verbose;
  }

  /**
   * Render a stream event to the terminal (Claude Code-style inline transcript)
   */
  render(event: StreamEvent): void {
    switch (event.type) {
      case 'agent-start':
        this.endTextStream();
        this.spinner.stop();
        this.agentCount++;

        if (this.isFirstAgent) {
          // First agent — just show a newline + spinner, no header needed
          this.isFirstAgent = false;
          this.currentAgent = event.agentName;
          process.stdout.write('\n');
        } else {
          // Subsequent agent after transfer — show agent header
          this.currentAgent = event.agentName;
          process.stdout.write(
            '\n' +
            pc.dim('  ⎿ ') + pc.bold(pc.blue('Agent: ')) + pc.bold(event.agentName) +
            '\n'
          );
        }
        this.spinner.start('Thinking...');
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
          const argsStr = formatArgsCompact(event.args);
          process.stdout.write(
            pc.dim('  ⎿ ') +
            pc.cyan(event.toolName) +
            (argsStr ? pc.dim('(' + argsStr + ')') : '') +
            '\n'
          );
        }
        this.spinner.start(`Running ${event.toolName}...`);
        break;

      case 'tool-result':
        this.spinner.stop();
        {
          const startTime = this.toolStartTimes.get(event.toolCallId);
          const duration = startTime ? Date.now() - startTime : 0;
          this.toolStartTimes.delete(event.toolCallId);

          const preview = truncate(formatResult(event.result), getTermWidth() - 12);
          process.stdout.write(
            pc.dim('    ') +
            pc.dim(preview) +
            (duration ? pc.dim(` (${formatDuration(duration)})`) : '') +
            '\n'
          );
        }
        this.spinner.start('Thinking...');
        break;

      case 'transfer':
        this.endTextStream();
        this.spinner.stop();
        process.stdout.write(
          '\n' +
          pc.dim('  ⎿ ') +
          pc.magenta('Transfer') +
          pc.dim(' → ') + pc.bold(event.to) +
          (event.reason ? pc.dim(' (' + event.reason + ')') : '') +
          '\n'
        );
        break;

      case 'step-start':
        if (this.verbose) {
          this.endTextStream();
          process.stdout.write(pc.dim(`  ── step ${event.stepNumber} ──`) + '\n');
        }
        break;

      case 'step-complete':
        if (this.verbose) {
          this.endTextStream();
          process.stdout.write(pc.dim(`  ── step ${event.stepNumber} done ──`) + '\n');
        }
        break;

      case 'guardrail-check':
        if (this.verbose) {
          this.endTextStream();
          const icon = event.passed ? pc.green('✓') : pc.red('✗');
          process.stdout.write(pc.dim(`  ${icon} guardrail: ${event.guardrailName}`) + '\n');
        }
        break;

      case 'agent-end':
        this.endTextStream();
        break;

      case 'finish':
        this.endTextStream();
        this.spinner.stop();
        // Reset agent tracking for next turn
        this.currentAgent = null;
        this.agentCount = 0;
        this.isFirstAgent = true;
        break;
    }
  }

  /**
   * Display usage/cost as a compact dim line (Claude Code style)
   * Includes handoff chain when multi-agent transfers occurred.
   */
  renderUsage(meta: UsageMeta): void {
    this.endTextStream();
    const parts = [
      `${fmt(meta.totalTokens)} tokens`,
      `${formatDuration(meta.duration)}`,
      `~$${meta.cost.toFixed(4)}`,
    ];
    if (meta.toolCalls > 0) {
      parts.splice(1, 0, `${meta.toolCalls} tool${meta.toolCalls === 1 ? '' : 's'}`);
    }
    // Show agent count if multi-agent
    if (meta.handoffChain && meta.handoffChain.length > 1) {
      parts.splice(1, 0, `${meta.handoffChain.length} agents`);
    }

    process.stdout.write('\n' + pc.dim('  ' + parts.join(' · ')) + '\n');

    // Show handoff chain
    if (meta.handoffChain && meta.handoffChain.length > 1) {
      process.stdout.write(
        pc.dim('  Agents: ') +
        meta.handoffChain.map((a, i) =>
          i < meta.handoffChain!.length - 1
            ? pc.dim(a + ' → ')
            : pc.bold(a)
        ).join('') +
        '\n'
      );
    }
  }

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

  pauseSpinner(): void {
    this.spinner.stop();
  }

  resumeSpinner(msg: string): void {
    this.spinner.start(msg);
  }
}

// ============================================
// HELPERS
// ============================================

/** Format tool args as a compact string like "path=src/index.ts" or "command=ls -la" */
function formatArgsCompact(args: any): string {
  if (!args) return '';
  try {
    const entries = Object.entries(args);
    if (entries.length === 0) return '';
    if (entries.length === 1) {
      const [, val] = entries[0];
      const s = typeof val === 'string' ? val : JSON.stringify(val);
      return truncate(s, 60);
    }
    return truncate(
      entries.map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`).join(', '),
      80
    );
  } catch {
    return '';
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
  const clean = str.replace(/\n/g, '↵');
  if (clean.length <= maxLen) return clean;
  return clean.slice(0, maxLen - 1) + '…';
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
