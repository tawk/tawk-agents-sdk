import { createAgent, getPresetNames, getPresetInfo } from '../../../bin/cli/agents';
import { Agent } from '../../../src';

const mockModel = {
  specificationVersion: 'v1',
  provider: 'test',
  modelId: 'test-model',
  defaultObjectGenerationMode: 'json' as const,
  doGenerate: jest.fn(),
  doStream: jest.fn(),
} as any;

describe('CLI agents', () => {

  describe('getPresetNames', () => {
    it('should return 4 preset names', () => {
      const names = getPresetNames();
      expect(names).toHaveLength(4);
      expect(names).toEqual(['default', 'minimal', 'coder', 'researcher']);
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
    it('should create default agent with all tools and dynamic subagents', () => {
      const { agent, description, toolCount } = createAgent('default', mockModel);
      expect(agent).toBeInstanceOf(Agent);
      expect(agent.name).toBe('Assistant');
      // 10 base + 3 transfer_to_* = 13
      expect(toolCount).toBe(13);
      expect(typeof description).toBe('string');
      // agent._tools includes auto-generated transfer_to_* tools from subagents
      const allToolNames = Object.keys(agent._tools);
      expect(allToolNames.length).toBe(13); // 10 base + 3 transfer_to_*
      expect(allToolNames).toEqual(expect.arrayContaining([
        'transfer_to_coder', 'transfer_to_researcher', 'transfer_to_analyst',
      ]));
    });

    it('should create minimal agent with all tools but no subagents', () => {
      const { agent, toolCount } = createAgent('minimal', mockModel);
      expect(agent.name).toBe('Minimal');
      expect(toolCount).toBe(10);
      const toolNames = Object.keys(agent._tools);
      // No transfer tools — minimal has no subagents
      expect(toolNames).not.toEqual(expect.arrayContaining(['transfer_to_coder']));
      expect(toolNames.length).toBe(10);
    });

    it('should create researcher agent with 5 tools', () => {
      const { agent, toolCount } = createAgent('researcher', mockModel);
      expect(agent.name).toBe('Researcher');
      expect(toolCount).toBe(5);
      const toolNames = Object.keys(agent._tools);
      expect(toolNames).toEqual(expect.arrayContaining([
        'web_fetch', 'read_file', 'list_files', 'calculator', 'current_time',
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

    it('should throw on unknown preset', () => {
      expect(() => createAgent('nonexistent', mockModel)).toThrow(/Unknown agent preset/);
    });

    it('should use the provided model', () => {
      const { agent } = createAgent('default', mockModel);
      expect(agent._model).toBe(mockModel);
    });

    it('should apply toolWrapper to main agent and subagent tools', () => {
      const wrapper = jest.fn((_name: string, tool: any) => ({
        ...tool,
        description: `wrapped: ${tool.description}`,
      }));
      const { agent } = createAgent('default', mockModel, wrapper);
      // wrapper called for main agent tools (10) + subagent tools (5+5+5 = 15) = 25
      expect(wrapper.mock.calls.length).toBeGreaterThan(10);
      // Main agent's base tools (not transfer tools) should be wrapped
      for (const [name, tool] of Object.entries(agent._tools)) {
        if (!name.startsWith('transfer_to_')) {
          expect(tool.description).toMatch(/^wrapped:/);
        }
      }
    });

    it('should not wrap tools when toolWrapper is undefined', () => {
      const { agent } = createAgent('default', mockModel);
      for (const tool of Object.values(agent._tools)) {
        expect(tool.description).not.toMatch(/^wrapped:/);
      }
    });

    it('should work without options (backward compat)', () => {
      const { agent, toolCount } = createAgent('default', mockModel);
      expect(agent).toBeInstanceOf(Agent);
      expect(toolCount).toBe(13); // 10 base + 3 transfer_to_*
    });

    it('should merge mcpTools into main agent', () => {
      const mcpTool = { description: 'mcp tool', execute: jest.fn() } as any;
      const { agent, toolCount } = createAgent('default', mockModel, {
        mcpTools: { my_mcp_tool: mcpTool },
      });
      // 10 base + 1 MCP + 3 transfer_to_* = 14
      expect(toolCount).toBe(14);
      expect(Object.keys(agent._tools)).toContain('my_mcp_tool');
    });

    it('should override instructions with systemPrompt', () => {
      const { agent } = createAgent('default', mockModel, {
        systemPrompt: 'You are a pirate',
      });
      expect((agent as any).instructions).toBe('You are a pirate');
    });
  });
});
