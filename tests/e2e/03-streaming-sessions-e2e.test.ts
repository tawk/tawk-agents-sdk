/**
 * E2E TEST 03: Streaming & Sessions
 * 
 * Real API tests for:
 * - Streaming responses
 * - Session management
 * - Conversation memory
 */

import 'dotenv/config';
import { Agent, runStream, run, setDefaultModel, SessionManager } from '../../src';
import { openai } from '@ai-sdk/openai';

setDefaultModel(openai('gpt-4o-mini'));

console.log('\n🧪 E2E TEST 03: Streaming & Sessions\n');
console.log('⚠️  This test makes REAL API calls!\n');

// ============================================
// TEST 1: Streaming Response
// ============================================

async function test1_Streaming() {
  console.log('📍 Test 1: Streaming Response');

  const agent = new Agent({
    name: 'Storyteller',
    instructions: 'Tell a very short story in 2-3 sentences.',
  });

  const stream = await runStream(agent, 'Tell me a story about a robot');

  console.log('📝 Streaming output:');
  process.stdout.write('   ');

  let fullText = '';
  for await (const chunk of stream.textStream) {
    process.stdout.write(chunk);
    fullText += chunk;
  }

  const result = await stream.completed;

  console.log('\n✅ Streaming complete');
  console.log('📊 Tokens:', result.metadata.totalTokens);
  console.log();

  return result;
}

// ============================================
// TEST 2: Session Memory (In-Memory)
// ============================================

async function test2_SessionMemory() {
  console.log('📍 Test 2: Session Memory');

  const sessionManager = new SessionManager({ type: 'memory' });
  const session = sessionManager.getSession('user-123');

  const agent = new Agent({
    name: 'Assistant',
    instructions: 'You are helpful. Remember what the user tells you.',
  });

  // Turn 1: Tell the agent something
  console.log('   💬 Turn 1: "My favorite color is blue"');
  const result1 = await run(agent, 'My favorite color is blue', { session });
  console.log('   🤖', result1.finalOutput.substring(0, 60) + '...');

  // Turn 2: Ask about it
  console.log('   💬 Turn 2: "What is my favorite color?"');
  const result2 = await run(agent, 'What is my favorite color?', { session });
  console.log('   🤖', result2.finalOutput);

  const hasMemory = result2.finalOutput.toLowerCase().includes('blue');
  console.log('✅ Memory works:', hasMemory ? 'YES' : 'NO');
  console.log('📊 Total tokens:', (result1.metadata.totalTokens || 0) + (result2.metadata.totalTokens || 0));
  console.log();

  return result2;
}

// ============================================
// TEST 3: Multi-Turn with Context
// ============================================

async function test3_MultiTurnContext() {
  console.log('📍 Test 3: Multi-Turn Conversation with Session');

  const sessionManager = new SessionManager({ type: 'memory' });
  const session = sessionManager.getSession('multi-turn-user');

  const agent = new Agent({
    name: 'Tutor',
    instructions: 'You are a patient tutor. Be concise.',
  });

  const turns = [
    "I'm learning TypeScript",
    "What are interfaces?",
    "Thank you!"
  ];

  let totalTokens = 0;

  for (let i = 0; i < turns.length; i++) {
    console.log(`   💬 Turn ${i + 1}: "${turns[i]}"`);
    
    const result = await run(agent, turns[i], { session });
    
    totalTokens += result.metadata.totalTokens || 0;
    
    const preview = result.finalOutput.substring(0, 80);
    console.log(`   🤖 ${preview}...`);
  }

  console.log('✅ Multi-turn conversation complete');
  console.log('📊 Total tokens across all turns:', totalTokens);
  console.log();

  return true;
}

// ============================================
// RUN ALL TESTS
// ============================================

async function runAllTests() {
  const startTime = Date.now();

  try {
    await test1_Streaming();
    await test2_SessionMemory();
    await test3_MultiTurnContext();

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ ALL STREAMING & SESSION E2E TESTS PASSED!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`⏱️  Duration: ${duration}s`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  } catch (error: any) {
    console.error('\n❌ E2E TEST FAILED:', error.message);
    process.exit(1);
  }
}

if (!process.env.OPENAI_API_KEY) {
  console.error('❌ Error: OPENAI_API_KEY not found');
  process.exit(1);
}

runAllTests();

