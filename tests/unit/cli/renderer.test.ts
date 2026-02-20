import { StreamRenderer } from '../../../bin/cli/renderer';
import type { StreamEvent } from '../../../src';

describe('StreamRenderer', () => {
  let renderer: StreamRenderer;
  let stdoutSpy: jest.SpyInstance;
  let stderrSpy: jest.SpyInstance;
  let stdoutOutput: string;
  let stderrOutput: string;

  beforeEach(() => {
    renderer = new StreamRenderer(false);
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

  it('should render agent-start event', () => {
    renderer.render({ type: 'agent-start', agentName: 'TestAgent' });
    expect(stdoutOutput).toContain('Agent: TestAgent');
  });

  it('should render text-delta directly to stdout', () => {
    renderer.render({ type: 'text-delta', textDelta: 'Hello' });
    renderer.render({ type: 'text-delta', textDelta: ' World' });
    expect(stdoutOutput).toBe('Hello World');
  });

  it('should render tool-call event with tool name', () => {
    renderer.render({
      type: 'tool-call',
      toolName: 'calculator',
      args: { expression: '2+2' },
      toolCallId: 'tc-1',
    });
    expect(stdoutOutput).toContain('calculator');
    expect(stdoutOutput).toContain('⚡');
  });

  it('should render tool-result event with green checkmark', () => {
    // First start the tool to register timing
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
    expect(stdoutOutput).toContain('✓');
    expect(stdoutOutput).toContain('Result');
  });

  it('should render transfer event', () => {
    renderer.render({
      type: 'transfer',
      from: 'Agent1',
      to: 'Agent2',
      reason: 'needs specialist',
    });
    expect(stdoutOutput).toContain('Agent1');
    expect(stdoutOutput).toContain('Agent2');
    expect(stdoutOutput).toContain('↗');
  });

  it('should not render step events in non-verbose mode', () => {
    renderer.render({ type: 'step-start', stepNumber: 1 });
    renderer.render({ type: 'step-complete', stepNumber: 1 });
    expect(stdoutOutput).toBe('');
  });

  it('should render step events in verbose mode', () => {
    renderer.setVerbose(true);
    renderer.render({ type: 'step-start', stepNumber: 1 });
    expect(stdoutOutput).toContain('Step 1');
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
    // Should have a newline to end text stream before tool output
    expect(stdoutOutput).toContain('thinking...\n');
  });

  it('should render usage summary', () => {
    renderer.renderUsage({
      inputTokens: 1234,
      outputTokens: 567,
      totalTokens: 1801,
      toolCalls: 3,
      duration: 2400,
      cost: 0.004,
    });
    expect(stdoutOutput).toContain('1,234');
    expect(stdoutOutput).toContain('567');
    expect(stdoutOutput).toContain('1,801');
    expect(stdoutOutput).toContain('Tools: 3');
    expect(stdoutOutput).toContain('2.4s');
    expect(stdoutOutput).toContain('$0.0040');
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
    expect(stdoutOutput).toContain('...');
  });
});
