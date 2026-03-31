/**
 * 02 - Agent with Tools
 * 
 * Learn how to give your agent capabilities through tools.
 * Tools allow agents to perform actions and access external functionality.
 */

import 'dotenv/config';
import { Agent, run, tool } from '../../src';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';

async function main() {
  console.log('🔧 Example 02: Agent with Tools\n');

  // Define tools
  const calculator = tool({
    description: 'Perform mathematical calculations',
    inputSchema: z.object({
      expression: z.string().describe('Math expression to evaluate (e.g., "2 + 2")'),
    }),
    execute: async ({ expression }) => {
      try {
        // Note: eval() is used for demo only. Use a proper math library in production!
        const result = eval(expression);
        return `The result is ${result}`;
      } catch (error) {
        return `Error: Invalid expression`;
      }
    },
  });

  const getWeather = tool({
    description: 'Get current weather for a city',
    inputSchema: z.object({
      city: z.string().describe('City name'),
    }),
    execute: async ({ city }) => {
      // Simulate API call
      const weather = ['sunny', 'rainy', 'cloudy', 'snowy'];
      const temp = Math.floor(Math.random() * 30) + 5;
      return `The weather in ${city} is ${weather[Math.floor(Math.random() * weather.length)]} with a temperature of ${temp}°C`;
    },
  });

  // Create agent with tools
  const agent = new Agent({
    name: 'ToolAgent',
    model: openai('gpt-4o-mini'),
    instructions: 'You are a helpful assistant with access to tools. Use them when needed.',
    tools: {
      calculator,
      getWeather,
    },
  });

  // Test the agent
  console.log('Query 1: What is 15 * 23?');
  const result1 = await run(agent, 'What is 15 * 23?');
  console.log('Response:', result1.finalOutput);

  console.log('\nQuery 2: What\'s the weather in Tokyo?');
  const result2 = await run(agent, "What's the weather in Tokyo?");
  console.log('Response:', result2.finalOutput);

  console.log('\n✅ Agent with tools example complete!');
}

main().catch(console.error);


