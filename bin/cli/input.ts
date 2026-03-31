/**
 * Multi-line input state machine for tawk-cli
 *
 * Supports:
 * - Backslash continuation: line ending with `\` → joins with next line
 * - Block mode: `"""` on its own line → collects until closing `"""`
 * - Normal single-line input (passthrough)
 */

export interface InputResult {
  /** Whether the input is complete and ready to process */
  complete: boolean;
  /** The assembled input text (only set when complete=true) */
  text?: string;
  /** Hint for the prompt to show (e.g. '... ' for continuation) */
  promptHint?: string;
}

export class MultiLineInput {
  private buffer: string[] = [];
  private mode: 'none' | 'continuation' | 'block' = 'none';

  /**
   * Feed a line of input. Returns whether the input is complete.
   */
  feed(line: string): InputResult {
    switch (this.mode) {
      case 'none':
        return this.handleNone(line);
      case 'continuation':
        return this.handleContinuation(line);
      case 'block':
        return this.handleBlock(line);
    }
  }

  reset(): void {
    this.buffer = [];
    this.mode = 'none';
  }

  isActive(): boolean {
    return this.mode !== 'none';
  }

  private handleNone(line: string): InputResult {
    // Block mode start
    if (line.trim() === '"""') {
      this.mode = 'block';
      this.buffer = [];
      return { complete: false, promptHint: '""" ' };
    }

    // Backslash continuation
    if (line.endsWith('\\')) {
      this.mode = 'continuation';
      this.buffer = [line.slice(0, -1)];
      return { complete: false, promptHint: '... ' };
    }

    // Normal single-line
    return { complete: true, text: line };
  }

  private handleContinuation(line: string): InputResult {
    if (line.endsWith('\\')) {
      // Still continuing
      this.buffer.push(line.slice(0, -1));
      return { complete: false, promptHint: '... ' };
    }

    // Final line
    this.buffer.push(line);
    const text = this.buffer.join('\n');
    this.reset();
    return { complete: true, text };
  }

  private handleBlock(line: string): InputResult {
    if (line.trim() === '"""') {
      // Close block
      const text = this.buffer.join('\n');
      this.reset();
      return { complete: true, text };
    }

    this.buffer.push(line);
    return { complete: false, promptHint: '""" ' };
  }
}
