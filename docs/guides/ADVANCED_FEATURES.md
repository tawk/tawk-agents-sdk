# Advanced Features Guide

Complete guide to advanced features in Tawk Agents SDK.

## Table of Contents

- [Message Helpers](#message-helpers)
- [Lifecycle Hooks](#lifecycle-hooks)
- [Advanced Tracing](#advanced-tracing)
- [Safe Execution](#safe-execution)
- [Background Results](#background-results)
- [RunState Management](#runstate-management)
- [TypeScript Utilities](#typescript-utilities)

---

## Message Helpers

Build and manipulate conversations programmatically.

### Creating Messages

```typescript
import { user, assistant, system, toolMessage } from '@tawk.to/tawk-agents-sdk';

const messages = [
  system('You are a helpful assistant'),
  user('Hello!'),
  assistant('Hi! How can I help?'),
  user('Tell me about AI'),
];

// Use in agent
const result = await run(agent, messages);
```

### Extracting Content

```typescript
import { getLastTextContent, filterMessagesByRole, extractAllText } from '@tawk.to/tawk-agents-sdk';

// Get last message content
const lastText = getLastTextContent(messages);
// "Tell me about AI"

// Filter by role
const userMessages = filterMessagesByRole(messages, 'user');
// [{ role: 'user', content: 'Hello!' }, { role: 'user', content: 'Tell me about AI' }]

// Extract all text
const allText = extractAllText(messages);
// "You are a helpful assistant\nHello!\nHi! How can I help?\nTell me about AI"
```

---

## Lifecycle Hooks

Hook into agent execution lifecycle for custom logic using EventEmitter events.

### Available Events

```typescript
// Agent-level events (subscribe via agent.on(...))
'agent_start'      // Emitted when agent starts execution
'agent_end'        // Emitted when agent finishes
'agent_handoff'    // Emitted when agent hands off to another agent
'agent_tool_start' // Emitted when agent starts executing a tool
'agent_tool_end'   // Emitted when agent finishes executing a tool
```

### Example Usage

```typescript
import { Agent, run } from '@tawk.to/tawk-agents-sdk';

const agent = new Agent({
  name: 'hooked-agent',
  model: openai('gpt-4o'),
  instructions: 'You are a helpful assistant.',
  tools: { /* your tools */ }
});

agent.on('agent_start', (context, agent) => {
  console.log('[Agent] Starting execution');
});

agent.on('agent_tool_start', (context, tool) => {
  console.log(`[Tool] Calling ${tool.name}`, tool.args);
});

agent.on('agent_tool_end', (context, tool, result) => {
  console.log(`[Tool] Result from ${tool.name}`, result);
});

agent.on('agent_end', (context, output) => {
  console.log('[Agent] Execution complete');
});

const result = await run(agent, 'Hello');
```

### Practical Example: Performance Monitoring

```typescript
const startTime = { value: 0 };
const toolMetrics: Map<string, number[]> = new Map();

agent.on('agent_start', () => {
  startTime.value = Date.now();
});

agent.on('agent_tool_start', (context, tool) => {
  if (!toolMetrics.has(tool.name)) {
    toolMetrics.set(tool.name, []);
  }
  toolMetrics.get(tool.name)!.push(Date.now());
});

agent.on('agent_tool_end', (context, tool) => {
  const times = toolMetrics.get(tool.name)!;
  const duration = Date.now() - times[times.length - 1];
  console.log(`Tool ${tool.name} took ${duration}ms`);
});

agent.on('agent_end', () => {
  const totalTime = Date.now() - startTime.value;
  console.log(`Total execution: ${totalTime}ms`);
  console.log('Tool usage:', Object.fromEntries(toolMetrics));
});
```

---

## Advanced Tracing

Beyond automatic tracing, you can create custom traces for complex workflows.

### Custom Trace Context

```typescript
import { withTrace, withFunctionSpan, getCurrentTrace } from '@tawk.to/tawk-agents-sdk';

await withTrace(
  'Custom Operation',
  async (trace) => {
    // Operation 1
    const result1 = await withFunctionSpan(
      trace,
      'database_query',
      { query: 'SELECT * FROM users WHERE id = ?' },
      async () => {
        return await db.query('SELECT * FROM users WHERE id = ?', [123]);
      },
      { queryType: 'read', table: 'users' }
    );

    // Operation 2
    const result2 = await withFunctionSpan(
      trace,
      'external_api',
      { endpoint: '/api/data' },
      async () => {
        return await fetch('/api/data').then(r => r.json());
      }
    );

    return { result1, result2 };
  },
  {
    userId: 'user-123',
    sessionId: 'session-456',
    metadata: {
      environment: 'production',
      version: '1.0.0'
    },
  }
);
```

### Getting Current Trace

```typescript
import { getCurrentTrace, createContextualSpan } from '@tawk.to/tawk-agents-sdk';

// Inside a tool or hook
const trace = getCurrentTrace();

if (trace) {
  const span = createContextualSpan('My Operation', {
    input: { param: 'value' },
    metadata: { custom: 'data' }
  });

  try {
    // Do work
    const result = await doWork();

    span?.end({ output: result });
  } catch (error) {
    span?.end({ output: { error: String(error) }, level: 'ERROR' });
  }
}
```

---

## Safe Execution

Error-safe execution with automatic error handling.

`SafeExecuteResult<T>` is a tuple type: `[Error | unknown | null, T | null]`.

### Basic Safe Execute

```typescript
import { safeExecute } from '@tawk.to/tawk-agents-sdk';

const [error, result] = await safeExecute(async () => {
  // Potentially failing operation
  const data = await riskyOperation();
  return data;
});

if (error) {
  console.error('Error:', error);
} else {
  console.log('Success:', result);
}
```

### With Timeout

```typescript
import { safeExecuteWithTimeout } from '@tawk.to/tawk-agents-sdk';

const [error, result] = await safeExecuteWithTimeout(
  async () => {
    return await slowDatabaseQuery();
  },
  5000 // 5 second timeout
);

if (error) {
  console.error('Query failed or timed out:', error);
} else {
  console.log('Query completed:', result);
}
```

### In Tools

```typescript
const safeTool = tool({
  description: 'Tool with built-in error handling',
  inputSchema: z.object({ url: z.string() }),
  execute: async ({ url }) => {
    const [error, data] = await safeExecuteWithTimeout(
      async () => {
        const response = await fetch(url);
        return await response.json();
      },
      3000
    );

    if (error) {
      return {
        error: true,
        message: String(error),
      };
    }

    return data;
  },
});
```

---

## Background Results

Execute long-running tasks asynchronously.

### Basic Usage

```typescript
import { backgroundResult, isBackgroundResult } from '@tawk.to/tawk-agents-sdk';

const longRunningTool = tool({
  description: 'Start a long-running task',
  inputSchema: z.object({ taskId: z.string() }),
  execute: async ({ taskId }) => {
    // Start background task
    const promise = processLargeDataset(taskId);

    // Return immediately
    return backgroundResult(promise);
  },
});

// Check result type
const result = await longRunningTool.execute({ taskId: '123' });

if (isBackgroundResult(result)) {
  console.log('Task started in background');

  // Optionally wait for completion
  const finalResult = await result.promise;
  console.log('Task completed:', finalResult);
}
```

### Polling Pattern

```typescript
const pollingTool = tool({
  description: 'Poll for task completion',
  inputSchema: z.object({ taskId: z.string() }),
  execute: async ({ taskId }) => {
    const status = await checkTaskStatus(taskId);

    if (status.completed) {
      return status.result;
    }

    // Return background result with polling
    const promise = new Promise((resolve) => {
      const interval = setInterval(async () => {
        const check = await checkTaskStatus(taskId);
        if (check.completed) {
          clearInterval(interval);
          resolve(check.result);
        }
      }, 5000);
    });

    return backgroundResult(promise);
  },
});
```

---

## RunState Management

Advanced state management for multi-step workflows.

### Saving and Resuming State

```typescript
import { run, RunState } from '@tawk.to/tawk-agents-sdk';

// Initial run
const result1 = await run(agent, 'Start complex task');

// Save state for later
if (result1.state) {
  await saveToDatabase(result1.state);
}

// Later... resume from saved state
const savedState = await loadFromDatabase();
const result2 = await run(agent, savedState);

console.log('Resumed and completed:', result2.finalOutput);
```

### Multi-Step Workflows

```typescript
class WorkflowManager {
  async executeWorkflow(steps: string[]) {
    let state: RunState | undefined;

    for (const step of steps) {
      const result = state
        ? await run(agent, state)
        : await run(agent, step);

      console.log(`Step completed: ${step}`);
      state = result.state;
    }

    return state;
  }
}
```

---

## TypeScript Utilities

Advanced type helpers for better TypeScript development.

### Type Expansion

```typescript
import type { Expand, Prettify } from '@tawk.to/tawk-agents-sdk';

// Expand complex intersection types
type ComplexType = Type1 & Type2 & Type3;
type ExpandedType = Expand<ComplexType>; // Flattened for IDE

// Prettify for better IDE hints
type Config = Prettify<AgentConfig & CustomConfig>;
```

### Partial Types

```typescript
import type { DeepPartial } from '@tawk.to/tawk-agents-sdk';

// Make all properties optional recursively
type PartialAgentConfig = DeepPartial<AgentConfig>;

const partialConfig: PartialAgentConfig = {
  name: 'test',
  // All other fields optional, even nested ones
};
```

### Promise Unwrapping

```typescript
import type { UnwrapPromise } from '@tawk.to/tawk-agents-sdk';

async function fetchData(): Promise<{ id: number; name: string }> {
  return { id: 1, name: 'test' };
}

// Extract the resolved type
type Data = UnwrapPromise<ReturnType<typeof fetchData>>;
// { id: number; name: string }
```

---

## Complete Example

Here's a complete example using multiple advanced features:

```typescript
import {
  Agent,
  run,
  tool,
  withTrace,
  safeExecuteWithTimeout,
  backgroundResult,
  isBackgroundResult,
  user,
  assistant,
  getLastTextContent,
} from '@tawk.to/tawk-agents-sdk';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';

// Safe tool with timeout
const dataTool = tool({
  description: 'Fetch data safely',
  inputSchema: z.object({ url: z.string() }),
  execute: async ({ url }) => {
    const [error, data] = await safeExecuteWithTimeout(
      async () => {
        const response = await fetch(url);
        return await response.json();
      },
      5000
    );

    return error ? { error: String(error) } : data;
  },
});

// Background task tool
const processTool = tool({
  description: 'Process large dataset',
  inputSchema: z.object({ datasetId: z.string() }),
  execute: async ({ datasetId }) => {
    const promise = processLargeDataset(datasetId);
    return backgroundResult(promise);
  },
});

// Create agent
const agent = new Agent({
  name: 'AdvancedAgent',
  model: openai('gpt-4o'),
  instructions: 'You are an advanced agent with monitoring.',
  tools: {
    fetchData: dataTool,
    processData: processTool,
  },
});

// Attach monitoring hooks
agent.on('agent_start', () => {
  console.log('Agent starting');
});

agent.on('agent_tool_start', (context, tool) => {
  console.log(`Calling ${tool.name}`, tool.args);
});

agent.on('agent_end', () => {
  console.log('Agent completed');
});

// Execute with custom tracing
await withTrace(
  'Advanced Agent Run',
  async (trace) => {
    // Build conversation
    const messages = [
      user('Fetch data from https://api.example.com/data'),
      assistant('I\'ll fetch that data for you.'),
      user('Now process dataset-123'),
    ];

    const result = await run(agent, messages);

    console.log('Final output:', result.finalOutput);
  },
  {
    userId: 'user-123',
    metadata: { feature: 'advanced-example' },
  }
);
```

---

## See Also

- [Core Concepts](../guides/CORE_CONCEPTS.md)
- [API Reference](../reference/API.md)
- [Main README](../../README.md)

---

*For more examples, see the [examples directory](../../examples).*
