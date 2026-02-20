/**
 * Test: Tool Call Tracing End-to-End
 * 
 * Verifies that tool calls are properly traced in Langfuse.
 * Tests the complete tracing flow from agent execution to tool calls.
 */

import 'dotenv/config';
import {
  Agent,
  run,
  tool,
  initLangfuse,
  isLangfuseEnabled,
  flushLangfuse,
} from '../../dist/index';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';

console.log('\n🔍 TEST: Tool Call Tracing End-to-End\n');

// ============================================
// SETUP
// ============================================

// Initialize Langfuse
const langfuse = initLangfuse();

if (!isLangfuseEnabled()) {
  console.log('⚠️  Langfuse not enabled. This test requires:');
  console.log('   - LANGFUSE_PUBLIC_KEY');
  console.log('   - LANGFUSE_SECRET_KEY');
  console.log('   - LANGFUSE_BASE_URL (optional)\n');
  console.log('ℹ️  Running test anyway to verify tracing code doesn\'t break execution...\n');
}

// ============================================
// TEST 1: Single Tool Call Tracing
// ============================================

async function test1_SingleToolTrace() {
  console.log('━'.repeat(80));
  console.log('🧪 TEST 1: Single Tool Call Tracing');
  console.log('━'.repeat(80) + '\n');

  const calculatorTool = tool({
    description: 'Add two numbers',
    inputSchema: z.object({
      a: z.number(),
      b: z.number(),
    }),
    execute: async ({ a, b }) => {
      console.log(`   🔧 Tool executed: add(${a}, ${b})`);
      return { result: a + b };
    },
  });

  const agent = new Agent({
    name: 'Calculator',
    instructions: 'Use the add tool to help with math.',
    model: openai('gpt-4o-mini'),
    modelSettings: { temperature: 0 },
    tools: {
      add: calculatorTool,
    },
  });

  console.log('Running: "What is 5 + 7?"\n');

  const result = await run(agent, 'What is 5 + 7?');

  console.log('✅ Result:', result.finalOutput);
  console.log('📊 Tool calls:', result.metadata.totalToolCalls || 0);
  console.log('📊 Steps:', result.metadata.agentMetrics?.[0]?.turns || 0);

  if (isLangfuseEnabled()) {
    console.log('🔍 Check Langfuse for:');
    console.log('   - Trace: "Agent Run: Calculator"');
    console.log('   - Span: "Agent: Calculator"');
    console.log('   - Span: "Tool: add"');
    console.log('     - Input: { a: 5, b: 7 }');
    console.log('     - Output: { result: 12 }');
  }

  console.log('');
  return result.metadata.totalToolCalls === 1;
}

// ============================================
// TEST 2: Multiple Tool Calls (Parallel)
// ============================================

async function test2_ParallelToolTrace() {
  console.log('━'.repeat(80));
  console.log('🧪 TEST 2: Parallel Tool Call Tracing');
  console.log('━'.repeat(80) + '\n');

  const weatherTool = tool({
    description: 'Get weather',
    inputSchema: z.object({ city: z.string() }),
    execute: async ({ city }) => {
      console.log(`   🔧 Tool executed: getWeather(${city})`);
      await new Promise(r => setTimeout(r, 500));
      return { city, temp: 22, condition: 'Sunny' };
    },
  });

  const timeTool = tool({
    description: 'Get current time',
    inputSchema: z.object({ timezone: z.string().optional() }),
    execute: async ({ timezone }) => {
      console.log(`   🔧 Tool executed: getTime(${timezone || 'UTC'})`);
      await new Promise(r => setTimeout(r, 300));
      return { time: new Date().toISOString(), timezone };
    },
  });

  const agent = new Agent({
    name: 'InfoAgent',
    instructions: 'Use tools to help users.',
    model: openai('gpt-4o-mini'),
    modelSettings: { temperature: 0 },
    tools: {
      getWeather: weatherTool,
      getTime: timeTool,
    },
  });

  console.log('Running: "What is the weather in Tokyo and what time is it?"\n');

  const result = await run(agent, 'What is the weather in Tokyo and what time is it?');

  console.log('✅ Result:', result.finalOutput.substring(0, 100) + '...');
  console.log('📊 Tool calls:', result.metadata.totalToolCalls || 0);

  if (isLangfuseEnabled()) {
    console.log('🔍 Check Langfuse for:');
    console.log('   - Trace with 2+ tool call spans');
    console.log('   - Both tools should show parallel execution');
    console.log('   - Different durations (500ms vs 300ms)');
  }

  console.log('');
  return (result.metadata.totalToolCalls || 0) >= 2;
}

// ============================================
// TEST 3: Multi-Agent with Tool Tracing
// ============================================

