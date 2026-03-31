/**
 * Agent presets for tawk-cli
 *
 * Default agent is a single powerful agent (like Claude Code) with all tools
 * and specialized subagents it can dynamically transfer to when needed.
 * The main agent decides when to delegate — no predetermined workflow.
 */

import type { LanguageModel } from 'ai';
import { Agent } from '../../src';
import type { CoreTool } from '../../src';
import { ALL_TOOLS, getTools } from './tools';

// ============================================
// SUBAGENT DEFINITIONS
// ============================================

/**
 * Create the specialized subagents that the main agent can transfer to.
 * Each subagent has a focused role and limited tools.
 */
function createSubagents(
  model: LanguageModel,
  wrapTools: (t: Record<string, CoreTool>) => Record<string, CoreTool>
): Agent[] {
  const coder = new Agent({
    name: 'Coder',
    model,
    instructions: `You are a coding specialist. You have access to the filesystem and shell.
Read, write, and list files. Execute shell commands for building, testing, and debugging.
Always explain what you're doing. Prefer safe, non-destructive operations.
When done, provide a summary of changes made.`,
    tools: wrapTools(getTools(['shell_exec', 'read_file', 'write_file', 'list_files', 'current_time'])),
  });

  const researcher = new Agent({
    name: 'Researcher',
    model,
    instructions: `You are a research specialist. Gather and analyze information thoroughly.
Fetch web content, read local files, list directories, and perform calculations.
Present findings in a structured format. Cite sources when using web content.
When done, provide a clear summary of your research.`,
    tools: wrapTools(getTools(['web_fetch', 'read_file', 'list_files', 'calculator', 'current_time'])),
  });

  const analyst = new Agent({
    name: 'Analyst',
    model,
    instructions: `You are a data analysis specialist. Analyze data, perform calculations,
read data files, and produce structured analysis reports.
Use calculations to verify claims. Read files to examine data.
Provide clear quantitative summaries with key metrics highlighted.`,
    tools: wrapTools(getTools(['read_file', 'list_files', 'calculator', 'json_parse', 'current_time'])),
  });

  return [coder, researcher, analyst];
}

// ============================================
// PRESET DEFINITIONS
// ============================================

const PRESETS: Record<string, {
  description: string;
  instructions: string;
  toolNames: string[];
  /** If true, this preset gets dynamic subagents */
  withSubagents?: boolean;
}> = {
  default: {
    description: 'Main agent with all tools and specialized subagents',
    instructions: `You are a powerful AI assistant running in the Tawk Agents SDK CLI.
You have access to all tools: file operations, shell commands, web fetching, calculations, and utilities.
Use tools directly for simple, focused tasks — reading a file, running a command, quick lookups.

You also have specialized subagents you can transfer to:
- **Coder**: For complex coding tasks requiring multiple file edits, shell commands, building and testing
- **Researcher**: For broad research tasks requiring multiple web fetches, reading many files, gathering information across sources
- **Analyst**: For data-heavy analysis requiring calculations, reading data files, producing structured reports

**You MUST transfer to a subagent when:**
- The task involves exploring or analyzing a directory structure or multiple files → Researcher
- The task involves writing, editing, or running code → Coder
- The task involves data analysis, calculations, or producing reports → Analyst
- The task would require more than 2 tool calls to complete
- The user asks to research, analyze, investigate, or explore anything

**Only handle directly when:**
- The user asks a simple question needing no tools (greetings, factual Q&A)
- The task needs exactly 1 tool call (e.g. "what time is it?")

Be concise, helpful, and use tools proactively. Format output clearly.`,
    toolNames: Object.keys(ALL_TOOLS),
    withSubagents: true,
  },

  minimal: {
    description: 'Simple agent with all tools, no subagents',
    instructions: `You are a helpful AI assistant running in the Tawk Agents SDK CLI.
You have access to various tools including file operations, shell commands, web fetching, and utilities.
Use tools when they would help answer the user's question. Be concise and helpful.
When showing file contents or command output, format them clearly.`,
    toolNames: Object.keys(ALL_TOOLS),
  },

  coder: {
    description: 'Coding assistant with file and shell access',
    instructions: `You are a coding assistant with access to the local filesystem and shell.
You can read, write, and list files, as well as execute shell commands.
Help with writing code, debugging, running tests, and managing files.
Always explain what commands you're running and why. Prefer safe, non-destructive operations.`,
    toolNames: ['shell_exec', 'read_file', 'write_file', 'list_files', 'current_time'],
  },

  researcher: {
    description: 'Research and analysis focused agent',
    instructions: `You are a research assistant specializing in gathering and analyzing information.
You can fetch web content, read local files, perform calculations, and check the current time.
Focus on providing well-structured, factual responses. Cite sources when fetching web content.
Break down complex topics into clear sections.`,
    toolNames: ['web_fetch', 'read_file', 'list_files', 'calculator', 'current_time'],
  },
};

// ============================================
// PUBLIC API
// ============================================

export interface CreateAgentOptions {
  toolWrapper?: (name: string, tool: CoreTool) => CoreTool;
  mcpTools?: Record<string, CoreTool>;
  systemPrompt?: string;
  appendInstructions?: string;
}

/**
 * Create an agent from a preset name.
 *
 * The default preset creates a main agent with all tools AND specialized
 * subagents (Coder, Researcher, Analyst) that it can dynamically transfer to.
 */
export function createAgent(
  presetName: string,
  model: LanguageModel,
  options?: CreateAgentOptions | ((name: string, tool: CoreTool) => CoreTool)
): { agent: Agent; description: string; toolCount: number } {
  // Backward compat: 3rd arg can be a bare toolWrapper function
  const opts: CreateAgentOptions = typeof options === 'function'
    ? { toolWrapper: options }
    : options || {};

  const preset = PRESETS[presetName];
  if (!preset) {
    throw new Error(
      `Unknown agent preset: "${presetName}". Available: ${getPresetNames().join(', ')}`
    );
  }

  // Build tool wrapper helper
  const wrapTools = (t: Record<string, CoreTool>): Record<string, CoreTool> => {
    if (!opts.toolWrapper) return t;
    return Object.fromEntries(
      Object.entries(t).map(([name, tool]) => [name, opts.toolWrapper!(name, tool)])
    );
  };

  // Merge preset tools + MCP tools, then wrap
  const tools = wrapTools({ ...getTools(preset.toolNames), ...(opts.mcpTools || {}) });

  // Build instructions: systemPrompt override > preset + append
  let instructions = opts.systemPrompt || preset.instructions;
  if (opts.appendInstructions && !opts.systemPrompt) {
    instructions = instructions + '\n\n' + opts.appendInstructions;
  }

  // Create subagents for presets that use them
  const subagents = preset.withSubagents ? createSubagents(model, wrapTools) : undefined;

  const agent = new Agent({
    name: presetName === 'default' ? 'Assistant' : capitalize(presetName),
    model,
    instructions,
    tools,
    ...(subagents ? { subagents } : {}),
  });

  return { agent, description: preset.description, toolCount: Object.keys(agent._tools).length };
}

/**
 * Get all available preset names
 */
export function getPresetNames(): string[] {
  return Object.keys(PRESETS);
}

/**
 * Get preset info for display
 */
export function getPresetInfo(): { name: string; description: string }[] {
  return Object.entries(PRESETS).map(([name, p]) => ({ name, description: p.description }));
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
