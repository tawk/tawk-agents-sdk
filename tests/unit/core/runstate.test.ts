import { RunState } from '@tawk-agents-sdk/core';

const mockAgent = {
  name: 'test-agent',
  _tools: {},
  _guardrails: [],
  subagents: [],
  _model: {},
  _tokenizerFn: (text: string) => Math.ceil(text.length / 4),
} as any;

describe('RunState', () => {
  let state: InstanceType<typeof RunState>;

  beforeEach(() => {
    state = new RunState(mockAgent, 'test input', {}, 50);
  });

  it('should initialize with correct defaults', () => {
    expect(state.currentAgent).toBe(mockAgent);
    expect(state.originalInput).toBe('test input');
    expect(state.steps).toEqual([]);
    expect(state.handoffChain).toEqual(['test-agent']);
  });

  it('should initialize messages from string input', () => {
    expect(state.messages).toEqual([{ role: 'user', content: 'test input' }]);
  });

  it('should track step number starting from 0', () => {
    expect(state.stepNumber).toBe(0);
  });

  it('should increment turn count', () => {
    expect(state.currentTurn).toBe(0);
    state.incrementTurn();
    expect(state.currentTurn).toBe(1);
  });

  it('should detect max turns exceeded', () => {
    const smallState = new RunState(mockAgent, 'input', {}, 2);
    expect(smallState.isMaxTurnsExceeded()).toBe(false);
    smallState.incrementTurn();
    smallState.incrementTurn();
    expect(smallState.isMaxTurnsExceeded()).toBe(true);
  });

  it('should not exceed when at exactly one less than max', () => {
    const smallState = new RunState(mockAgent, 'input', {}, 2);
    smallState.incrementTurn();
    expect(smallState.isMaxTurnsExceeded()).toBe(false);
  });

  it('should record steps', () => {
    state.recordStep({
      stepNumber: 1,
      agentName: 'test-agent',
      toolCalls: [],
      text: 'hello',
      timestamp: Date.now(),
    });
    expect(state.steps).toHaveLength(1);
    expect(state.steps[0].text).toBe('hello');
  });

  it('should increment stepNumber on recordStep', () => {
    state.recordStep({
      stepNumber: 1,
      agentName: 'test-agent',
      toolCalls: [],
      text: 'hello',
      timestamp: Date.now(),
    });
    expect(state.stepNumber).toBe(1);
  });

  it('should track handoffs without duplicates', () => {
    state.trackHandoff('billing-agent');
    state.trackHandoff('billing-agent');
    expect(state.handoffChain).toEqual(['test-agent', 'billing-agent']);
  });

  it('should manage interruptions', () => {
    expect(state.hasInterruptions()).toBe(false);
    state.addInterruption({ type: 'approval_needed', toolName: 'delete' });
    expect(state.hasInterruptions()).toBe(true);
    expect(state.pendingInterruptions).toHaveLength(1);
    state.clearInterruptions();
    expect(state.hasInterruptions()).toBe(false);
  });

  it('should update agent metrics', () => {
    state.updateAgentMetrics('test-agent', { input: 100, output: 50, total: 150 }, 2);
    const metric = state.agentMetrics.get('test-agent');
    expect(metric).toBeDefined();
    expect(metric!.turns).toBe(1);
    expect(metric!.tokens.total).toBe(150);
    expect(metric!.toolCalls).toBe(2);
  });

  it('should accumulate agent metrics on subsequent calls', () => {
    state.updateAgentMetrics('test-agent', { input: 100, output: 50, total: 150 }, 2);
    state.updateAgentMetrics('test-agent', { input: 200, output: 100, total: 300 }, 3);
    const metric = state.agentMetrics.get('test-agent');
    expect(metric!.turns).toBe(2);
    expect(metric!.tokens.total).toBe(450);
    expect(metric!.toolCalls).toBe(5);
  });

  it('should report duration', () => {
    const duration = state.getDuration();
    expect(typeof duration).toBe('number');
    expect(duration).toBeGreaterThanOrEqual(0);
  });

  it('should serialize to JSON', () => {
    state.recordStep({
      stepNumber: 1,
      agentName: 'test-agent',
      toolCalls: [],
      text: 'hello',
      timestamp: Date.now(),
    });
    const json = state.toJSON();
    expect(json.currentAgent).toBe('test-agent');
    expect(json.originalInput).toBe('test input');
    expect(json.steps).toHaveLength(1);
    expect(json.handoffChain).toEqual(['test-agent']);
    expect(typeof json.duration).toBe('number');
  });

  it('should default maxTurns to 50', () => {
    const defaultState = new RunState(mockAgent, 'input', {});
    expect(defaultState.maxTurns).toBe(50);
  });

});
