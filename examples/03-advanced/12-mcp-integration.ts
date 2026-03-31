/**
 * Native MCP Integration Example
 *
 * Demonstrates using MCPServerManager to connect to MCP servers and inject
 * their tools into agents.
 */

import { Agent, run, MCPServerManager, tool } from '../../src';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';

// ============================================
// EXAMPLE 1: Basic MCP with MCPServerManager
// ============================================

async function basicNativeMCPExample() {
  console.log('\n=== EXAMPLE 1: Basic MCP with MCPServerManager ===\n');

  const mcpManager = new MCPServerManager();

  try {
    // Connect to an MCP server
    await mcpManager.registerServer({
      name: 'filesystem',
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
    });

    // Get tools from the MCP server
    const mcpTools = await mcpManager.getAllTools();

    const agent = new Agent({
      name: 'FileSystemAgent',
      instructions: 'You are a file system assistant. Help users with file operations.',
      model: openai('gpt-4o-mini'),
      tools: mcpTools,
    });

    // MCP tools are available via agent tools
    const result = await run(agent, 'List files in the current directory');

    console.log(result.finalOutput);
  } finally {
    await mcpManager.shutdown();
  }
}

// ============================================
// EXAMPLE 2: Multiple MCP Servers
// ============================================

async function multipleMCPServersExample() {
  console.log('\n=== EXAMPLE 2: Multiple MCP Servers ===\n');

  const mcpManager = new MCPServerManager();

  try {
    await mcpManager.registerServer({
      name: 'filesystem',
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem'],
    });

    // Get all tools from all connected servers
    const mcpTools = await mcpManager.getAllTools();
    console.log('Available MCP tools:', Object.keys(mcpTools));

    const agent = new Agent({
      name: 'MultiServerAgent',
      instructions: 'You have access to filesystem tools.',
      model: openai('gpt-4o-mini'),
      tools: mcpTools,
    });

    const result = await run(agent, 'Read file /tmp/test.txt');
    console.log(result.finalOutput);
  } finally {
    await mcpManager.shutdown();
  }
}

// ============================================
// EXAMPLE 3: Mixed Tools (Regular + MCP)
// ============================================

async function mixedToolsExample() {
  console.log('\n=== EXAMPLE 3: Mixed Tools (Regular + MCP) ===\n');

  const weatherTool = tool({
    description: 'Get weather for a city',
    inputSchema: z.object({
      city: z.string(),
    }),
    execute: async ({ city }) => {
      return { city, temperature: 22, condition: 'Sunny' };
    },
  });

  const mcpManager = new MCPServerManager();

  try {
    await mcpManager.registerServer({
      name: 'filesystem',
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
    });

    const mcpTools = await mcpManager.getAllTools();

    const agent = new Agent({
      name: 'MixedAgent',
      instructions: 'You have both regular tools and MCP tools.',
      model: openai('gpt-4o-mini'),
      // Combine regular tools with MCP tools
      tools: {
        getWeather: weatherTool,
        ...mcpTools,
      },
    });

    const result = await run(agent, 'What is the weather in Tokyo? Also list files in /tmp.');
    console.log(result.finalOutput);
  } finally {
    await mcpManager.shutdown();
  }
}

// ============================================
// RUN EXAMPLES
// ============================================

async function main() {
  try {
    await basicNativeMCPExample();
    // await multipleMCPServersExample();
    // await mixedToolsExample();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

export { main };


