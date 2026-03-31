/**
 * Agentic Architecture Example
 *
 * This example demonstrates the TRUE agentic patterns:
 * 1. Agent-driven execution (not SDK-controlled)
 * 2. Parallel tool execution
 * 3. Autonomous handoffs
 * 4. Multi-agent coordination
 * 5. Agent-judging-agent patterns
 */

import 'dotenv/config';
import { Agent, run, tool } from '../../src';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';

// ====================
// EXAMPLE 1: Parallel Tool Execution
// ====================

const weatherTool = tool({
  description: 'Get weather for a city',
  inputSchema: z.object({ city: z.string() }),
  execute: async ({ city }) => {
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 100));
    return `Weather in ${city}: Sunny, 25°C`;
  },
});

const timeTool = tool({
  description: 'Get current time in a city',
  inputSchema: z.object({ city: z.string() }),
  execute: async ({ city }) => {
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 100));
    return `Time in ${city}: 14:30`;
  },
});

const newsTool = tool({
  description: 'Get latest news for a city',
  inputSchema: z.object({ city: z.string() }),
  execute: async ({ city }) => {
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 100));
    return `Latest news in ${city}: City prepares for festival`;
  },
});

async function example1_ParallelTools() {
  console.log('\n===== EXAMPLE 1: Parallel Tool Execution =====\n');

  const agent = new Agent({
    name: 'InfoGatherer',
    model: openai('gpt-4o-mini'),
    instructions: 'Gather information about a city using ALL available tools. You should call all tools to get complete information.',
    tools: {
      weather: weatherTool,
      time: timeTool,
      news: newsTool,
    },
  });

  const result = await run(agent, 'Tell me about Paris');

  console.log('Final Output:', result.finalOutput);
  console.log('\nSteps:', result.steps.length);
  console.log('Tool Calls:', result.metadata.totalToolCalls);
  console.log('Duration:', result.metadata.duration, 'ms');

  // With parallel execution, all tools run simultaneously
  // Expected duration: ~100ms (not 300ms sequential)
}

// ====================
// EXAMPLE 2: Autonomous Transfers
// ====================

async function example2_AutonomousHandoffs() {
  console.log('\n===== EXAMPLE 2: Autonomous Agent Transfers =====\n');

  const researchAgent = new Agent({
    name: 'Researcher',
    model: openai('gpt-4o-mini'),
    instructions: 'You research topics and gather information. When done, transfer to the Analyst.',
    transferDescription: 'Handles research and information gathering',
  });

  const analysisAgent = new Agent({
    name: 'Analyst',
    model: openai('gpt-4o-mini'),
    instructions: 'You analyze information and provide insights. When done, transfer to the Reporter.',
    transferDescription: 'Handles analysis and insights',
  });

  const reportAgent = new Agent({
    name: 'Reporter',
    model: openai('gpt-4o-mini'),
    instructions: 'You create final reports from analysis. This is the final step.',
    transferDescription: 'Creates final reports',
  });

  // Configure transfers
  researchAgent.subagents = [analysisAgent];
  analysisAgent.subagents = [reportAgent];

  const result = await run(researchAgent, 'Research and analyze AI safety');

  console.log('Final Output:', result.finalOutput);
  console.log('\nTransfer Chain:', result.metadata.handoffChain);
  console.log('Agents Involved:', result.metadata.handoffChain?.length);

  // Agent autonomously decided when to transfer (not SDK)
}

// ====================
// EXAMPLE 3: Parallel Agent Execution
// ====================

async function example3_ParallelAgents() {
  console.log('\n===== EXAMPLE 3: Parallel Agent Execution =====\n');

  const fastAgent = new Agent({
    name: 'FastAgent',
    instructions: 'Answer quickly and concisely',
    model: openai('gpt-4o-mini'),
  });

  const smartAgent = new Agent({
    name: 'SmartAgent',
    instructions: 'Answer with deep analysis',
    model: openai('gpt-4o-mini'),
  });

  const creativeAgent = new Agent({
    name: 'CreativeAgent',
    instructions: 'Answer with creative flair',
    model: openai('gpt-4o-mini'),
  });

  // Run all agents in parallel, use the first result
  const startTime = Date.now();
  const results = await Promise.all([
    run(fastAgent, 'What is the capital of France?'),
    run(smartAgent, 'What is the capital of France?'),
    run(creativeAgent, 'What is the capital of France?'),
  ]);
  const duration = Date.now() - startTime;

  console.log('All Answers:');
  results.forEach((r, i) => {
    const names = ['Fast', 'Smart', 'Creative'];
    console.log(`  ${names[i]}: ${r.finalOutput.substring(0, 80)}`);
  });
  console.log('\nTotal Duration:', duration, 'ms');
}

// ====================
// EXAMPLE 4: Parallel Agent Execution with Aggregation
// ====================

