/**
 * REAL Multi-Agent Coordination Demo
 *
 * This demonstrates actual agent-to-agent coordination with back-and-forth communication
 */

import { Agent, run, tool } from '../../src';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';
import 'dotenv/config';

// ============================================
// DATA COLLECTOR AGENT - Gathers data
// ============================================

const dataCollectorAgent = new Agent({
  name: 'DataCollector',
  model: openai('gpt-4o-mini'),
  instructions: `You are a data collection agent.

When given a topic:
1. Use the gatherData tool to collect information
2. Organize findings clearly
3. Use transfer_to_analyst to transfer the data to the Analyst

Be thorough and systematic.`,

  tools: {
    gatherData: tool({
      description: 'Gather data about a topic',
      inputSchema: z.object({ topic: z.string() }),
      execute: async ({ topic }) => {
        console.log(`\n🔍 [DataCollector] Gathering data on: ${topic}`);
        return {
          topic,
          dataPoints: [
            `${topic} has seen 300% growth in 2024`,
            `Key players: OpenAI, Anthropic, Google`,
            `Main use cases: Customer service, code generation, research`
          ],
          sources: 3,
          timestamp: new Date().toISOString()
        };
      }
    })
  }
});

// ============================================
// ANALYST AGENT - Analyzes data
// ============================================

const analystAgent = new Agent({
  name: 'Analyst',
  model: openai('gpt-4o-mini'),
  instructions: `You are an analytical agent.

When you receive data:
1. Use the analyzeData tool to process it
2. Extract key insights and patterns
3. Use transfer_to_writer to send analysis to the Writer

Be insightful and thorough.`,

  tools: {
    analyzeData: tool({
      description: 'Analyze collected data',
      inputSchema: z.object({ data: z.string() }),
      execute: async ({ data }) => {
        console.log(`\n📊 [Analyst] Analyzing data...`);
        return {
          insights: [
            'Exponential growth trajectory indicates strong market demand',
            'Competition is intensifying among major providers',
            'Enterprise adoption is primary growth driver'
          ],
          trends: ['Increased automation', 'Focus on reliability', 'Cost optimization'],
          confidence: 0.92
        };
      }
    })
  }
});

// ============================================
// WRITER AGENT - Creates report
// ============================================

const writerAgent = new Agent({
  name: 'Writer',
  model: openai('gpt-4o-mini'),
  instructions: `You are a content writer agent.

When you receive analysis:
1. Use the createReport tool to draft content
2. Structure it professionally
3. Use transfer_to_reviewer to send for review

Write clearly and engagingly.`,

  tools: {
    createReport: tool({
      description: 'Create a report from analysis',
      inputSchema: z.object({ analysis: z.string() }),
      execute: async ({ analysis }) => {
        console.log(`\n✍️  [Writer] Creating report...`);
        return {
          report: `
# AI Agents Market Report

## Executive Summary
The AI agents market is experiencing exponential growth with 300% increase in 2024.

## Key Insights
- Strong market demand driving rapid expansion
- Major players (OpenAI, Anthropic, Google) competing intensely
- Enterprise adoption is the primary growth driver

## Market Trends
- Increased automation across industries
- Focus on reliability and observability
- Cost optimization becoming critical

## Primary Use Cases
1. Customer service automation
2. Code generation and development
3. Research and analysis

## Conclusion
The market shows strong fundamentals with continued growth expected.
          `,
          wordCount: 250,
          sections: 6
        };
      }
    })
  }
});

// ============================================
// REVIEWER AGENT - Reviews and provides feedback
// ============================================

