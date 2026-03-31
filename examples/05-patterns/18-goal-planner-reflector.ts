/**
 * Goal / Planner / Reflector as AGENTS
 *
 * This shows how the "True Agentic Architecture" patterns can be
 * implemented as specialized agents using our existing transfer system.
 *
 * No need for separate systems - just agents transferring to each other!
 */

import { Agent, run } from '../../src';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';
import 'dotenv/config';

// ============================================
// 1. GOAL AGENT - Tracks and manages goals
// ============================================

const goalAgent = new Agent({
  name: 'GoalManager',
  model: openai('gpt-4o-mini'),
  instructions: `
You are a goal management agent.

Your responsibilities:
- Parse user requests to identify goals
- Track goal status (pending, in_progress, completed, blocked)
- Prioritize goals based on importance and dependencies
- Report goal progress

When you receive a request:
1. Extract the main goal(s)
2. Break down complex goals into sub-goals
3. Assign priorities
4. Transfer to the Planner to create execution plan

Always return structured goal information.
  `,
  output: {
    schema: z.object({
      goals: z.array(z.object({
        id: z.string(),
        description: z.string(),
        status: z.enum(['pending', 'in_progress', 'completed', 'blocked']),
        priority: z.number().min(1).max(10),
        subgoals: z.array(z.string()).optional()
      })),
      nextAction: z.string()
    })
  },

  // Transfer to Planner when goals are identified
  subagents: [] // Will be set below
});

// ============================================
// 2. PLANNER AGENT - Creates execution plans
// ============================================

const plannerAgent = new Agent({
  name: 'Planner',
  model: openai('gpt-4o-mini'),
  instructions: `
You are a strategic planning agent.

Your responsibilities:
- Create step-by-step execution plans for goals
- Identify required tools and resources
- Detect dependencies between steps
- Optimize for efficiency and cost

When you receive goals:
1. Analyze what needs to be done
2. Break into sequential or parallel steps
3. Identify which tools/agents to use
4. Estimate token/time costs
5. Transfer to Executor or transfer back with plan

Always return a structured execution plan.
  `,
  output: {
    schema: z.object({
      plan: z.array(z.object({
        step: z.number(),
        action: z.string(),
        agent: z.string().optional(),
        tool: z.string().optional(),
        dependencies: z.array(z.number()).optional(),
        estimatedCost: z.number().optional()
      })),
      reasoning: z.string(),
      readyToExecute: z.boolean()
    })
  },

  subagents: [] // Will be set below
});

// ============================================
// 3. EXECUTOR AGENT - Executes the plan
// ============================================

const executorAgent = new Agent({
  name: 'Executor',
  model: openai('gpt-4o-mini'),
  instructions: `
You are a task execution agent.

Your responsibilities:
- Execute planned steps using available tools
- Handle errors gracefully
- Report progress
- Transfer to Reflector for evaluation

When you receive a plan:
1. Execute each step in order (or parallel if independent)
2. Use tools as specified
3. Collect results
4. Transfer to Reflector with results

Always provide detailed execution results.
  `,
  tools: {
    search: {
      description: 'Search for information',
      inputSchema: z.object({ query: z.string() }),
      execute: async ({ query }) => {
        return { results: [`Result for: ${query}`] };
      }
    },
    calculate: {
      description: 'Perform calculations',
      inputSchema: z.object({ expression: z.string() }),
      execute: async ({ expression }) => {
        try {
          const result = eval(expression);
          return { result };
        } catch (error) {
          return { error: 'Invalid expression' };
        }
      }
    }
  },

  subagents: [] // Will be set below
});

// ============================================
// 4. REFLECTOR AGENT - Evaluates results
// ============================================