async function example4_ParallelWithAggregation() {
  console.log('\n===== EXAMPLE 4: Parallel Agent Execution =====\n');

  const translator1 = new Agent({
    name: 'Translator1',
    model: openai('gpt-4o-mini'),
    instructions: 'Translate to Spanish with formal tone',
  });

  const translator2 = new Agent({
    name: 'Translator2',
    model: openai('gpt-4o-mini'),
    instructions: 'Translate to Spanish with casual tone',
  });

  const translator3 = new Agent({
    name: 'Translator3',
    model: openai('gpt-4o-mini'),
    instructions: 'Translate to Spanish with poetic style',
  });

  // Run all translators in parallel
  const startTime = Date.now();
  const results = await Promise.all([
    run(translator1, 'Hello, how are you today?'),
    run(translator2, 'Hello, how are you today?'),
    run(translator3, 'Hello, how are you today?'),
  ]);
  const duration = Date.now() - startTime;

  console.log('All Translations:');
  results.forEach((r, i) => {
    console.log(`  Option ${i + 1}: ${r.finalOutput}`);
  });
  console.log('\nTotal Duration:', duration, 'ms');

  // All agents run simultaneously
}

// ====================
// EXAMPLE 5: Agent-Judging-Agent Pattern
// ====================

async function example5_AgentJudging() {
  console.log('\n===== EXAMPLE 5: Agent-Judging-Agent Pattern =====\n');

  const coder1 = new Agent({
    name: 'Coder1',
    model: openai('gpt-4o-mini'),
    instructions: 'Write code with focus on performance',
  });

  const coder2 = new Agent({
    name: 'Coder2',
    model: openai('gpt-4o-mini'),
    instructions: 'Write code with focus on readability',
  });

  const coder3 = new Agent({
    name: 'Coder3',
    model: openai('gpt-4o-mini'),
    instructions: 'Write code with focus on security',
  });

  const judge = new Agent({
    name: 'Judge',
    model: openai('gpt-4o-mini'),
    instructions: `Evaluate the code solutions and pick the best one.
Consider: correctness, performance, readability, security.
Return only the best solution.`,
  });

  // Run all coders in parallel
  const query = 'Write a function to validate email addresses';
  const coderResults = await Promise.all([
    run(coder1, query),
    run(coder2, query),
    run(coder3, query),
  ]);

  // Judge evaluates all solutions
  const evaluationPrompt = `
Evaluate these code solutions and pick the best one:

Solution 1 (Performance-focused):
${coderResults[0].finalOutput}

Solution 2 (Readability-focused):
${coderResults[1].finalOutput}

Solution 3 (Security-focused):
${coderResults[2].finalOutput}

Pick the best solution and explain why.
`;

  const result = await run(judge, evaluationPrompt);

  console.log('Best Solution (judged by AI):\n', result.finalOutput);
  console.log('\nWorker Count:', coderResults.length);

  // Multiple agents compete, judge agent picks the best
}

// ====================
// EXAMPLE 6: Autonomous Decision Making
// ====================

async function example6_AutonomousDecisions() {
  console.log('\n===== EXAMPLE 6: Autonomous Decision Making =====\n');

  const searchTool = tool({
    description: 'Search for information',
    inputSchema: z.object({ query: z.string() }),
    execute: async ({ query }) => {
      return `Search results for: ${query}`;
    },
  });

  const calculateTool = tool({
    description: 'Perform calculations',
    inputSchema: z.object({ expression: z.string() }),
    execute: async ({ expression }) => {
      try {
        return `Result: ${eval(expression)}`;
      } catch {
        return 'Calculation error';
      }
    },
  });

  const agent = new Agent({
    name: 'AutonomousAgent',
    model: openai('gpt-4o-mini'),
    instructions: `You are an autonomous agent. Decide:
- Which tools to use (if any)
- When to continue vs when to finish
- What information you need
Make your own decisions!`,
    tools: {
      search: searchTool,
      calculate: calculateTool,
    },
  });

  const result = await run(agent, 'What is 25% of 80, and why is it useful?');

  console.log('Final Output:', result.finalOutput);
  console.log('\nAgent Decisions:');
  console.log('- Tools Used:', result.metadata.totalToolCalls);
  console.log('- Steps Taken:', result.steps.length);
  console.log('- Autonomous Turns:', result.metadata.handoffChain);

  // Agent decided autonomously what to do (not SDK-controlled)
}

// ====================
// Run All Examples
// ====================

async function main() {
  try {
    await example1_ParallelTools();
    await example2_AutonomousHandoffs();
    await example3_ParallelAgents();
    await example4_ParallelWithAggregation();
    await example5_AgentJudging();
    await example6_AutonomousDecisions();

    console.log('\n✅ All examples completed successfully!\n');
    console.log('KEY AGENTIC PATTERNS DEMONSTRATED:');
    console.log('1. ✅ Tools execute in PARALLEL');
    console.log('2. ✅ Agents make AUTONOMOUS decisions');
    console.log('3. ✅ Multi-agent coordination patterns');
    console.log('4. ✅ Agent-judging-agent patterns');
    console.log('5. ✅ Proper state management');
    console.log('6. ✅ Agents control their own lifecycle\n');

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

export {
  example1_ParallelTools,
  example2_AutonomousHandoffs,
  example3_ParallelAgents,
  example4_ParallelWithAggregation,
  example5_AgentJudging,
  example6_AutonomousDecisions,
};
