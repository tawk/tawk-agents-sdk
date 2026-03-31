/**
 * 04 - Sessions (Memory)
 *
 * Learn how to maintain conversation history and context across multiple turns.
 * Use message arrays to pass conversation history to agents.
 */

import 'dotenv/config';
import { Agent, run } from '../../src';
import { openai } from '@ai-sdk/openai';

const agent = new Agent({
  name: 'assistant',
  model: openai('gpt-4o'),
  instructions: 'You are a helpful assistant. Remember context from earlier messages.'
});

async function main() {
  console.log('💬 Example 04: Sessions (Memory)\n');

  // First turn
  console.log('Turn 1: My name is Alice');
  const result1 = await run(agent, 'My name is Alice');
  console.log('Agent:', result1.finalOutput);

  // Multi-turn: pass conversation history
  console.log('\nTurn 2: What is my name?');
  const result2 = await run(agent, [
    { role: 'user' as const, content: 'My name is Alice' },
    { role: 'assistant' as const, content: result1.finalOutput },
    { role: 'user' as const, content: 'What is my name?' }
  ]);
  console.log('Agent:', result2.finalOutput);

  // Multi-turn: add another message to the history
  console.log('\nTurn 3: What did I tell you in my first message?');
  const result3 = await run(agent, [
    { role: 'user' as const, content: 'My name is Alice' },
    { role: 'assistant' as const, content: result1.finalOutput },
    { role: 'user' as const, content: 'What is my name?' },
    { role: 'assistant' as const, content: result2.finalOutput },
    { role: 'user' as const, content: 'What did I tell you in my first message?' }
  ]);
  console.log('Agent:', result3.finalOutput);

  console.log('\n✅ Sessions example complete!');
}

main().catch(console.error);