const reflectorAgent = new Agent({
  name: 'Reflector',
  model: openai('gpt-4o-mini'),
  instructions: `
You are a reflection and evaluation agent.

Your responsibilities:
- Evaluate if actions achieved the goals
- Identify what went well and what didn't
- Suggest corrections or improvements
- Decide if we need to retry or continue

When you receive execution results:
1. Compare results against original goals
2. Evaluate success/failure
3. Analyze root causes of any failures
4. Recommend next steps (retry, continue, adjust plan)
5. Update goal status
6. Provide final answer to user OR transfer back to Planner

Always provide honest, constructive evaluation.
  `,
  output: {
    schema: z.object({
      evaluation: z.object({
        success: z.boolean(),
        goalsAchieved: z.array(z.string()),
        goalsRemaining: z.array(z.string()),
        reasoning: z.string()
      }),
      corrections: z.array(z.string()).optional(),
      nextAction: z.enum(['complete', 'retry', 'replan', 'continue']),
      finalAnswer: z.string().optional()
    })
  },

  subagents: [] // Will be set below
});

// ============================================
// 5. MAIN ORCHESTRATOR AGENT
// ============================================

const mainAgent = new Agent({
  name: 'Orchestrator',
  model: openai('gpt-4o-mini'),
  instructions: `
You are the main orchestrator agent.

When you receive a user request:
1. Immediately use the transfer_to_goalmanager tool to send the request to the GoalManager
2. Let the GoalManager handle goal identification and planning
3. The specialized agents will handle the rest

Always transfer on the first turn - don't try to handle requests yourself.
  `,

  // Connect all agents via transfers
  subagents: [goalAgent, plannerAgent, executorAgent, reflectorAgent],

  transferDescription: 'Main entry point for user requests',

  tools: {
    // Add explicit tools for transfers if needed
  }
});

// Set up subagent relationships (bidirectional transfers)
goalAgent.subagents = [plannerAgent, mainAgent];
plannerAgent.subagents = [executorAgent, goalAgent, mainAgent];
executorAgent.subagents = [reflectorAgent, plannerAgent];
reflectorAgent.subagents = [plannerAgent, executorAgent, mainAgent];

// ============================================
// 6. EXAMPLE USAGE
// ============================================

async function example() {
  console.log('🚀 Multi-Agent System: Goal → Plan → Execute → Reflect\n');

  console.log('🔧 Main Agent Subagents:', mainAgent.subagents.map(a => a.name));
  console.log('🔧 Available Tools:', Object.keys(mainAgent.tools));
  console.log();

  const result = await run(mainAgent,
    'Goal: Research AI agent architectures and create a comparison report',
    {
      context: {
        userId: 'user-123',
        preferences: {
          detailLevel: 'comprehensive',
          format: 'markdown'
        }
      },
      maxTurns: 20  // Allow more turns for multi-agent flow
    }
  );

  console.log('\n✅ Final Result:', result.finalOutput);
  console.log('\n📊 Agent Path:', result.metadata.handoffChain);
  console.log('🤖 Total Agents:', result.metadata.agentMetrics?.length);
  console.log('💰 Tokens:', result.metadata.totalTokens);
  console.log('\n📝 Agent Metrics:');
  result.metadata.agentMetrics?.forEach(m => {
    console.log(`  - ${m.agentName}: ${m.turns} turns, ${m.tokens?.total ?? 0} tokens`);
  });
}

// ============================================
// 7. KEY BENEFITS OF THIS APPROACH
// ============================================

/*
✅ No separate "systems" - everything is an agent
✅ Uses existing transfer mechanism (already optimized)
✅ Context isolation per agent
✅ Parallel tool execution built-in
✅ End-to-end tracing with Langfuse
✅ Goals/plans stored in context
✅ Can add more specialized agents easily
✅ Each agent can be tested independently
✅ Full observability of the entire flow

FLOW:
User → Orchestrator → GoalManager → Planner → Executor → Reflector → User
                         ↑              ↑          ↑          ↓
                         └──────────────┴──────────┴──────────┘
                              (Can transfer back for replanning)
*/

// Export for testing
export {
  mainAgent,
  goalAgent,
  plannerAgent,
  executorAgent,
  reflectorAgent,
  example
};

// Run example if called directly
if (require.main === module) {
  example().catch(console.error);
}
