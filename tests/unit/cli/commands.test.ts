import { handleCommand } from '../../../bin/cli/commands';
import { Agent } from '../../../src';
import { Usage } from '../../../src/core/usage';
import { CLISession, type CLIState } from '../../../bin/cli/types';
import { ALL_TOOLS } from '../../../bin/cli/tools';

const mockModel = {
  specificationVersion: 'v1',
  provider: 'test',
  modelId: 'test-model',
  defaultObjectGenerationMode: 'json' as const,
  doGenerate: jest.fn(),
  doStream: jest.fn(),
} as any;

function createState(overrides: Partial<CLIState> = {}): CLIState {
  return {
    agent: new Agent({
      name: 'TestAgent',
      model: mockModel,
      instructions: 'test',
      tools: ALL_TOOLS,
    }),
    agentName: 'default',
    session: new CLISession('test-session'),
    cumulativeUsage: new Usage(),
    totalToolCalls: 0,
    totalDuration: 0,
    turnCount: 0,
    verbose: false,
    modelId: 'test:test-model',
    permissionsGranted: false,
    config: { sources: {} } as any,
    systemPrompt: '',
    model: mockModel,
    mcpTools: {},
    ...overrides,
  };
}

describe('CLI commands', () => {
  let setPrompt: jest.Mock;

  beforeEach(() => {
    setPrompt = jest.fn();
  });

  describe('/help', () => {
    it('should be handled and not exit', async () => {
      const state = createState();
      const result = await handleCommand('/help', state, setPrompt, undefined);
      expect(result.handled).toBe(true);
      expect(result.exit).toBeUndefined();
    });
  });

  describe('/quit, /exit, /q', () => {
    it('/quit should signal exit', async () => {
      const state = createState();
      const result = await handleCommand('/quit', state, setPrompt, undefined);
      expect(result.handled).toBe(true);
      expect(result.exit).toBe(true);
    });

    it('/exit should signal exit', async () => {
      const state = createState();
      const result = await handleCommand('/exit', state, setPrompt, undefined);
      expect(result.handled).toBe(true);
      expect(result.exit).toBe(true);
    });

    it('/q should signal exit', async () => {
      const state = createState();
      const result = await handleCommand('/q', state, setPrompt, undefined);
      expect(result.handled).toBe(true);
      expect(result.exit).toBe(true);
    });
  });

  describe('/verbose', () => {
    it('should toggle verbose mode on', async () => {
      const state = createState({ verbose: false });
      await handleCommand('/verbose', state, setPrompt, undefined);
      expect(state.verbose).toBe(true);
    });

    it('should toggle verbose mode off', async () => {
      const state = createState({ verbose: true });
      await handleCommand('/verbose', state, setPrompt, undefined);
      expect(state.verbose).toBe(false);
    });
  });

  describe('/clear', () => {
    it('should clear session and reset turn count', async () => {
      const state = createState({ turnCount: 5 });
      await state.session.addMessages([
        { role: 'user', content: [{ type: 'text', text: 'hello' }] },
      ]);
      await handleCommand('/clear', state, setPrompt, undefined);
      const history = await state.session.getHistory();
      expect(history).toHaveLength(0);
      expect(state.turnCount).toBe(0);
    });
  });

  describe('/agent', () => {
    it('should show info for current agent without arg', async () => {
      const state = createState();
      const result = await handleCommand('/agent', state, setPrompt, undefined);
      expect(result.handled).toBe(true);
    });

    it('should switch to coder preset', async () => {
      const state = createState();
      await handleCommand('/agent coder', state, setPrompt, undefined);
      expect(state.agent.name).toBe('Coder');
      expect(setPrompt).toHaveBeenCalled();
    });

    it('should switch to researcher preset', async () => {
      const state = createState();
      await handleCommand('/agent researcher', state, setPrompt, undefined);
      expect(state.agent.name).toBe('Researcher');
    });

    it('should handle unknown preset gracefully', async () => {
      const state = createState();
      const originalAgent = state.agent;
      await handleCommand('/agent nonexistent', state, setPrompt, undefined);
      // Agent should remain unchanged on error
      expect(state.agent).toBe(originalAgent);
    });

    it('should clear session when switching agent', async () => {
      const state = createState();
      await state.session.addMessages([
        { role: 'user', content: [{ type: 'text', text: 'hello' }] },
      ]);
      await handleCommand('/agent coder', state, setPrompt, undefined);
      const history = await state.session.getHistory();
      expect(history).toHaveLength(0);
    });
  });

  describe('/tools', () => {
    it('should be handled', async () => {
      const state = createState();
      const result = await handleCommand('/tools', state, setPrompt, undefined);
      expect(result.handled).toBe(true);
    });
  });

  describe('/session', () => {
    it('should show session info', async () => {
      const state = createState();
      const result = await handleCommand('/session', state, setPrompt, undefined);
      expect(result.handled).toBe(true);
    });

    it('/session new should reset session and counters', async () => {
      const state = createState({ turnCount: 10, totalToolCalls: 5 });
      state.cumulativeUsage = new Usage({ inputTokens: 100, outputTokens: 50 });
      await handleCommand('/session new', state, setPrompt, undefined);
      expect(state.turnCount).toBe(0);
      expect(state.totalToolCalls).toBe(0);
      expect(state.totalDuration).toBe(0);
      expect(state.cumulativeUsage.totalTokens).toBe(0);
    });
  });

  describe('/history', () => {
    it('should be handled with empty history', async () => {
      const state = createState();
      const result = await handleCommand('/history', state, setPrompt, undefined);
      expect(result.handled).toBe(true);
    });

    it('should be handled with messages in history', async () => {
      const state = createState();
      await state.session.addMessages([
        { role: 'user', content: [{ type: 'text', text: 'hello' }] },
        { role: 'assistant', content: [{ type: 'text', text: 'hi there' }] },
      ]);
      const result = await handleCommand('/history', state, setPrompt, undefined);
      expect(result.handled).toBe(true);
    });
  });

  describe('/model', () => {
    it('should show current model without arg', async () => {
      const state = createState();
      const result = await handleCommand('/model', state, setPrompt, undefined);
      expect(result.handled).toBe(true);
    });
  });

  describe('/usage', () => {
    it('should show cumulative usage', async () => {
      const state = createState();
      state.cumulativeUsage = new Usage({
        inputTokens: 1000,
        outputTokens: 500,
        totalTokens: 1500,
        requests: 3,
      });
      state.totalToolCalls = 5;
      state.totalDuration = 3000;
      const result = await handleCommand('/usage', state, setPrompt, undefined);
      expect(result.handled).toBe(true);
    });
  });

  describe('unknown commands', () => {
    it('should be handled (not sent to agent)', async () => {
      const state = createState();
      const result = await handleCommand('/foobar', state, setPrompt, undefined);
      expect(result.handled).toBe(true);
      expect(result.exit).toBeUndefined();
    });
  });
});
