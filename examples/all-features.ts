/**
 * Comprehensive Examples - All Features
 * 
 * This file demonstrates every feature of the Tawk Agents SDK with complete,
 * runnable examples. Each example is self-contained and can be run independently.
 * 
 * @fileoverview Complete showcase of Tawk Agents SDK capabilities including:
 * - Basic agent creation and execution
 * - Tool calling with context injection
 * - Multi-agent handoffs
 * - Streaming responses
 * - Session management
 * - Guardrails for safety
 * - Structured output
 * - AI features (embeddings, images, audio, reranking)
 * - Race agents pattern
 * - TOON format for efficient token usage
 * - Dynamic instructions and tool enabling
 * 
 * @example
 * ```bash
 * # Run all examples
 * npx tsx examples/all-features.ts
 * 
 * # Run a specific example
 * npx tsx examples/all-features.ts "basic-agent"
 * ```
 * 
 * @module examples/all-features
 * @author Tawk Agents SDK
 * @version 3.0.0
 */

import 'dotenv/config';
import {
  Agent,
  run,
  runStream,
  // Guardrails
  contentSafetyGuardrail,
  lengthGuardrail,
  // AI Features
  createEmbeddingTool,
  createImageGenerationTool,
  createRerankTool,
  // TOON
  encodeTOON,
  decodeTOON,
} from '../src';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';

// ============================================
// EXAMPLE 1: Basic Agent
// ============================================

/**
 * Example 1: Basic Agent
 * 
 * Demonstrates the simplest use case - creating an agent and running it
 * with a simple text input.
 * 
 * @example
 * ```typescript
 * const agent = new Agent({
 *   name: 'assistant',
 *   instructions: 'You are a helpful assistant.'
 * });
 * const result = await run(agent, 'What is the capital of France?');
 * ```
 */
export async function example1_BasicAgent() {
  console.log('\n📝 Example 1: Basic Agent\n');
  
  const agent = new Agent({
    name: 'assistant',
    model: openai('gpt-4o-mini'),
    instructions: 'You are a helpful assistant. Answer questions concisely.',
  });
  
  const result = await run(agent, 'What is the capital of France?');
  console.log('Response:', result.finalOutput);
}

// ============================================
// EXAMPLE 2: Agent with Tools
// ============================================

/**
 * Example 2: Agent with Tools
 * 
 * Shows how to create an agent with custom tools that can perform actions.
 * Tools use AI SDK v6 format with inputSchema.
 * 
 * @example
 * ```typescript
 * const agent = new Agent({
 *   tools: {
 *     calculator: tool({
 *       description: 'Perform calculations',
 *       inputSchema: z.object({ expression: z.string() }),
 *       execute: async ({ expression }) => eval(expression)
 *     })
 *   }
 * });
 * ```
 */
export async function example2_AgentWithTools() {
  console.log('\n📝 Example 2: Agent with Tools\n');
  
  const agent = new Agent({
    name: 'calculator',
    model: openai('gpt-4o-mini'),
    instructions: 'You are a calculator. Use tools to perform calculations.',
    tools: {
      add: {
        description: 'Add two numbers',
        inputSchema: z.object({
          a: z.number(),
          b: z.number()
        }),
        execute: async ({ a, b }) => {
          console.log(`   🔢 Calculating: ${a} + ${b}`);
          return { result: a + b };
        }
      },
      multiply: {
        description: 'Multiply two numbers',
        inputSchema: z.object({
          a: z.number(),
          b: z.number()
        }),
        execute: async ({ a, b }) => {
          console.log(`   🔢 Calculating: ${a} × ${b}`);
          return { result: a * b };
        }
      }
    }
  });
  
  const result = await run(agent, 'What is 15 + 23 and then multiply by 2?');
  console.log('Response:', result.finalOutput);
  console.log('Tools called:', result.metadata.totalToolCalls);
}

// ============================================
// EXAMPLE 3: Context Injection
// ============================================

