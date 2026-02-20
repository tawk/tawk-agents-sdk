import { createAgent, getPresetNames, getPresetInfo } from '../../../bin/cli/agents';
import { Agent, setDefaultModel } from '../../../src';

const mockModel = {
  specificationVersion: 'v1',
  provider: 'test',
  modelId: 'test-model',
  defaultObjectGenerationMode: 'json' as const,
  doGenerate: jest.fn(),
  doStream: jest.fn(),
} as any;

describe('CLI agents', () => {
  beforeEach(() => {
    setDefaultModel(mockModel);
  });

  describe('getPresetNames', () => {
    it('should return 4 preset names', () => {
      const names = getPresetNames();
      expect(names).toHaveLength(4);
      expect(names).toEqual(['default', 'researcher', 'coder', 'multi-research']);
    });
  });

  describe('getPresetInfo', () => {
    it('should return name and description for each preset', () => {
      const info = getPresetInfo();
      expect(info).toHaveLength(4);
      for (const entry of info) {
        expect(entry).toHaveProperty('name');
        expect(entry).toHaveProperty('description');
        expect(typeof entry.name).toBe('string');
        expect(typeof entry.description).toBe('string');
      }
    });
  });

  describe('createAgent', () => {
    it('should create default agent with all 10 tools', () => {
      const { agent, description, toolCount } = createAgent('default', mockModel);
      expect(agent).toBeInstanceOf(Agent);
      expect(agent.name).toBe('Assistant');
      expect(toolCount).toBe(10);
      expect(typeof description).toBe('string');
    });

    it('should create researcher agent with 4 tools', () => {
      const { agent, toolCount } = createAgent('researcher', mockModel);
      expect(agent.name).toBe('Researcher');
      expect(toolCount).toBe(4);
      const toolNames = Object.keys(agent._tools);
      expect(toolNames).toEqual(expect.arrayContaining([
        'web_fetch', 'read_file', 'calculator', 'current_time',
      ]));
    });

    it('should create coder agent with 5 tools', () => {
      const { agent, toolCount } = createAgent('coder', mockModel);
      expect(agent.name).toBe('Coder');
      expect(toolCount).toBe(5);
      const toolNames = Object.keys(agent._tools);
      expect(toolNames).toEqual(expect.arrayContaining([
        'shell_exec', 'read_file', 'write_file', 'list_files', 'current_time',
      ]));
    });

    it('should create multi-research agent with subagents', () => {
      const { agent, toolCount } = createAgent('multi-research', mockModel);
      expect(agent.name).toBe('Coordinator');
      // Coordinator has current_time + transfer tools
      expect(toolCount).toBe(4);
    });

    it('should throw on unknown preset', () => {
      expect(() => createAgent('nonexistent', mockModel)).toThrow(/Unknown agent preset/);
    });

    it('should use the provided model', () => {
      const { agent } = createAgent('default', mockModel);
      expect(agent._model).toBe(mockModel);
    });
  });
});