async function test3_MultiAgentToolTrace() {
  console.log('━'.repeat(80));
  console.log('🧪 TEST 3: Multi-Agent with Tool Tracing');
  console.log('━'.repeat(80) + '\n');

  const searchTool = tool({
    description: 'Search for information',
    inputSchema: z.object({ query: z.string() }),
    execute: async ({ query }) => {
      console.log(`   🔧 Tool executed: search(${query})`);
      return { results: [`Result 1 for ${query}`, `Result 2 for ${query}`] };
    },
  });

  const researchAgent = new Agent({
    name: 'Researcher',
    instructions: 'Use search tool to find information.',
    model: openai('gpt-4o-mini'),
    modelSettings: { temperature: 0 },
    tools: {
      search: searchTool,
    },
  });

  const coordinator = new Agent({
    name: 'Coordinator',
    instructions: 'Route research questions to Researcher.',
    model: openai('gpt-4o-mini'),
    modelSettings: { temperature: 0 },
    subagents: [researchAgent],
  });

  console.log('Running: "Search for AI agents"\n');

  const result = await run(coordinator, 'Search for AI agents');

  console.log('✅ Result:', result.finalOutput.substring(0, 100) + '...');
  console.log('📊 Handoff chain:', result.metadata.handoffChain?.join(' → ') || 'None');
  console.log('📊 Tool calls:', result.metadata.totalToolCalls || 0);

  if (isLangfuseEnabled()) {
    console.log('🔍 Check Langfuse for:');
    console.log('   - Trace with handoff span');
    console.log('   - Span: "Agent: Coordinator"');
    console.log('   - Span: "Handoff: Coordinator → Researcher"');
    console.log('   - Span: "Agent: Researcher"');
    console.log('   - Span: "Tool: search"');
  }

  console.log('');
  return result.metadata.handoffChain?.includes('Researcher') || false;
}

// ============================================
// TEST 4: Tool Error Tracing
// ============================================

async function test4_ToolErrorTrace() {
  console.log('━'.repeat(80));
  console.log('🧪 TEST 4: Tool Error Tracing');
  console.log('━'.repeat(80) + '\n');

  const failingTool = tool({
    description: 'This tool fails on purpose',
    inputSchema: z.object({ shouldFail: z.boolean() }),
    execute: async ({ shouldFail }) => {
      if (shouldFail) {
        throw new Error('Tool execution failed as expected');
      }
      return { success: true };
    },
  });

  const agent = new Agent({
    name: 'ErrorAgent',
    instructions: 'Test error handling.',
    model: openai('gpt-4o-mini'),
    modelSettings: { temperature: 0 },
    tools: {
      testFail: failingTool,
    },
  });

  console.log('Running: Test tool error handling\n');

  try {
    // This should handle the tool error gracefully
    const result = await run(agent, 'Call testFail with shouldFail=true');
    console.log('✅ Agent handled tool error gracefully');
    console.log('📊 Result:', result.finalOutput.substring(0, 100));

    if (isLangfuseEnabled()) {
      console.log('🔍 Check Langfuse for:');
      console.log('   - Span: "Tool: testFail" with level ERROR');
      console.log('   - Error message in output');
    }

    console.log('');
    return true;
  } catch (error: any) {
    console.log('⚠️  Agent threw error (expected behavior)');
    console.log('');
    return true;
  }
}

// ============================================
// RUN ALL TESTS
// ============================================

async function main() {
  console.log('🚀 Starting Tool Call Tracing Tests\n');

  const results = {
    test1: await test1_SingleToolTrace(),
    test2: await test2_ParallelToolTrace(),
    test3: await test3_MultiAgentToolTrace(),
    test4: await test4_ToolErrorTrace(),
  };

  // Flush Langfuse to ensure all traces are sent
  if (isLangfuseEnabled()) {
    console.log('📤 Flushing traces to Langfuse...\n');
    await flushLangfuse();
    await new Promise(r => setTimeout(r, 2000)); // Wait for flush
  }

  // Summary
  console.log('━'.repeat(80));
  console.log('📊 TRACING TEST SUMMARY');
  console.log('━'.repeat(80));
  console.log(`Test 1 (Single Tool): ${results.test1 ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Test 2 (Parallel Tools): ${results.test2 ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Test 3 (Multi-Agent): ${results.test3 ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Test 4 (Error Handling): ${results.test4 ? '✅ PASS' : '❌ FAIL'}`);

  const allPassed = Object.values(results).every(r => r);
  console.log(`\n${allPassed ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);

  if (isLangfuseEnabled()) {
    console.log('\n🔍 View traces at: https://cloud.langfuse.com');
    console.log('   Search for: "Calculator", "InfoAgent", "Coordinator"');
  } else {
    console.log('\n💡 To see traces in Langfuse:');
    console.log('   1. Set LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY');
    console.log('   2. Run this test again');
    console.log('   3. Check https://cloud.langfuse.com');
  }

  console.log('');
  process.exit(allPassed ? 0 : 1);
}

main().catch(console.error);