/**
 * Example 3: Context Injection
 * 
 * Demonstrates how to pass custom context to agents and tools.
 * Context is automatically injected into tool execution functions.
 * 
 * @example
 * ```typescript
 * const agent = new Agent<UserContext>({
 *   tools: {
 *     getUserInfo: {
 *       execute: async (_, context) => {
 *         return context.context.userId;
 *       }
 *     }
 *   }
 * });
 * 
 * await run(agent, 'Who am I?', {
 *   context: { userId: 'user-123' }
 * });
 * ```
 */
export async function example3_ContextInjection() {
  console.log('\n📝 Example 3: Context Injection\n');
  
  interface UserContext {
    userId: string;
    userName: string;
    permissions: string[];
  }
  
  const agent = new Agent<UserContext>({
    name: 'user-assistant',
    model: openai('gpt-4o-mini'),
    instructions: (ctx) => `You are helping ${ctx.context.userName} (ID: ${ctx.context.userId})`,
    tools: {
      getUserInfo: {
        description: 'Get current user information',
        inputSchema: z.object({}),
        execute: async (_: Record<string, never>, context: { context: UserContext }) => {
          const ctx = context.context;
          return {
            userId: ctx.userId,
            userName: ctx.userName,
            permissions: ctx.permissions
          };
        }
      }
    }
  });
  
  const result = await run(agent, 'Who am I?', {
    context: {
      userId: 'user-123',
      userName: 'Alice',
      permissions: ['read', 'write']
    }
  });
  
  console.log('Response:', result.finalOutput);
}

// ============================================
// EXAMPLE 4: Multi-Agent Handoffs
// ============================================

/**
 * Example 4: Multi-Agent Transfers
 * 
 * Shows how to create a multi-agent system where one agent can
 * delegate tasks to specialized agents.
 * 
 * @example
 * ```typescript
 * const specialist = new Agent({
 *   name: 'specialist',
 *   transferDescription: 'Expert in specific domain'
 * });
 * 
 * const coordinator = new Agent({
 *   name: 'coordinator',
 *   subagents: [specialist]
 * });
 * ```
 */
export async function example4_MultiAgentHandoffs() {
  console.log('\n📝 Example 4: Multi-Agent Handoffs\n');
  
  const salesAgent = new Agent({
    name: 'sales',
    model: openai('gpt-4o-mini'),
    instructions: 'You are a sales agent. Answer: "I can help with sales and pricing."',
    transferDescription: 'Handle sales and pricing questions'
  });

  const supportAgent = new Agent({
    name: 'support',
    model: openai('gpt-4o-mini'),
    instructions: 'You are a support agent. Answer: "I can help with technical issues."',
    transferDescription: 'Handle technical support questions'
  });

  const triageAgent = new Agent({
    name: 'triage',
    model: openai('gpt-4o-mini'),
    instructions: 'You are a triage agent. Route users to sales for pricing questions, support for technical issues.',
  });
  
  triageAgent.subagents = [salesAgent, supportAgent];
  
  const result = await run(triageAgent, 'I need help with pricing', { maxTurns: 10 });
  console.log('Response:', result.finalOutput);
  console.log('Handoff chain:', result.metadata.handoffChain);
}

// ============================================
// EXAMPLE 5: Streaming
// ============================================

/**
 * Example 5: Streaming
 * 
 * Demonstrates real-time streaming of agent responses.
 * Useful for chat interfaces and progressive output display.
 * 
 * @example
 * ```typescript
 * const stream = await runStream(agent, 'Tell me a story');
 * 
 * for await (const chunk of stream.textStream) {
 *   process.stdout.write(chunk);
 * }
 * 
 * const result = await stream.completed;
 * ```
 */
export async function example5_Streaming() {
  console.log('\n📝 Example 5: Streaming\n');
  
  const agent = new Agent({
    name: 'storyteller',
    model: openai('gpt-4o-mini'),
    instructions: 'Tell a short story about AI agents.',
  });
  
  const streamResult = await runStream(agent, 'Tell me a story', { maxTurns: 3 });
  
  console.log('Streaming response:');
  for await (const chunk of streamResult.textStream) {
    process.stdout.write(chunk);
  }
  console.log('\n');
}

