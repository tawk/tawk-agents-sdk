import { createTransferTools, detectTransfer, createTransferContext } from '@tawk-agents-sdk/core';
import { Agent } from '@tawk-agents-sdk/core';

const mockModel = {
  specificationVersion: 'v1',
  provider: 'test',
  modelId: 'test-model',
  defaultObjectGenerationMode: 'json' as const,
  doGenerate: jest.fn(),
  doStream: jest.fn(),
} as any;

describe('Transfer System', () => {

  describe('createTransferTools', () => {
    it('should create transfer tools for subagents', () => {
      const parent = new Agent({ name: 'parent', instructions: 'parent', model: mockModel });
      const sub = new Agent({
        name: 'billing-agent',
        instructions: 'billing',
        model: mockModel,
        transferDescription: 'Handles billing questions',
      });
      const tools = createTransferTools(parent as any, [sub as any]);
      expect(tools).toHaveProperty('transfer_to_billing-agent');
      expect(tools['transfer_to_billing-agent'].description).toContain('billing');
    });

    it('should return empty object for no subagents', () => {
      const parent = new Agent({ name: 'parent', instructions: 'parent', model: mockModel });
      const tools = createTransferTools(parent as any, []);
      expect(Object.keys(tools)).toHaveLength(0);
    });

    it('should create executable transfer tools that return transfer markers', async () => {
      const parent = new Agent({ name: 'parent', instructions: 'parent', model: mockModel });
      const sub = new Agent({ name: 'support', instructions: 'support', model: mockModel });
      const tools = createTransferTools(parent as any, [sub as any]);
      const result = await tools['transfer_to_support'].execute!(
        { reason: 'needs help', query: 'How do I reset?' },
        {} as any
      );
      expect(result.__transfer).toBe(true);
      expect(result.agentName).toBe('support');
      expect(result.reason).toBe('needs help');
      expect(result.query).toBe('How do I reset?');
    });

    it('should set query to null when not provided', async () => {
      const parent = new Agent({ name: 'parent', instructions: 'parent', model: mockModel });
      const sub = new Agent({ name: 'support', instructions: 'support', model: mockModel });
      const tools = createTransferTools(parent as any, [sub as any]);
      const result = await tools['transfer_to_support'].execute!(
        { reason: 'needs help' },
        {} as any
      );
      expect(result.query).toBeNull();
    });

    it('should use default description when no transferDescription', () => {
      const parent = new Agent({ name: 'parent', instructions: 'parent', model: mockModel });
      const sub = new Agent({ name: 'support', instructions: 'support', model: mockModel });
      const tools = createTransferTools(parent as any, [sub as any]);
      expect(tools['transfer_to_support'].description).toContain('Transfer to support');
    });

    it('should normalize agent names with spaces', () => {
      const parent = new Agent({ name: 'parent', instructions: 'parent', model: mockModel });
      const sub = new Agent({ name: 'billing support', instructions: 'billing', model: mockModel });
      const tools = createTransferTools(parent as any, [sub as any]);
      expect(tools).toHaveProperty('transfer_to_billing_support');
    });
  });

  describe('detectTransfer', () => {
    it('should detect transfer marker in tool results', () => {
      const sub = new Agent({
        name: 'billing-agent',
        instructions: 'billing',
        model: mockModel,
        transferDescription: 'Handles billing questions',
      });
      const parent = new Agent({
        name: 'parent',
        instructions: 'parent',
        model: mockModel,
        subagents: [sub],
      });

      const result = detectTransfer(
        [
          {
            toolName: 'transfer_to_billing-agent',
            args: { reason: 'billing question' },
            result: { __transfer: true, agentName: 'billing-agent', reason: 'billing question' },
          },
        ],
        parent as any
      );
      expect(result).not.toBeNull();
      expect(result?.agent.name).toBe('billing-agent');
      expect(result?.reason).toBe('billing question');
    });

    it('should return null for non-transfer results', () => {
      const sub = new Agent({ name: 'billing-agent', instructions: 'billing', model: mockModel });
      const parent = new Agent({
        name: 'parent',
        instructions: 'parent',
        model: mockModel,
        subagents: [sub],
      });

      const result = detectTransfer(
        [{ toolName: 'some_tool', args: {}, result: 'regular result' }],
        parent as any
      );
      expect(result).toBeNull();
    });

    it('should return null for empty tool results', () => {
      const parent = new Agent({ name: 'parent', instructions: 'parent', model: mockModel });
      const result = detectTransfer([], parent as any);
      expect(result).toBeNull();
    });

    it('should return null when target agent is not found in subagents', () => {
      const parent = new Agent({ name: 'parent', instructions: 'parent', model: mockModel });
      const result = detectTransfer(
        [
          {
            toolName: 'transfer_to_unknown',
            args: {},
            result: { __transfer: true, agentName: 'unknown-agent', reason: 'test' },
          },
        ],
        parent as any
      );
      expect(result).toBeNull();
    });
  });

  describe('createTransferContext', () => {
    it('should create transfer context string with reason', () => {
      const context = createTransferContext('coordinator', 'billing', 'customer billing issue');
      expect(context).toContain('Transfer from coordinator');
      expect(context).toContain('billing');
      expect(context).toContain('customer billing issue');
    });

    it('should create transfer context string without reason', () => {
      const context = createTransferContext('coordinator', 'billing');
      expect(context).toContain('Transfer from coordinator');
      expect(context).toContain('billing');
    });
  });
});
