# 📚 Advanced Features Guide

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

Hook into agent execution lifecycle for custom logic.

### Available Hooks

```typescript
class AgentHooks {
  onStart(context: any): void | Promise<void>
  onComplete(context: any, result: any): void | Promise<void>
  onError(context: any, error: Error): void | Promise<void>
  onToolCall(context: any, toolName: string, args: any): void | Promise<void>
  onToolResult(context: any, toolName: string, result: any): void | Promise<void>
}
```

### Example Usage

```typescript
import { Agent, run, AgentHooks } from '@tawk.to/tawk-agents-sdk';

class LoggingAgent extends AgentHooks {
  onStart(context: any) {
    console.log('[Agent] Starting execution');
  }

  onToolCall(context: any, toolName: string, args: any) {
    console.log(`[Tool] Calling ${toolName}`, args);
  }

  onToolResult(context: any, toolName: string, result: any) {
    console.log(`[Tool] Result from ${toolName}`, result);
  }

  onComplete(context: any, result: any) {
    console.log('[Agent] Execution complete');
  }

  onError(context: any, error: Error) {
    console.error('[Agent] Error:', error);
  }
}

const agent = new Agent({
  name: 'hooked-agent',
  model: openai('gpt-4o'),
  instructions: 'You are a helpful assistant.',
  tools: { /* your tools */ }
});

// Apply hooks
Object.setPrototypeOf(agent, LoggingAgent.prototype);

const result = await run(agent, 'Hello');
```

### Practical Example: Performance Monitoring

```typescript
class MonitoringAgent extends AgentHooks {
  private startTime: number = 0;
  private toolMetrics: Map<string, number[]> = new Map();

  onStart() {
    this.startTime = Date.now();
  }

  onToolCall(context: any, toolName: string) {
    if (!this.toolMetrics.has(toolName)) {
      this.toolMetrics.set(toolName, []);
    }
    this.toolMetrics.get(toolName)!.push(Date.now());
  }

  onToolResult(context: any, toolName: string) {
    const times = this.toolMetrics.get(toolName)!;
    const duration = Date.now() - times[times.length - 1];
    console.log(`Tool ${toolName} took ${duration}ms`);
  }

  onComplete() {
    const totalTime = Date.now() - this.startTime;
    console.log(`Total execution: ${totalTime}ms`);
    console.log('Tool usage:', Object.fromEntries(this.toolMetrics));
  }
}
```

---

## Advanced Tracing

Beyond- **Transfer-safe** - transfer markers preserved custom traces.

### Custom Trace Context

```typescript
import { withTrace, withFunctionSpan, getCurrentTrace } from '@tawk.to/tawk-agents-sdk';

await withTrace(
  {
    name: 'Custom Operation',
    userId: 'user-123',
    sessionId: 'session-456',
    metadata: { 
      environment: 'production',
      version: '1.0.0' 
    },
  },
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

### Basic Safe Execute

```typescript
import { safeExecute } from '@tawk.to/tawk-agents-sdk';

const result = await safeExecute(async () => {
  // Potentially failing operation
  const data = await riskyOperation();
  return data;
});

if (result.success) {
  console.log('Success:', result.result);
} else {
  console.error('Error:', result.error);
  console.error('Stack:', result.stack);
}
```

### With Timeout

```typescript
import { safeExecuteWithTimeout } from '@tawk.to/tawk-agents-sdk';

const result = await safeExecuteWithTimeout(
  async () => {
    return await slowDatabaseQuery();
  },
  5000 // 5 second timeout
);

if (result.success) {
  console.log('Query completed:', result.result);
} else {
  if (result.timeout) {
    console.error('Query timed out after 5s');
  } else {
    console.error('Query failed:', result.error);
  }
}
```

### In Tools

```typescript
const safeTool = tool({
  description: 'Tool with built-in error handling',
  inputSchema: z.object({ url: z.string() }),
  execute: async ({ url }) => {
    const result = await safeExecuteWithTimeout(
      async () => {
        const response = await fetch(url);
        return await response.json();
      },
      3000
    );

    if (!result.success) {
      return {
        error: true,
        message: result.timeout ? 'Request timed out' : result.error,
      };
    }

    return result.result;
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
    return backgroundResult(promise, {
      status: 'processing',
      taskId,
      estimatedTime: '5 minutes',
    });
  },
});