// ============================================
// EXAMPLE 6: Session Management
// ============================================

/**
 * Example 6: Multi-turn Conversations
 *
 * Shows how to maintain conversation history across multiple turns
 * by passing message arrays.
 *
 * @example
 * ```typescript
 * const result1 = await run(agent, 'My name is Alice');
 * const result2 = await run(agent, [
 *   { role: 'user', content: 'My name is Alice' },
 *   { role: 'assistant', content: result1.finalOutput },
 *   { role: 'user', content: 'What is my name?' }
 * ]);
 * ```
 */
export async function example6_SessionManagement() {
  console.log('\n📝 Example 6: Multi-turn Conversations\n');

  const agent = new Agent({
    name: 'conversational',
    model: openai('gpt-4o-mini'),
    instructions: 'You are a conversational assistant. Remember our conversation.',
  });

  // First turn
  const result1 = await run(agent, 'My name is Alice');

  // Second turn: pass conversation history as message array
  const result = await run(agent, [
    { role: 'user' as const, content: 'My name is Alice' },
    { role: 'assistant' as const, content: result1.finalOutput },
    { role: 'user' as const, content: 'What is my name?' }
  ]);

  console.log('Response:', result.finalOutput);
}

// ============================================
// EXAMPLE 7: Guardrails
// ============================================

/**
 * Example 7: Guardrails
 * 
 * Demonstrates input and output validation using guardrails.
 * Guardrails are configured in AgentConfig, not RunOptions.
 * 
 * @example
 * ```typescript
 * const agent = new Agent({
 *   guardrails: [
 *     contentSafetyGuardrail({
 *       type: 'input',
 *       model: openai('gpt-4o-mini')
 *     }),
 *     lengthGuardrail({
 *       type: 'output',
 *       maxLength: 1000
 *     })
 *   ]
 * });
 * ```
 */
export async function example7_Guardrails() {
  console.log('\n📝 Example 7: Guardrails\n');
  
  const agent = new Agent({
    name: 'safe-agent',
    model: openai('gpt-4o-mini'),
    instructions: 'You are a helpful assistant.',
    guardrails: [
      contentSafetyGuardrail({
        type: 'input',
        model: openai('gpt-4o-mini'),
        categories: ['violence', 'hate-speech']
      }),
      lengthGuardrail({ 
        type: 'input',
        maxLength: 1000 
      }),
      lengthGuardrail({ 
        type: 'output',
        maxLength: 500 
      })
    ]
  });
  
  const result = await run(agent, 'Hello, how are you?');
  
  console.log('Response:', result.finalOutput);
}

// ============================================
// EXAMPLE 8: Structured Output
// ============================================

/**
 * Example 8: Structured Output
 * 
 * Shows how to get structured, typed output from agents using Zod schemas.
 * 
 * @example
 * ```typescript
 * const agent = new Agent({
 *   outputSchema: z.object({
 *     name: z.string(),
 *     age: z.number()
 *   })
 * });
 * 
 * const result = await run(agent, 'Extract user info');
 * // result.finalOutput is typed as { name: string, age: number }
 * ```
 */
export async function example8_StructuredOutput() {
  console.log('\n📝 Example 8: Structured Output\n');
  
  const userSchema = z.object({
    name: z.string(),
    age: z.number(),
    email: z.string().email()
  });
  
  const agent = new Agent({
    name: 'data-extractor',
    model: openai('gpt-4o-mini'),
    instructions: 'Extract user information from the text. Return ONLY valid JSON matching the schema. Do not include markdown code blocks, just the raw JSON object.',
    output: { schema: userSchema }
  });
  
  try {
    const result = await run(agent, 'My name is John, I am 30 years old, and my email is john@example.com');
    
    console.log('Structured output:', JSON.stringify(result.finalOutput, null, 2));
    // result.finalOutput is typed as { name: string, age: number, email: string }
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.log('⚠️  Structured output error (this is expected with some models):', err.message);
    console.log('💡 Tip: Use gpt-4o or claude-3-5-sonnet for better structured output support');
  }
}

