/**
 * Agent presets for tawk-cli
 *
 * Pre-configured agents demonstrating different SDK capabilities.
 */

import type { LanguageModel } from 'ai';
import { Agent } from '../../src';
import type { CoreTool } from '../../src';
import { ALL_TOOLS, getTools } from './tools';

// ============================================
// PRESET DEFINITIONS
// ============================================

const PRESETS: Record<string, {
  description: string;
  instructions: string;
  toolNames: string[];
}> = {
  default: {
    description: 'General helpful assistant with all tools',
    instructions: `You are a helpful AI assistant running in the Tawk Agents SDK CLI.
You have access to various tools including file operations, shell commands, web fetching, and utilities.
Use tools when they would help answer the user's question. Be concise and helpful.
When showing file contents or command output, format them clearly.`,
    toolNames: Object.keys(ALL_TOOLS),
  },

  researcher: {
    description: 'Research and analysis focused agent',
    instructions: `You are a research assistant specializing in gathering and analyzing information.
You can fetch web content, read local files, perform calculations, and check the current time.
Focus on providing well-structured, factual responses. Cite sources when fetching web content.
Break down complex topics into clear sections.`,
    toolNames: ['web_fetch', 'read_file', 'calculator', 'current_time'],
  },

  coder: {
    description: 'Coding assistant with file and shell access',
    instructions: `You are a coding assistant with access to the local filesystem and shell.
You can read, write, and list files, as well as execute shell commands.
Help with writing code, debugging, running tests, and managing files.
Always explain what commands you're running and why. Prefer safe, non-destructive operations.`,
    toolNames: ['shell_exec', 'read_file', 'write_file', 'list_files', 'current_time'],
  },
};

// ============================================
// MULTI-RESEARCH PRESET (multi-agent)
// ============================================

function createMultiResearchAgent(model: LanguageModel): Agent {
  const analyst = new Agent({
    name: 'Analyst',
    model,
    instructions: `You are a research analyst. When given a topic, use available tools to gather information.
Fetch relevant web content, read local files for context, and compile your findings.
Present your analysis in a clear, structured format with key points highlighted.`,
    tools: getTools(['web_fetch', 'read_file', 'calculator', 'current_time']),
  });

  const writer = new Agent({
    name: 'Writer',
    model,
    instructions: `You are a technical writer. Take research findings and synthesize them into
well-organized, readable content. Use clear headings, bullet points, and concise language.
Focus on making complex topics accessible. If you need additional data, ask for it.`,
    tools: getTools(['read_file', 'current_time']),
  });

  const coordinator = new Agent({
    name: 'Coordinator',
    model,
    instructions: `You are a research coordinator managing a team of specialists:
- **Analyst**: Gathers and analyzes information using web and file tools
- **Writer**: Synthesizes research into polished, readable content

For research tasks:
1. Transfer to the Analyst first to gather information
2. Then transfer to the Writer to produce the final output

For simple questions, answer directly without transferring.`,
    tools: getTools(['current_time']),
    subagents: [analyst, writer],
  });

  return coordinator;
}

// ============================================
// PUBLIC API
// ============================================

/**
 * Create an agent from a preset name
 */
export function createAgent(
  presetName: string,
  model: LanguageModel
): { agent: Agent; description: string; toolCount: number } {
  // Multi-research is special — uses subagents
  if (presetName === 'multi-research') {
    const agent = createMultiResearchAgent(model);
    return { agent, description: 'Multi-agent research team with transfers', toolCount: 4 };
  }

  const preset = PRESETS[presetName];
  if (!preset) {
    throw new Error(
      `Unknown agent preset: "${presetName}". Available: ${getPresetNames().join(', ')}`
    );
  }

  const tools: Record<string, CoreTool> = getTools(preset.toolNames);
  const agent = new Agent({
    name: presetName === 'default' ? 'Assistant' : capitalize(presetName),
    model,
    instructions: preset.instructions,
    tools,
  });

  return { agent, description: preset.description, toolCount: preset.toolNames.length };
}

/**
 * Get all available preset names
 */
export function getPresetNames(): string[] {
  return [...Object.keys(PRESETS), 'multi-research'];
}

/**
 * Get preset info for display
 */
export function getPresetInfo(): { name: string; description: string }[] {
  return [
    ...Object.entries(PRESETS).map(([name, p]) => ({ name, description: p.description })),
    { name: 'multi-research', description: 'Multi-agent research team with transfers' },
  ];
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