const reviewerAgent = new Agent({
  name: 'Reviewer',
  model: openai('gpt-4o-mini'),
  instructions: `You are a quality reviewer agent.

When you receive a report:
1. Use the reviewReport tool to evaluate quality
2. If quality score < 80: use transfer_to_writer to send back for revision with feedback
3. If quality score >= 80: approve and return the final report

Be constructive and quality-focused.`,

  tools: {
    reviewReport: tool({
      description: 'Review report quality',
      inputSchema: z.object({ report: z.string() }),
      execute: async ({ report }) => {
        console.log(`\n🔍 [Reviewer] Reviewing report...`);
        const score = 85; // Simulating good quality
        return {
          qualityScore: score,
          approved: score >= 80,
          feedback: score >= 80
            ? 'Excellent work! Report is well-structured and comprehensive.'
            : 'Needs more detail in the methodology section.',
          strengths: ['Clear structure', 'Good insights', 'Professional tone'],
          improvements: score < 80 ? ['Add methodology', 'More examples'] : []
        };
      }
    })
  }
});

// ============================================
// COORDINATOR AGENT - Orchestrates the workflow
// ============================================

const coordinatorAgent = new Agent({
  name: 'Coordinator',
  model: openai('gpt-4o-mini'),
  instructions: `You are the workflow coordinator.

When you receive a request:
1. Use transfer_to_datacollector to start the data collection process
2. The workflow will automatically flow: DataCollector → Analyst → Writer → Reviewer
3. When you receive the approved report back, format it and present to the user

You orchestrate but the specialists do the work.`,
});

// ============================================
// SET UP AGENT CHAIN (Using subagents property)
// ============================================

// Coordinator starts the flow
coordinatorAgent.subagents = [dataCollectorAgent];

// DataCollector → Analyst
dataCollectorAgent.subagents = [analystAgent];

// Analyst → Writer
analystAgent.subagents = [writerAgent];

// Writer → Reviewer
writerAgent.subagents = [reviewerAgent];

// Reviewer can go back to Writer (revision) or to Coordinator (done)
reviewerAgent.subagents = [writerAgent, coordinatorAgent];

// ============================================
// RUN TEST
// ============================================

async function testRealCoordination() {
  console.log('\n🎭 REAL MULTI-AGENT COORDINATION TEST');
  console.log('═══════════════════════════════════════════════════════════\n');
  console.log('📋 Task: Create market analysis report on AI agents\n');
  console.log('🔄 Agent Flow:');
  console.log('   Coordinator → DataCollector → Analyst → Writer → Reviewer → Coordinator\n');
  console.log('═══════════════════════════════════════════════════════════\n');

  const result = await run(
    coordinatorAgent,
    'Create a comprehensive market analysis report on AI agents, including growth data, key players, and trends',
    {
      maxTurns: 25,
      context: {
        reportType: 'market-analysis',
        audience: 'executives'
      }
    }
  );

  console.log('\n\n📊 COORDINATION SUMMARY');
  console.log('═══════════════════════════════════════════════════════════\n');

  console.log('🔄 Agent Transfer Chain:');
  if (result.metadata.handoffChain && result.metadata.handoffChain.length > 0) {
    console.log('   ' + result.metadata.handoffChain.join(' → '));
  } else {
    console.log('   Coordinator (no transfers)');
  }

  console.log('\n🤖 Agents Participated:', result.metadata.agentMetrics?.length || 1);
  result.metadata.agentMetrics?.forEach(metric => {
    console.log(`   • ${metric.agentName}: ${metric.turns} turn(s), ${metric.tokens?.total ?? 0} tokens`);
  });

  console.log('\n🔧 Tools Executed:', result.metadata.totalToolCalls);
  console.log('💰 Total Tokens:', result.metadata.totalTokens);
  console.log('⏱️  Total Turns:', result.steps.length);

  console.log('\n📝 Final Output:');
  console.log('─────────────────────────────────────────────────────────');
  const output = typeof result.finalOutput === 'string'
    ? result.finalOutput
    : JSON.stringify(result.finalOutput, null, 2);
  console.log(output.substring(0, 800));
  if (output.length > 800) console.log('... (truncated)');
  console.log('─────────────────────────────────────────────────────────');

  console.log('\n✅ Coordination test completed!\n');

  return result;
}

if (require.main === module) {
  testRealCoordination()
    .catch(error => {
      console.error('\n❌ Test failed:', error.message);
      process.exit(1);
    });
}

export { testRealCoordination };
