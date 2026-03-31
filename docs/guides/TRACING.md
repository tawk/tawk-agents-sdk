# Tracing and Observability

Complete guide to tracing agent execution with Langfuse.

---

## 📋 Table of Contents

- [Overview](#overview)
- [Automatic Tracing (You Don't Need to Do Anything!)](#automatic-tracing-you-dont-need-to-do-anything)
- [When You Need Manual Tracing](#when-you-need-manual-tracing)
- [Langfuse Integration](#langfuse-integration)
- [Advanced: Manual Tracing Utilities](#advanced-manual-tracing-utilities)
- [Best Practices](#best-practices)

---

## Overview

**Tracing is automatic!** When you run an agent, it automatically creates traces, spans, and tracks everything. You only need manual tracing utilities for advanced use cases.

---

## Automatic Tracing (You Don't Need to Do Anything!)

**For 99% of use cases, tracing just works automatically.**

```typescript
import { Agent, run } from '@tawk.to/tawk-agents-sdk';

const agent = new Agent({
  name: 'support-agent',
  instructions: 'You help users.'
});

// That's it! Tracing happens automatically
const result = await run(agent, 'Hello!');

// View traces in the Langfuse dashboard
```

### What Gets Traced Automatically

When you call `run(agent, input)`, the SDK automatically:

1. ✅ **Creates a trace** - One trace per `run()` call
2. ✅ **Creates agent spans** - One span per agent (handles transfers automatically)
3. ✅ **Creates generation spans** - One span per LLM call
4. ✅ **Tracks tool calls** - All tool executions are logged
5. ✅ **Tracks token usage** - Input/output tokens for each generation
6. ✅ **Tracks transfers** - When agents delegate to other agents

**You don't need to do anything!** Just set your Langfuse credentials:

```bash
# .env
LANGFUSE_PUBLIC_KEY=pk-xxx
LANGFUSE_SECRET_KEY=sk-xxx
```

---

## When You Need Manual Tracing

You only need manual tracing utilities (`withTrace`, `createContextualSpan`, etc.) in these **rare cases**:

### Case 1: Group Multiple Agent Calls in One Trace

If you want to trace multiple agent calls as part of one workflow:

```typescript
import { withTrace, run } from '@tawk.to/tawk-agents-sdk';

// Wrap multiple operations in ONE trace
await withTrace('Customer Support Workflow', async (trace) => {
  // All these agent calls share the same trace
  const triage = await run(triageAgent, query);
  const knowledge = await run(knowledgeAgent, triage.finalOutput);
  const action = await run(actionAgent, knowledge.finalOutput);
  
  return action;
}, {
  metadata: { workflow: 'support', userId: '123' }
});
```

**Without `withTrace`**: Each `run()` creates its own separate trace.  
**With `withTrace`**: All `run()` calls share one trace.

### Case 2: Trace Your Own Code (Not Just Agents)

If you want to trace custom code alongside agents:

```typescript
import { withTrace, createContextualSpan, run } from '@tawk.to/tawk-agents-sdk';

await withTrace('Complete Workflow', async (trace) => {
  // Trace custom database query
  const dbSpan = createContextualSpan('Database Query', {
    input: { query: 'SELECT * FROM users' }
  });
  const users = await db.query('SELECT * FROM users');
  dbSpan?.end({ output: { count: users.length } });
  
  // Trace agent call (automatic)
  const result = await run(agent, 'Process users');
  
  return result;
});
```

### Case 3: Custom Trace Metadata

If you want to add custom metadata to the trace:

```typescript
import { withTrace, run } from '@tawk.to/tawk-agents-sdk';

await withTrace('User Request', async (trace) => {
  return await run(agent, query);
}, {
  metadata: {
    userId: '123',
    source: 'web',
    environment: 'production'
  },
  tags: ['customer-support', 'urgent'],
  sessionId: 'session-123',
  userId: 'user-123'
});
```

---

## Langfuse Integration

### Setup

```bash
# .env
LANGFUSE_PUBLIC_KEY=pk-xxx
LANGFUSE_SECRET_KEY=sk-xxx
LANGFUSE_BASE_URL=https://cloud.langfuse.com  # Optional, defaults to cloud
```

### Automatic Tracing

**That's it!** No code needed. Tracing works automatically when you run agents.

```typescript
import { Agent, run } from '@tawk.to/tawk-agents-sdk';

const agent = new Agent({
  name: 'support-agent',
  instructions: 'You help users.'
});

// Tracing works automatically!
const result = await run(agent, 'Hello!');
```

### Manual Langfuse Initialization (Rare)

Only needed if you want custom Langfuse configuration:

```typescript
import { initLangfuse } from '@tawk.to/tawk-agents-sdk';

initLangfuse({
  publicKey: process.env.LANGFUSE_PUBLIC_KEY!,
  secretKey: process.env.LANGFUSE_SECRET_KEY!,
  baseUrl: 'https://custom.langfuse.com',
});
```

---

## Advanced: Manual Tracing Utilities

**⚠️ Only use these if you need the advanced cases above!**

### withTrace

Wrap multiple operations in one trace:

```typescript
import { withTrace } from '@tawk.to/tawk-agents-sdk';

await withTrace('Workflow Name', async (trace) => {
  // Your code here
  return result;
}, {
  input: { userId: '123' },
  metadata: { source: 'web' },
  tags: ['production']
});
```

### createContextualSpan

Create custom spans in your code:

```typescript
import { createContextualSpan } from '@tawk.to/tawk-agents-sdk';

const span = createContextualSpan('Custom Operation', {
  input: { data: 'value' }
});

try {
  await doSomething();
  span?.end({ output: { result: 'success' } });
} catch (error) {
  span?.end({ output: { error: error.message }, level: 'ERROR' });
}
```

### Context Functions

Get current trace/span from context:

```typescript
import { getCurrentTrace, getCurrentSpan } from '@tawk.to/tawk-agents-sdk';

const trace = getCurrentTrace();
const span = getCurrentSpan();
```

---

## Best Practices

### ✅ DO: Use Automatic Tracing (Default)

```typescript
// ✅ Good: Just run the agent
const result = await run(agent, query);
// Tracing happens automatically!
```

### ❌ DON'T: Overcomplicate It

```typescript
// ❌ Bad: Unnecessary wrapping
await withTrace('Agent Run', async (trace) => {
  return await run(agent, query); // Agent already creates its own trace!
});
```

### ✅ DO: Use withTrace for Multiple Operations

```typescript
// ✅ Good: Group multiple operations
await withTrace('Workflow', async (trace) => {
  const step1 = await run(agent1, input);
  const step2 = await run(agent2, step1.finalOutput);
  return step2;
});
```

### ✅ DO: Use Custom Spans for Non-Agent Code

```typescript
// ✅ Good: Trace your own code
await withTrace('Complete Workflow', async (trace) => {
  const dbSpan = createContextualSpan('Database Query');
  const data = await db.query('...');
  dbSpan?.end({ output: data });

  const result = await run(agent, data);
  return result;
});
```

---

## Summary

| Use Case | What to Use |
|----------|-------------|
| **Single agent call** | Just `run(agent, input)` - automatic! |
| **Multiple agent calls in one workflow** | `withTrace()` to group them |
| **Tracing your own code** | `createContextualSpan()` |
| **Custom metadata** | `withTrace()` with metadata options |

**Remember**: For most use cases, you don't need any manual tracing utilities. Just run your agents and tracing works automatically!

---

## Related Documentation

- [CLI Guide](./CLI.md) - Test tracing interactively with verbose mode
- [Features Guide](./FEATURES.md) - All SDK features
- [API Reference](../reference/API.md) - Complete API documentation
- [Lifecycle Hooks](./LIFECYCLE_HOOKS.md) - Event-driven workflows

---

**Status**: ✅ **Documentation Complete**