// ============================================
// EXAMPLE 9: Embeddings
// ============================================

/**
 * Example 9: Embeddings
 * 
 * Demonstrates embedding generation for semantic search and RAG applications.
 * 
 * @example
 * ```typescript
 * const agent = new Agent({
 *   tools: {
 *     generateEmbedding: createEmbeddingTool(
 *       openai.embedding('text-embedding-3-small')
 *     )
 *   }
 * });
 * ```
 */
export async function example9_Embeddings() {
  console.log('\n📝 Example 9: Embeddings\n');
  
  const agent = new Agent({
    name: 'embedding-agent',
    model: openai('gpt-4o-mini'),
    instructions: 'You can generate embeddings for semantic search.',
    tools: {
      generateEmbedding: createEmbeddingTool(openai.embedding('text-embedding-3-small'))
    }
  });
  
  const result = await run(agent, 'Generate an embedding for "machine learning"', { maxTurns: 5 });
  console.log('Response:', result.finalOutput.substring(0, 100));
}

// ============================================
// EXAMPLE 10: Image Generation
// ============================================

/**
 * Example 10: Image Generation
 * 
 * Shows how to generate images using DALL-E or other image models.
 * Note: Image models require special handling due to type compatibility.
 * 
 * @example
 * ```typescript
 * const agent = new Agent({
 *   tools: {
 *     generateImage: createImageGenerationTool(
 *       openai.image('dall-e-3')
 *     )
 *   }
 * });
 * ```
 */
export async function example10_ImageGeneration() {
  console.log('\n📝 Example 10: Image Generation\n');
  
  try {
    // Note: openai.image() returns ImageModelV2 which needs type casting
    // This is a known limitation of the AI SDK type system where ImageModelV2
    // is not directly compatible with LanguageModel type expected by createImageGenerationTool
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const imageModel = openai.image('dall-e-3') as any;
    
    const agent = new Agent({
      name: 'image-creator',
      model: openai('gpt-4o-mini'),
      instructions: 'You can generate images from text descriptions.',
      tools: {
        generateImage: createImageGenerationTool(imageModel)
      }
    });
    
    const result = await run(agent, 'Generate an image of a sunset over mountains', { maxTurns: 5 });
    console.log('Response:', result.finalOutput.substring(0, 100));
  } catch (e: unknown) {
    const error = e instanceof Error ? e : new Error(String(e));
    console.log('⚠️  Image generation requires proper model setup:', error.message);
  }
}

// ============================================
// EXAMPLE 11: Reranking
// ============================================

/**
 * Example 11: Reranking
 * 
 * Demonstrates document reranking for improving search relevance.
 * Requires @ai-sdk/cohere or another reranking provider.
 * 
 * @example
 * ```typescript
 * import { cohere } from '@ai-sdk/cohere';
 * 
 * const agent = new Agent({
 *   tools: {
 *     rerank: createRerankTool(cohere.reranking('rerank-v3.5'))
 *   }
 * });
 * ```
 */
export async function example11_Reranking() {
  console.log('\n📝 Example 11: Reranking\n');
  
  try {
    // Dynamic import to handle optional dependency
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore - Optional dependency, handled by try-catch
    const { cohere } = await import('@ai-sdk/cohere');
    
    const agent = new Agent({
      name: 'search-assistant',
      model: openai('gpt-4o-mini'),
      instructions: 'You can rerank search results to find the most relevant documents.',
      tools: {
        rerank: createRerankTool(cohere.reranking('rerank-v3.5'))
      }
    });
    
    const documents = [
      'Machine learning is a subset of artificial intelligence',
      'The weather today is sunny and warm',
      'AI agents can use tools to interact with the world',
      'Cooking recipes for Italian pasta'
    ];
    
    const result = await run(
      agent, 
      `Rerank these documents for the query "AI agents": ${documents.join(', ')}`,
      { maxTurns: 5 }
    );
    
    console.log('Response:', result.finalOutput.substring(0, 200));
  } catch (e: unknown) {
    const error = e as { code?: string; message?: string };
    console.log('⚠️  Reranking requires @ai-sdk/cohere: npm install @ai-sdk/cohere');
    if (error.code !== 'MODULE_NOT_FOUND' && error.message) {
      console.error('Error:', error.message);
    }
  }
}

