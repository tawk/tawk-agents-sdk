import { StreamRenderer } from '../../../bin/cli/renderer';
import type { StreamEvent } from '../../../src';

describe('StreamRenderer', () => {
  let renderer: StreamRenderer;
  let stdoutSpy: jest.SpyInstance;
  let stderrSpy: jest.SpyInstance;
  let stdoutOutput: string;
  let stderrOutput: string;

  beforeEach(async () => {
    renderer = new StreamRenderer(false);
    await renderer.init();
    stdoutOutput = '';
    stderrOutput = '';
    stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation((data: any) => {
      stdoutOutput += typeof data === 'string' ? data : data.toString();
      return true;
    });
    stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation((data: any) => {
      stderrOutput += typeof data === 'string' ? data : data.toString();
      return true;
    });
  });

  afterEach(() => {
    renderer.cleanup();
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
  });

  it('should start spinner on agent-start', () => {
    renderer.render({ type: 'agent-start', agentName: 'TestAgent' });
    expect(stderrOutput).toContain('Thinking...');
  });

  it('should render text-delta directly to stdout', () => {
    renderer.render({ type: 'text-delta', textDelta: 'Hello' });
    renderer.render({ type: 'text-delta', textDelta: ' World' });
    expect(stdoutOutput).toBe('Hello World');
  });

  it('should stop spinner before text-delta', () => {
    renderer.render({ type: 'agent-start', agentName: 'Test' });
    stderrOutput = '';
    renderer.render({ type: 'text-delta', textDelta: 'Hello' });
    expect(stderrOutput).toContain('\r\x1b[K');
  });

  it('should render tool-call with ⎿ prefix and tool name', () => {
    renderer.render({
      type: 'tool-call',
      toolName: 'calculator',
      args: { expression: '2+2' },
      toolCallId: 'tc-1',
    });
    expect(stdoutOutput).toContain('⎿');
    expect(stdoutOutput).toContain('calculator');
  });

  it('should show compact tool args', () => {
    renderer.render({
      type: 'tool-call',
      toolName: 'read_file',
      args: { path: 'src/index.ts' },
      toolCallId: 'tc-1',
    });
    expect(stdoutOutput).toContain('src/index.ts');
  });

  it('should start spinner after tool-call', () => {
    stderrOutput = '';
    renderer.render({
      type: 'tool-call',
      toolName: 'calculator',
      args: {},
      toolCallId: 'tc-1',
    });
    expect(stderrOutput).toContain('Running calculator...');
  });

  it('should render tool-result as indented preview', () => {
    renderer.render({
      type: 'tool-call',
      toolName: 'calculator',
      args: {},
      toolCallId: 'tc-1',
    });
    renderer.render({
      type: 'tool-result',
      toolName: 'calculator',
      result: { answer: 4 },
      toolCallId: 'tc-1',
    });
    expect(stdoutOutput).toContain('answer');
  });

  it('should restart spinner after tool-result', () => {
    renderer.render({
      type: 'tool-call',
      toolName: 'calculator',
      args: {},
      toolCallId: 'tc-1',
    });
    stderrOutput = '';
    renderer.render({
      type: 'tool-result',
      toolName: 'calculator',
      result: { answer: 4 },
      toolCallId: 'tc-1',
    });
    expect(stderrOutput).toContain('Thinking...');
  });

  it('should render transfer event', () => {
    renderer.render({
      type: 'transfer',
      from: 'Agent1',
      to: 'Agent2',
      reason: 'needs specialist',
    });
    expect(stdoutOutput).toContain('Agent2');
    expect(stdoutOutput).toContain('Transfer');
  });

  it('should not render step events in non-verbose mode', () => {
    renderer.render({ type: 'step-start', stepNumber: 1 });
    renderer.render({ type: 'step-complete', stepNumber: 1 });
    expect(stdoutOutput).toBe('');
  });

  it('should render step events in verbose mode', () => {
    renderer.setVerbose(true);
    renderer.render({ type: 'step-start', stepNumber: 1 });
    expect(stdoutOutput).toContain('step 1');
  });

  it('should render guardrail events in verbose mode', () => {
    renderer.setVerbose(true);
    renderer.render({
      type: 'guardrail-check',
      guardrailName: 'content-safety',
      passed: true,
    });
    expect(stdoutOutput).toContain('content-safety');
    expect(stdoutOutput).toContain('✓');
  });

  it('should insert newline before tool events if mid-text-stream', () => {
    renderer.render({ type: 'text-delta', textDelta: 'thinking...' });
    renderer.render({
      type: 'tool-call',
      toolName: 'calculator',
      args: {},
      toolCallId: 'tc-1',
    });
    expect(stdoutOutput).toContain('thinking...\n');
  });

  it('should render compact usage summary', () => {
    renderer.renderUsage({
      inputTokens: 1234,
      outputTokens: 567,
      totalTokens: 1801,
      toolCalls: 3,
      duration: 2400,
      cost: 0.004,
    });
    expect(stdoutOutput).toContain('1,801 tokens');
    expect(stdoutOutput).toContain('2.4s');
    expect(stdoutOutput).toContain('$0.0040');
    expect(stdoutOutput).toContain('3 tools');
  });

  it('should handle finish event after text stream', () => {
    renderer.render({ type: 'text-delta', textDelta: 'done' });
    renderer.render({ type: 'finish', finishReason: 'stop' });
    expect(stdoutOutput).toContain('done\n');
  });

  it('should handle tool-result with null result', () => {
    renderer.render({
      type: 'tool-result',
      toolName: 'test',
      result: null,
      toolCallId: 'tc-1',
    });
    expect(stdoutOutput).toContain('(empty)');
  });

  it('should truncate long tool result previews', () => {
    const longResult = 'x'.repeat(500);
    renderer.render({
      type: 'tool-result',
      toolName: 'test',
      result: longResult,
      toolCallId: 'tc-1',
    });
    expect(stdoutOutput).toContain('…');
  });

  describe('pauseSpinner / resumeSpinner', () => {
    it('should stop the spinner on pauseSpinner', () => {
      renderer.render({ type: 'agent-start', agentName: 'Test' });
      stderrOutput = '';
      renderer.pauseSpinner();
      expect(stderrOutput).toContain('\r\x1b[K');
    });

    it('should restart the spinner on resumeSpinner', () => {
      stderrOutput = '';
      renderer.resumeSpinner('Working...');
      expect(stderrOutput).toContain('Working...');
    });
  });
});