// Check result type
const result = await longRunningTool.execute({ taskId: '123' });

if (isBackgroundResult(result)) {
  console.log('Task started:', result.metadata);
  
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
  execute: async ({ taskId }, context) => {
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
    
    return backgroundResult(promise, {
      status: 'polling',
      progress: status.progress,
    });
  },
});
```

---

## RunState Management

Advanced state management for interruption and resumption.

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

### Checking for Interruptions

```typescript
import { needsApproval, resume } from '@tawk.to/tawk-agents-sdk';

const result = await run(agent, 'Perform action');

if (needsApproval(result)) {
  console.log('Waiting for approval...');
  
  // Wait for user approval
  const approved = await getUserApproval();
  
  if (approved) {
    // Resume execution
    const finalResult = await resume(result.state, { approved: true });
    console.log('Completed:', finalResult.finalOutput);
  }
}
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
      
      if (!result.state?.isMaxTurnsExceeded()) {
        state = result.state;
      } else {
        break;
      }
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

### Required/Optional Keys

```typescript
import type { RequireKeys, OptionalKeys } from '@tawk.to/tawk-agents-sdk';

// Require specific keys
type RequiredConfig = RequireKeys<AgentConfig, 'name' | 'model'>;

// Get only optional keys
type OnlyOptional = OptionalKeys<AgentConfig>;
```

### Key Filtering

```typescript
import type { KeysOfType } from '@tawk.to/tawk-agents-sdk';

// Get keys of specific type
type StringKeys = KeysOfType<AgentConfig, string>;
type FunctionKeys = KeysOfType<AgentConfig, Function>;
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

### Array Element Type

```typescript
import type { ArrayElement } from '@tawk.to/tawk-agents-sdk';

const tools = [tool1, tool2, tool3];

// Get element type
type Tool = ArrayElement<typeof tools>;
```

### Case Conversion

```typescript
import type { SnakeToCamelCase } from '@tawk.to/tawk-agents-sdk';

// Convert snake_case to camelCase at type level
type SnakeKeys = 'user_id' | 'first_name' | 'last_name';
type CamelKeys = SnakeToCamelCase<SnakeKeys>;
// 'userId' | 'firstName' | 'lastName'
```

---

## Complete Example

Here's a complete example using multiple advanced features:

```typescript
import {
  Agent,
  run,
  tool,
  AgentHooks,
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

// Custom monitoring hooks
class MonitoredAgent extends AgentHooks {
  onStart() {
    console.log('🚀 Agent starting');
  }

  onToolCall(context: any, toolName: string, args: any) {
    console.log(`🔧 Calling ${toolName}`, args);
  }

  onComplete(context: any, result: any) {
    console.log('✅ Agent completed');
  }
}

// Safe tool with timeout
const dataTool = tool({
  description: 'Fetch data safely',
  inputSchema: z.object({ url: z.string() }),
  execute: async ({ url }) => {
    const result = await safeExecuteWithTimeout(
      async () => {
        const response = await fetch(url);
        return await response.json();
      },
      5000
    );

    return result.success ? result.result : { error: result.error };
  },
});

// Background task tool
const processTool = tool({
  description: 'Process large dataset',
  inputSchema: z.object({ datasetId: z.string() }),
  execute: async ({ datasetId }) => {
    const promise = processLargeDataset(datasetId);
    return backgroundResult(promise, { status: 'processing', datasetId });
  },
});

// Create agent with hooks
const agent = new Agent({
  name: 'AdvancedAgent',
  model: openai('gpt-4o'),
  instructions: 'You are an advanced agent with monitoring.',
  tools: {
    fetchData: dataTool,
    processData: processTool,
  },
});

Object.setPrototypeOf(agent, MonitoredAgent.prototype);

// Execute with custom tracing
await withTrace(
  {
    name: 'Advanced Agent Run',
    userId: 'user-123',
    metadata: { feature: 'advanced-example' },
  },
  async (trace) => {
    // Build conversation
    const messages = [
      user('Fetch data from https://api.example.com/data'),
      assistant('I\'ll fetch that data for you.'),
      user('Now process dataset-123'),
    ];

    const result = await run(agent, messages);

    console.log('Final output:', result.finalOutput);

    // Check for background results
    if (result.metadata.hasBackgroundTasks) {
      console.log('Background tasks running...');
    }
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


