# Getting Started

Get up and running with Tawk Agents SDK in minutes.

## Installation

```bash
# Clone the repository
git clone https://github.com/Manoj-tawk/tawk-agents-sdk.git
cd tawk-agents-sdk
npm install
```

Install your preferred AI provider:

```bash
# OpenAI
npm install @ai-sdk/openai

# Or Anthropic
npm install @ai-sdk/anthropic

# Or Google
npm install @ai-sdk/google
```

## Environment Setup

Create a `.env` file:

```env
OPENAI_API_KEY=sk-...
# Or
ANTHROPIC_API_KEY=sk-ant-...
# Or
GOOGLE_GENERATIVE_AI_API_KEY=...
```

## Your First Agent

Create `agent.ts`:

```typescript
import { Agent, run } from '@tawk.to/tawk-agents-sdk';
import { openai } from '@ai-sdk/openai';

const agent = new Agent({
  name: 'assistant',
  model: openai('gpt-4o'),
  instructions: 'You are a helpful assistant.'
});

async function main() {
  const result = await run(agent, 'Hello!');
  console.log(result.finalOutput);
}

main();
```

Run it:

```bash
npx ts-node agent.ts
```

## Adding Tools

Tools let your agent perform actions:

```typescript
import { Agent, run, tool } from '@tawk.to/tawk-agents-sdk';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';

const calculator = tool({
  description: 'Perform calculations',
  inputSchema: z.object({
    expression: z.string().describe('Mathematical expression to evaluate')
  }),
  execute: async ({ expression }) => {
    return { result: eval(expression) };
  }
});

const agent = new Agent({
  name: 'calculator',
  model: openai('gpt-4o'),
  instructions: 'You help users with calculations.',
  tools: { calculator }
});

const result = await run(agent, 'What is 15 + 23?');
console.log(result.finalOutput); // "The result is 38"
```

## Multi-Turn Conversations

Pass conversation history as a message array to maintain context across turns:

```typescript
import { Agent, run } from '@tawk.to/tawk-agents-sdk';
import { openai } from '@ai-sdk/openai';

const agent = new Agent({
  name: 'assistant',
  model: openai('gpt-4o'),
  instructions: 'You are a helpful assistant.'
});

// First turn
const result1 = await run(agent, 'My name is Alice');

// Multi-turn: pass conversation history as messages
const result2 = await run(agent, [
  { role: 'user' as const, content: 'My name is Alice' },
  { role: 'assistant' as const, content: result1.finalOutput },
  { role: 'user' as const, content: 'What is my name?' }
]);
console.log(result2.finalOutput); // "Your name is Alice"
```

## Streaming Responses

Get real-time responses:

```typescript
import { Agent, runStream } from '@tawk.to/tawk-agents-sdk';
import { openai } from '@ai-sdk/openai';

const agent = new Agent({
  name: 'assistant',
  model: openai('gpt-4o'),
  instructions: 'You are a helpful assistant.'
});

const stream = await runStream(agent, 'Tell me a story');

for await (const chunk of stream.textStream) {
  process.stdout.write(chunk);
}

const result = await stream.completed;
```

## Next Steps

- **[Core Concepts](../guides/CORE_CONCEPTS.md)** - Learn about agents, tools, sessions, and more
- **[Features Guide](../guides/FEATURES.md)** - Explore all available features
- **[API Reference](../reference/API.md)** - Complete API documentation
