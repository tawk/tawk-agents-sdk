/**
 * 06 - Streaming
 * 
 * Learn how to stream responses in real-time for better UX.
 * Streaming provides immediate feedback to users.
 */

import 'dotenv/config';
import { Agent, runStream } from '../../src';
import { openai } from '@ai-sdk/openai';

async function main() {
  console.log('🌊 Example 06: Streaming\n');

  // Create an agent
  const agent = new Agent({
    name: 'StreamAgent',
    model: openai('gpt-4o-mini'),
    instructions: 'You are a helpful assistant. Provide detailed explanations.',
  });

  console.log('Query: Explain how neural networks work\n');
  console.log('Streaming response:');
  console.log('─'.repeat(60));

  // Stream the response
  const stream = await runStream(agent, 'Explain how neural networks work in 3 paragraphs');

  // Listen to events
  for await (const event of stream.fullStream) {
    if (event.type === 'text-delta') {
      process.stdout.write(event.textDelta);
    }
  }

  console.log('\n' + '─'.repeat(60));

  // Get final result
  const result = await stream.completed;
  console.log('\n📊 Metadata:');
  console.log('- Total tokens:', result.metadata.totalTokens);
  console.log('- Steps:', result.steps.length);

  console.log('\n✅ Streaming example complete!');
}

main().catch(console.error);


