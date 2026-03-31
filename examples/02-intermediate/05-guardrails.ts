/**
 * 05 - Guardrails
 * 
 * Learn how to add safety checks and validation to your agents.
 * Guardrails protect against unsafe inputs and outputs.
 */

import 'dotenv/config';
import { Agent, run, lengthGuardrail, piiDetectionGuardrail } from '../../src';
import { openai } from '@ai-sdk/openai';

async function main() {
  console.log('🛡️ Example 05: Guardrails\n');

  // Create agent with guardrails
  const agent = new Agent({
    name: 'SafeAgent',
    model: openai('gpt-4o-mini'),
    instructions: 'You are a helpful assistant.',
    guardrails: [
      lengthGuardrail({ type: 'output', maxLength: 500 }),
      piiDetectionGuardrail({ type: 'output', block: true }),
    ],
  });

  // Test 1: Normal query
  console.log('Test 1: Normal query');
  const result1 = await run(agent, 'What is artificial intelligence?');
  console.log('Response:', result1.finalOutput.substring(0, 100) + '...');

  // Test 2: Query with PII
  console.log('\nTest 2: Query with PII (should be detected)');
  try {
    const result2 = await run(agent, 'My email is john@example.com and my SSN is 123-45-6789');
    console.log('Response:', result2.finalOutput);
  } catch (error: any) {
    console.log('Guardrail triggered:', error.message);
  }

  // Test 3: Too long input
  console.log('\nTest 3: Very long input (should be truncated/blocked)');
  const longText = 'word '.repeat(200);
  try {
    const result3 = await run(agent, longText);
    console.log('Response:', result3.finalOutput.substring(0, 100) + '...');
  } catch (error: any) {
    console.log('Guardrail triggered:', error.message);
  }

  console.log('\n✅ Guardrails example complete!');
}

main().catch(console.error);