// ============================================
// EXAMPLE 12: Race Agents
// ============================================

/**
 * Example 12: Parallel Agents
 *
 * Demonstrates parallel execution of multiple agents using Promise.all.
 * Useful for running multiple agents simultaneously and aggregating results.
 *
 * @example
 * ```typescript
 * const [result1, result2] = await Promise.all([
 *   run(fastAgent, 'What is TypeScript?'),
 *   run(smartAgent, 'What is TypeScript?'),
 * ]);
 * ```
 */
export async function example12_RaceAgents() {
  console.log('\n📝 Example 12: Parallel Agents\n');

  const conciseAgent = new Agent({
    name: 'concise',
    model: openai('gpt-4o-mini'),
    instructions: 'Answer quickly and concisely in one sentence.',
  });

  const detailedAgent = new Agent({
    name: 'detailed',
    model: openai('gpt-4o-mini'),
    instructions: 'Answer with detailed information in multiple sentences.',
  });

  try {
    // Run both agents in parallel
    const [result1, result2] = await Promise.all([
      run(conciseAgent, 'What is the capital of France?'),
      run(detailedAgent, 'What is the capital of France?'),
    ]);

    console.log('Concise answer:', result1.finalOutput);
    console.log('Detailed answer:', result2.finalOutput);
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.log('⚠️  Parallel agents error:', err.message);
  }
}

// ============================================
// EXAMPLE 13: TOON Format
// ============================================

/**
 * Example 13: TOON Format
 * 
 * Demonstrates TOON (Token-Oriented Object Notation) for efficient
 * token usage. Provides 40%+ reduction vs JSON.
 * 
 * @example
 * ```typescript
 * const toon = encodeTOON(data);
 * const decoded = decodeTOON(toon);
 * ```
 */
export async function example13_TOONFormat() {
  console.log('\n📝 Example 13: TOON Format\n');
  
  const data = {
    users: [
      { id: 1, name: 'Alice', email: 'alice@example.com' },
      { id: 2, name: 'Bob', email: 'bob@example.com' }
    ]
  };
  
  const toon = encodeTOON(data);
  const decoded = decodeTOON(toon);
  
  console.log('Original size:', JSON.stringify(data).length, 'bytes');
  console.log('TOON size:', toon.length, 'bytes');
  console.log('Savings:', ((1 - toon.length / JSON.stringify(data).length) * 100).toFixed(1) + '%');
  console.log('Decoded matches:', JSON.stringify(decoded) === JSON.stringify(data));
}

// ============================================
// EXAMPLE 14: Dynamic Instructions
// ============================================

/**
 * Example 14: Dynamic Instructions
 * 
 * Shows how to use function-based instructions that adapt based on context.
 * 
 * @example
 * ```typescript
 * const agent = new Agent({
 *   instructions: (context) => {
 *     const hour = new Date().getHours();
 *     return `Current time: ${hour}:00`;
 *   }
 * });
 * ```
 */
export async function example14_DynamicInstructions() {
  console.log('\n📝 Example 14: Dynamic Instructions\n');
  
  const agent = new Agent({
    name: 'contextual',
    model: openai('gpt-4o-mini'),
    instructions: (_context) => {
      const hour = new Date().getHours();
      const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
      return `You are a helpful assistant. ${greeting}! The current time is ${new Date().toLocaleTimeString()}.`;
    }
  });
  
  const result = await run(agent, 'What time is it?');
  console.log('Response:', result.finalOutput);
}

// ============================================
// EXAMPLE 15: Dynamic Tool Enabling
// ============================================

