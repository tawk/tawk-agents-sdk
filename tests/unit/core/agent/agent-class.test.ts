import { Agent, setDefaultModel } from '@tawk-agents-sdk/core';

// Mock a minimal model
const mockModel = {
  specificationVersion: 'v1',
  provider: 'test',
  modelId: 'test-model',
  defaultObjectGenerationMode: 'json' as const,
  doGenerate: jest.fn(),
  doStream: jest.fn(),
};

describe('Agent', () => {
  beforeEach(() => {
    setDefaultModel(mockModel as any);
  });

  describe('constructor', () => {
    it('should create an agent with required config', () => {
      const agent = new Agent({
        name: 'test-agent',
        instructions: 'You are a test agent',
      });
      expect(agent.name).toBe('test-agent');
    });

    it('should accept a model override', () => {
      const agent = new Agent({
        name: 'test-agent',
        instructions: 'test',
        model: mockModel as any,
      });
      expect(agent.name).toBe('test-agent');
    });

    it('should accept tools', () => {
      const agent = new Agent({
        name: 'test-agent',
        instructions: 'test',
        tools: {
          myTool: {
            description: 'A test tool',
            inputSchema: { type: 'object', properties: {} },
            execute: async () => 'result',
          },
        },
      });
      expect(agent._tools).toHaveProperty('myTool');
    });

    it('should support subagents configuration', () => {
      const sub = new Agent({ name: 'sub-agent', instructions: 'sub' });
      const agent = new Agent({
        name: 'parent',
        instructions: 'parent',
        subagents: [sub],
      });
      expect(agent.subagents).toHaveLength(1);
      expect(agent.subagents[0].name).toBe('sub-agent');
    });

    it('should support legacy handoffs alias', () => {
      const sub = new Agent({ name: 'sub-agent', instructions: 'sub' });
      const agent = new Agent({
        name: 'parent',
        instructions: 'parent',
        handoffs: [sub],
      });
      expect(agent.subagents).toHaveLength(1);
    });

    it('should create transfer tools for subagents', () => {
      const sub = new Agent({ name: 'billing', instructions: 'billing agent' });
      const agent = new Agent({
        name: 'parent',
        instructions: 'parent',
        subagents: [sub],
      });
      expect(agent._tools).toHaveProperty('transfer_to_billing');
    });

    it('should use transferDescription on subagents', () => {
      const sub = new Agent({
        name: 'billing',
        instructions: 'billing agent',
        transferDescription: 'Handles billing questions',
      });
      const agent = new Agent({
        name: 'parent',
        instructions: 'parent',
        subagents: [sub],
      });
      expect(agent._tools['transfer_to_billing'].description).toContain('billing');
    });
  });

  describe('getInstructions', () => {
    it('should return static instructions', async () => {
      const agent = new Agent({
        name: 'test',
        instructions: 'static instructions',
      });
      const ctx = {
        context: {},
        agent,
        messages: [],
        usage: { requests: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      } as any;
      const result = await agent.getInstructions(ctx);
      expect(result).toBe('static instructions');
    });

    it('should return dynamic instructions from function', async () => {
      const agent = new Agent({
        name: 'test',
        instructions: async () => 'dynamic instructions',
      });
      const ctx = {
        context: {},
        agent,
        messages: [],
        usage: { requests: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      } as any;
      const result = await agent.getInstructions(ctx);
      expect(result).toBe('dynamic instructions');
    });

    it('should cache static instructions on second call', async () => {
      const agent = new Agent({
        name: 'test',
        instructions: 'cached instructions',
      });
      const ctx = {
        context: {},
        agent,
        messages: [],
        usage: { requests: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      } as any;
      const result1 = await agent.getInstructions(ctx);
      const result2 = await agent.getInstructions(ctx);
      expect(result1).toBe('cached instructions');
      expect(result2).toBe('cached instructions');
    });
  });

  describe('clone', () => {
    it('should create a copy with overrides', () => {
      const agent = new Agent({
        name: 'original',
        instructions: 'original instructions',
      });
      const cloned = agent.clone({ name: 'cloned' });
      expect(cloned.name).toBe('cloned');
    });

    it('should preserve original properties when not overridden', () => {
      const agent = new Agent({
        name: 'original',
        instructions: 'original instructions',
      });
      const cloned = agent.clone({ name: 'cloned' });
      // The cloned agent should still work with same model
      expect(cloned._model).toBe(agent._model);
    });
  });

  describe('asTool', () => {
    it('should return a tool definition', () => {
      const agent = new Agent({
        name: 'researcher',
        instructions: 'You research topics.',
      });
      const tool = agent.asTool({ toolDescription: 'Research a topic' });
      expect(tool.description).toBe('Research a topic');
      expect(tool.execute).toBeDefined();
    });

    it('should use default description when not provided', () => {
      const agent = new Agent({
        name: 'researcher',
        instructions: 'You research topics.',
      });
      const tool = agent.asTool();
      expect(tool.description).toBe('Delegate to researcher');
    });
  });

  describe('dispose', () => {
    it('should remove all event listeners', () => {
      const agent = new Agent({ name: 'test', instructions: 'test' });
      const handler = jest.fn();
      agent.onStart(handler);
      expect(agent.listenerCount('agent_start')).toBe(1);
      agent.dispose();
      expect(agent.listenerCount('agent_start')).toBe(0);
    });
  });

  describe('subagents setter', () => {
    it('should update subagents and recreate transfer tools', () => {
      const sub1 = new Agent({ name: 'billing', instructions: 'billing' });
      const sub2 = new Agent({ name: 'support', instructions: 'support' });
      const agent = new Agent({
        name: 'parent',
        instructions: 'parent',
        subagents: [sub1],
      });
      expect(agent._tools).toHaveProperty('transfer_to_billing');

      agent.subagents = [sub2];
      expect(agent._tools).not.toHaveProperty('transfer_to_billing');
      expect(agent._tools).toHaveProperty('transfer_to_support');
    });
  });
});
