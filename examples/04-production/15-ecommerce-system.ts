/**
 * Complete Examples for tawk AI SDK Agents
 *
 * Demonstrates all features with production-ready patterns
 */

import 'dotenv/config';
import {
  Agent,
  run,
  runStream,
  tool,
  contentSafetyGuardrail,
  piiDetectionGuardrail,
  lengthGuardrail,
  customGuardrail,
} from '../../src';
import { openai } from '@ai-sdk/openai';
import { anthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';

// ============================================
// EXAMPLE 1: Basic Agent with Tools
// ============================================

async function basicAgentExample() {
  // Create tools
  const weatherTool = tool({
    description: 'Get weather for a city',
    inputSchema: z.object({
      city: z.string()
    }),
    execute: async ({ city }) => {
      // Simulate API call
      return {
        city,
        temperature: 72,
        conditions: 'Sunny'
      };
    }
  });

  // Create agent
  const agent = new Agent({
    name: 'Weather Agent',
    model: openai('gpt-4o'),
    instructions: 'You help with weather queries',
    tools: {
      get_weather: weatherTool
    }
  });

  // Run agent
  const result = await run(agent, 'What is the weather in New York?');
  console.log(result.finalOutput);
}

// ============================================
// EXAMPLE 2: Multi-Provider Support
// ============================================

async function multiProviderExample() {
  // Create agents with different providers
  const openaiAgent = new Agent({
    name: 'OpenAI Agent',
    model: openai('gpt-4o'),
    instructions: 'You are an OpenAI agent'
  });

  const anthropicAgent = new Agent({
    name: 'Claude Agent',
    model: anthropic('claude-3-5-sonnet-20241022'),
    instructions: 'You are a Claude agent'
  });

  // Use them interchangeably
  const result1 = await run(openaiAgent, 'Hello');
  const result2 = await run(anthropicAgent, 'Hello');

  console.log('OpenAI:', result1.finalOutput);
  console.log('Claude:', result2.finalOutput);
}

// ============================================
// EXAMPLE 3: Context Management
// ============================================

interface ShoppingContext {
  userId: string;
  cart: Array<{ productId: string; quantity: number }>;
  db: any;
}

async function contextExample() {
  // Create tools with context
  const addToCartTool = tool({
    description: 'Add item to shopping cart',
    inputSchema: z.object({
      productId: z.string(),
      quantity: z.number().default(1)
    }),
    execute: async ({ productId, quantity }, context: ShoppingContext) => {
      // Access context
      context.cart.push({ productId, quantity });

      // Save to database
      await context.db.carts.updateOne(
        { userId: context.userId },
        { $set: { items: context.cart } }
      );

      return {
        success: true,
        cart: context.cart
      };
    }
  });

  const viewCartTool = tool({
    description: 'View shopping cart',
    inputSchema: z.object({}),
    execute: async ({}, context: ShoppingContext) => {
      return {
        items: context.cart,
        total: context.cart.length
      };
    }
  });

  // Create agent
  const agent = new Agent<ShoppingContext>({
    name: 'Shopping Agent',
    model: openai('gpt-4o'),
    instructions: 'You help with online shopping',
    tools: {
      add_to_cart: addToCartTool,
      view_cart: viewCartTool
    }
  });

  // Create context
  const context: ShoppingContext = {
    userId: 'user-123',
    cart: [],
    db: {} // Your database instance
  };

  // Run with context
  const result = await run(agent, 'Add product-456 to cart', { context });
  console.log(result.finalOutput);
}

// ============================================
// EXAMPLE 4: Multi-turn Conversation
// ============================================

async function multiTurnExample() {
  const agent = new Agent({
    name: 'Assistant',
    model: openai('gpt-4o'),
    instructions: 'You are a helpful assistant'
  });

  // First message
  const result1 = await run(agent, 'My name is John');

  // Second message - pass conversation history
  const result2 = await run(agent, [
    { role: 'user' as const, content: 'My name is John' },
    { role: 'assistant' as const, content: result1.finalOutput },
    { role: 'user' as const, content: 'What is my name?' }
  ]);
  console.log(result2.finalOutput); // "Your name is John"
}

// ============================================
// EXAMPLE 5: Agent Handoffs
// ============================================

async function handoffsExample() {
  // Create specialized agents
  const productAgent = new Agent({
    name: 'Product Agent',
    instructions: 'You help with product searches',
    model: openai('gpt-4o'),
    tools: {
      search_products: tool({
        description: 'Search for products',
        inputSchema: z.object({ query: z.string() }),
        execute: async ({ query }) => {
          return {
            products: [
              { id: '1', name: 'Laptop', price: 999 },
              { id: '2', name: 'Mouse', price: 29 }
            ]
          };
        }
      })
    }
  });

  const billingAgent = new Agent({
    name: 'Billing Agent',
    instructions: 'You handle billing questions',
    model: anthropic('claude-3-5-sonnet-20241022'),
    tools: {
      get_invoice: tool({
        description: 'Get invoice details',
        inputSchema: z.object({ invoiceId: z.string() }),
        execute: async ({ invoiceId }) => {
          return {
            invoiceId,
            amount: 1028,
            status: 'paid'
          };
        }
      })
    }
  });

  // Create main agent with transfers
  const mainAgent = new Agent({
    name: 'Main Agent',
    model: openai('gpt-4o'),
    instructions: `
      You are the main customer service agent.
      When users ask about products, transfer to Product Agent.
      When users ask about billing, transfer to Billing Agent.
    `,
    subagents: [productAgent, billingAgent]
  });

  // Run - will automatically transfer
  const result = await run(mainAgent, 'Show me laptops');
  console.log(result.finalOutput);
}

// ============================================
// EXAMPLE 6: Agent as Tool Pattern
// ============================================

async function agentAsToolExample() {
  // Create specialized agents
  const researchAgent = new Agent({
    name: 'Research Agent',
    model: openai('gpt-4o'),
    instructions: 'You research topics thoroughly',
    tools: {
      web_search: tool({
        description: 'Search the web',
        inputSchema: z.object({ query: z.string() }),
        execute: async ({ query }) => {
          return { results: ['Result 1', 'Result 2'] };
        }
      })
    }
  });

  const analysisAgent = new Agent({
    name: 'Analysis Agent',
    model: openai('gpt-4o'),
    instructions: 'You analyze data',
    tools: {
      analyze: tool({
        description: 'Analyze data',
        inputSchema: z.object({ data: z.string() }),
        execute: async ({ data }) => {
          return { insights: ['Insight 1', 'Insight 2'] };
        }
      })
    }
  });

  // Create main agent that uses other agents as tools
  const orchestrator = new Agent({
    name: 'Orchestrator',
    model: openai('gpt-4o'),
    instructions: 'You coordinate specialized agents',
    tools: {
      research_agent: researchAgent.asTool({
        toolName: 'research',
        toolDescription: 'Research a topic'
      }),
      analysis_agent: analysisAgent.asTool({
        toolName: 'analyze',
        toolDescription: 'Analyze information'
      })
    }
  });

  const result = await run(orchestrator, 'Research AI trends and analyze them');
  console.log(result.finalOutput);
}

// ============================================
// EXAMPLE 7: Guardrails
// ============================================

async function guardrailsExample() {
  // Create agent with guardrails
  const agent = new Agent({
    name: 'Safe Agent',
    model: openai('gpt-4o'),
    instructions: 'You are a helpful assistant',
    guardrails: [
      // Content safety on input
      contentSafetyGuardrail({
        type: 'input',
        model: openai('gpt-4o-mini')
      }),

      // PII detection on output
      piiDetectionGuardrail({
        type: 'output',
        block: true
      }),

      // Length check on output
      lengthGuardrail({
        type: 'output',
        maxLength: 500,
        unit: 'words'
      }),

      // Custom guardrail
      customGuardrail({
        name: 'no_code',
        type: 'output',
        validate: async (content) => {
          if (content.includes('```')) {
            return {
              passed: false,
              message: 'Code blocks not allowed'
            };
          }
          return { passed: true };
        }
      })
    ]
  });

  try {
    const result = await run(agent, 'Tell me about yourself');
    console.log(result.finalOutput);
  } catch (error: any) {
    console.error('Guardrail failed:', error.message);
  }
}

// ============================================
// EXAMPLE 8: Streaming
// ============================================

async function streamingExample() {
  const agent = new Agent({
    name: 'Story Agent',
    model: openai('gpt-4o'),
    instructions: 'You write engaging stories'
  });

  // Stream response
  const stream = await runStream(agent, 'Tell me a short story about a robot');

  // Stream text chunks
  for await (const chunk of stream.textStream) {
    process.stdout.write(chunk);
  }

  // Or stream with full events
  for await (const event of stream.fullStream) {
    if (event.type === 'text-delta' && event.textDelta) {
      process.stdout.write(event.textDelta);
    } else if (event.type === 'tool-call') {
      console.log('\nCalling tool:', (event as any).toolCall?.toolName);
    }
  }

  // Wait for completion
  const result = await stream.completed;
  console.log('\n\nFinal:', result.finalOutput);
}

// ============================================
// EXAMPLE 9: Dynamic Instructions
// ============================================

async function dynamicInstructionsExample() {
  interface UserContext {
    userName: string;
    preferences: {
      tone: 'formal' | 'casual';
      language: string;
    };
  }

  const agent = new Agent<UserContext>({
    name: 'Adaptive Agent',
    model: openai('gpt-4o'),
    instructions: (context) => {
      return `
        You are a helpful assistant.
        The user's name is ${context.context.userName}.
        Speak in a ${context.context.preferences.tone} tone.
        Respond in ${context.context.preferences.language}.
      `;
    }
  });

  const context: UserContext = {
    userName: 'Alice',
    preferences: {
      tone: 'casual',
      language: 'English'
    }
  };

  const result = await run(agent, 'Hello!', { context });
  console.log(result.finalOutput);
}

// ============================================
// EXAMPLE 10: Structured Output
// ============================================

async function structuredOutputExample() {
  // Define output schema
  const productSchema = z.object({
    name: z.string(),
    price: z.number(),
    category: z.string(),
    inStock: z.boolean(),
    features: z.array(z.string())
  });

  type Product = z.infer<typeof productSchema>;

  // Create agent with output schema
  const agent = new Agent<any, Product>({
    name: 'Product Agent',
    model: openai('gpt-4o'),
    instructions: 'Extract product information from user query',
    output: { schema: productSchema }
  });

  const result = await run(agent, 'A wireless mouse for $29.99 that has Bluetooth and rechargeable battery');

  // result.finalOutput is now typed as Product
  console.log('Product:', result.finalOutput);
  console.log('Price:', result.finalOutput.price);
}

// ============================================
// EXAMPLE 11: Complete E-commerce System
// ============================================

interface EcommerceContext {
  userId: string;
  sessionId: string;
  cart: Array<{ productId: string; name: string; price: number; quantity: number }>;
  db: any;
}

async function completeEcommerceExample() {
  // Create specialized agents
  const productAgent = new Agent<EcommerceContext>({
    name: 'Product Agent',
    instructions: 'You help customers find products',
    model: openai('gpt-4o'),
    tools: {
      search_products: tool({
        description: 'Search for products',
        inputSchema: z.object({ query: z.string() }),
        execute: async ({ query }) => {
          return { products: [] };
        }
      })
    }
  });

  const cartAgent = new Agent<EcommerceContext>({
    name: 'Cart Agent',
    instructions: 'You manage the shopping cart',
    model: openai('gpt-4o'),
    tools: {
      add_to_cart: tool({
        description: 'Add to cart',
        inputSchema: z.object({
          productId: z.string(),
          quantity: z.number()
        }),
        execute: async ({ productId, quantity }) => {
          return { success: true };
        }
      }),
      view_cart: tool({
        description: 'View cart',
        inputSchema: z.object({}),
        execute: async () => {
          return { items: [] };
        }
      })
    }
  });

  const checkoutAgent = new Agent<EcommerceContext>({
    name: 'Checkout Agent',
    instructions: 'You handle payment and checkout',
    model: anthropic('claude-3-5-sonnet-20241022'),
    tools: {
      checkout: tool({
        description: 'Process checkout',
        inputSchema: z.object({
          paymentMethod: z.enum(['credit_card', 'paypal'])
        }),
        execute: async ({ paymentMethod }) => {
          return { success: true, orderId: 'order-123' };
        }
      })
    },
    guardrails: [
      customGuardrail({
        name: 'verify_cart',
        type: 'input',
        validate: async (content, ctx) => {
          if (ctx.context.cart.length === 0) {
            return {
              passed: false,
              message: 'Cart is empty'
            };
          }
          return { passed: true };
        }
      })
    ]
  });

  // Create main agent with transfers
  const mainAgent = new Agent<EcommerceContext>({
    name: 'Customer Service',
    model: openai('gpt-4o'),
    instructions: `
      You are a customer service agent for an e-commerce store.
      Help customers find products, manage their cart, and checkout.
      - For product searches, transfer to Product Agent
      - For cart operations, transfer to Cart Agent
      - For checkout, transfer to Checkout Agent
    `,
    subagents: [productAgent, cartAgent, checkoutAgent]
  });

  // Create context
  const context: EcommerceContext = {
    userId: 'user-123',
    sessionId: 'session-456',
    cart: [],
    db: {}
  };

  // Run conversation
  console.log('=== E-commerce Agent Demo ===\n');

  // First query
  let result = await run(mainAgent, 'Show me laptops', { context });
  console.log('User: Show me laptops');
  console.log('Agent:', result.finalOutput, '\n');

  // Second query - pass previous conversation history
  result = await run(mainAgent, [
    { role: 'user' as const, content: 'Show me laptops' },
    { role: 'assistant' as const, content: result.finalOutput },
    { role: 'user' as const, content: 'Add the first one to my cart' }
  ], { context });
  console.log('User: Add the first one to my cart');
  console.log('Agent:', result.finalOutput, '\n');

  // Third query
  result = await run(mainAgent, 'What\'s in my cart?', { context });
  console.log('User: What\'s in my cart?');
  console.log('Agent:', result.finalOutput, '\n');

  // Fourth query
  result = await run(mainAgent, 'Checkout with credit card', { context });
  console.log('User: Checkout with credit card');
  console.log('Agent:', result.finalOutput, '\n');
}

// ============================================
// RUN ALL EXAMPLES
// ============================================

async function main() {
  console.log('Running examples...\n');

  try {
    // Uncomment to run specific examples
    // await basicAgentExample();
    // await multiProviderExample();
    // await contextExample();
    // await multiTurnExample();
    // await handoffsExample();
    // await agentAsToolExample();
    // await guardrailsExample();
    // await streamingExample();
    // await dynamicInstructionsExample();
    // await structuredOutputExample();
    await completeEcommerceExample();
  } catch (error) {
    console.error('Error:', error);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

export { main };