/**
 * Example 15: Dynamic Tool Enabling
 * 
 * Demonstrates conditional tool enabling based on context.
 * Tools can be enabled/disabled dynamically using boolean or function.
 * 
 * @example
 * ```typescript
 * const agent = new Agent<Context>({
 *   tools: {
 *     adminTool: {
 *       enabled: (context) => context.context.userRole === 'admin',
 *       execute: async () => 'Admin action'
 *     }
 *   }
 * });
 * ```
 */
export async function example15_DynamicToolEnabling() {
  console.log('\n📝 Example 15: Dynamic Tool Enabling\n');
  
  interface Context {
    userRole: 'admin' | 'user';
  }
  
  const agent = new Agent<Context>({
    name: 'role-based',
    model: openai('gpt-4o-mini'),
    instructions: 'You have different tools based on user role.',
    tools: {
      publicTool: {
        description: 'A public tool everyone can use',
        inputSchema: z.object({ action: z.string() }),
        enabled: true,
        execute: async ({ action }) => `Public action: ${action}`
      },
      adminTool: {
        description: 'An admin-only tool',
        inputSchema: z.object({ action: z.string() }),
        enabled: (context) => context.context.userRole === 'admin',
        execute: async ({ action }) => `Admin action: ${action}`
      }
    }
  });
  
  // Test as regular user
  const result1 = await run(agent, 'Use a tool', {
    context: { userRole: 'user' as const },
    maxTurns: 5
  });
  console.log('User response:', result1.finalOutput.substring(0, 80));
  
  // Test as admin
  const result2 = await run(agent, 'Use admin tool', {
    context: { userRole: 'admin' as const },
    maxTurns: 5
  });
  console.log('Admin response:', result2.finalOutput.substring(0, 80));
}

// ============================================
// MAIN RUNNER
// ============================================

/**
 * Main function to run examples.
 * 
 * Can be called with a specific example name to run just that example,
 * or without arguments to run all examples.
 * 
 * @param exampleName - Optional name of specific example to run
 * 
 * @example
 * ```bash
 * # Run all examples
 * npx tsx examples/all-features.ts
 * 
 * # Run specific example
 * npx tsx examples/all-features.ts "basic-agent"
 * ```
 */
async function main() {
  const examples = [
    { name: 'Basic Agent', fn: example1_BasicAgent },
    { name: 'Agent with Tools', fn: example2_AgentWithTools },
    { name: 'Context Injection', fn: example3_ContextInjection },
    { name: 'Multi-Agent Handoffs', fn: example4_MultiAgentHandoffs },
    { name: 'Streaming', fn: example5_Streaming },
    { name: 'Session Management', fn: example6_SessionManagement },
    { name: 'Guardrails', fn: example7_Guardrails },
    { name: 'Structured Output', fn: example8_StructuredOutput },
    { name: 'Embeddings', fn: example9_Embeddings },
    { name: 'Image Generation', fn: example10_ImageGeneration },
    { name: 'Reranking', fn: example11_Reranking },
    { name: 'Race Agents', fn: example12_RaceAgents },
    { name: 'TOON Format', fn: example13_TOONFormat },
    { name: 'Dynamic Instructions', fn: example14_DynamicInstructions },
    { name: 'Dynamic Tool Enabling', fn: example15_DynamicToolEnabling },
  ];
  
  const exampleName = process.argv[2];
  
  if (exampleName) {
    // Run specific example
    const example = examples.find(e => 
      e.name.toLowerCase().replace(/\s+/g, '-') === exampleName.toLowerCase()
    );
    if (example) {
      await example.fn();
    } else {
      console.log(`Example "${exampleName}" not found. Available examples:`);
      examples.forEach(e => console.log(`  - ${e.name}`));
    }
  } else {
    // Run all examples
    console.log('🚀 Running all examples...\n');
    for (const example of examples) {
      try {
        await example.fn();
        await new Promise(resolve => setTimeout(resolve, 1000)); // Pause between examples
      } catch (error: unknown) {
        const err = error instanceof Error ? error : new Error(String(error));
        console.error(`❌ Error in ${example.name}:`, err.message);
      }
    }
    console.log('\n✅ All examples completed!');
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch(console.error);
}

export { main };
