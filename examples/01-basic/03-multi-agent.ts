/**
 * 03 - Multi-Agent System
 * 
 * Learn how multiple specialized agents can work together through transfers.
 * This demonstrates agent coordination and task delegation.
 */

import 'dotenv/config';
import { Agent, run, tool } from '../../src';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';

async function main() {
  console.log('👥 Example 03: Multi-Agent System\n');

  // Math specialist agent
  const mathAgent = new Agent({
    name: 'MathAgent',
    model: openai('gpt-4o-mini'),
    instructions: 'You are a math expert. Solve mathematical problems and show your work.',
    tools: {
      calculate: tool({
        description: 'Perform calculations',
        inputSchema: z.object({
          expression: z.string(),
        }),
        execute: async ({ expression }) => {
          const result = eval(expression);
          return `Result: ${result}`;
        },
      }),
    },
  });

  // Weather specialist agent
  const weatherAgent = new Agent({
    name: 'WeatherAgent',
    model: openai('gpt-4o-mini'),
    instructions: 'You are a weather expert. Provide weather information.',
    tools: {
      getWeather: tool({
        description: 'Get weather for a city',
        inputSchema: z.object({
          city: z.string(),
        }),
        execute: async ({ city }) => {
          const conditions = ['sunny', 'rainy', 'cloudy'];
          return `Weather in ${city}: ${conditions[Math.floor(Math.random() * conditions.length)]}, ${15 + Math.floor(Math.random() * 15)}°C`;
        },
      }),
    },
  });

  // Coordinator agent that can delegate to specialists
  const coordinator = new Agent({
    name: 'Coordinator',
    model: openai('gpt-4o-mini'),
    instructions: `You are a coordinator that can transfer to specialist agents. When users ask about:
- Math/calculations: transfer to MathAgent
- Weather: transfer to WeatherAgent
- General questions: answer directly

To transfer, use the appropriate transfer_to_* tool.`,
    subagents: [mathAgent, weatherAgent],
  });

  // Test multi-agent coordination
  console.log('Query: What is 45 + 67 and what\'s the weather in Paris?');
  const result = await run(coordinator, "What is 45 + 67 and what's the weather in Paris?");
  
  console.log('\nResponse:', result.finalOutput);
  console.log('\nHandoff chain:', result.metadata.handoffChain?.join(' → ') || 'No handoffs');
  console.log('Agents involved:', result.metadata.agentMetrics?.map(m => m.agentName).join(', '));

  console.log('\n✅ Multi-agent example complete!');
}

main().catch(console.error);


