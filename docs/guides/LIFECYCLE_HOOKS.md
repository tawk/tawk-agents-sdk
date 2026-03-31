# Lifecycle Hooks and Events

Complete guide to event-driven workflows using lifecycle hooks.

---

## 📋 Table of Contents

- [Overview](#overview)
- [Agent Hooks](#agent-hooks)
- [Run Hooks](#run-hooks)
- [Event Types](#event-types)
- [Usage Examples](#usage-examples)
- [Best Practices](#best-practices)
- [API Reference](#api-reference)

---

## Overview

**Lifecycle Hooks** provide an event-driven architecture for monitoring and reacting to agent execution. You can subscribe to events like agent starts, tool calls, transfers, and completions.

### When to Use

- **Monitoring**: Track agent execution in real-time
- **Logging**: Log events to external systems
- **Analytics**: Collect metrics on agent behavior
- **Debugging**: Debug agent workflows
- **Custom Logic**: Trigger custom actions on events

---

## Agent Hooks

**Agent Hooks** emit events specific to a single agent instance.

### Basic Usage

```typescript
import { Agent, run } from '@tawk.to/tawk-agents-sdk';

const agent = new Agent({
  name: 'support-agent',
  instructions: 'You help users.',
  tools: {
    // ... tools
  }
});

// Subscribe to agent events
agent.on('agent_start', (context, agent) => {
  console.log(`Agent ${agent.name} started`);
  console.log('Context:', context.context);
});

agent.on('agent_handoff', (context, nextAgent) => {
  console.log(`Handing off to ${nextAgent.name}`);
});

agent.on('agent_tool_start', (context, tool) => {
  console.log(`Tool ${tool.name} started with args:`, tool.args);
});

agent.on('agent_tool_end', (context, tool, result) => {
  console.log(`Tool ${tool.name} completed:`, result);
});

agent.on('agent_end', (context, output) => {
  console.log(`Agent finished with output:`, output);
});

// Run the agent
const result = await run(agent, 'Hello!');
```

### Available Agent Events

1. **`agent_start`** - Emitted when agent starts execution
2. **`agent_end`** - Emitted when agent finishes
3. **`agent_handoff`** - Emitted when agent hands off to another agent
4. **`agent_tool_start`** - Emitted when agent starts executing a tool
5. **`agent_tool_end`** - Emitted when agent finishes executing a tool

---

## Run Hooks

**Run Hooks** emit events for the entire run, including all agents involved.

### Basic Usage

```typescript
import { Agent, run, RunHooks } from '@tawk.to/tawk-agents-sdk';

const agent = new Agent({
  name: 'support-agent',
  instructions: 'You help users.',
  subagents: [otherAgent]
});

// Create a custom runner with hooks
class CustomRunner extends RunHooks {
  constructor() {
    super();
    
    // Subscribe to run-level events
    this.on('agent_start', (context, agent) => {
      console.log(`[RUN] Agent ${agent.name} started`);
    });

    this.on('agent_handoff', (context, fromAgent, toAgent) => {
      console.log(`[RUN] Handoff: ${fromAgent.name} → ${toAgent.name}`);
    });

    this.on('agent_tool_start', (context, agent, tool) => {
      console.log(`[RUN] ${agent.name} called ${tool.name}`);
    });
  }
}

// Note: Run hooks are used internally by the Runner class
// For custom hooks, extend RunHooks and use in your custom runner
```

### Available Run Events

1. **`agent_start`** - Emitted when any agent starts in the run
2. **`agent_end`** - Emitted when any agent ends in the run
3. **`agent_handoff`** - Emitted when a handoff occurs
4. **`agent_tool_start`** - Emitted when any tool starts
5. **`agent_tool_end`** - Emitted when any tool ends

---

## Event Types

### AgentHookEvents

```typescript
interface AgentHookEvents<TContext, TOutput> {
  agent_start: [context: RunContextWrapper<TContext>, agent: Agent<TContext, TOutput>];
  agent_end: [context: RunContextWrapper<TContext>, output: TOutput];
  agent_handoff: [context: RunContextWrapper<TContext>, nextAgent: Agent<any, any>];
  agent_tool_start: [context: RunContextWrapper<TContext>, tool: { name: string; args: any }];
  agent_tool_end: [context: RunContextWrapper<TContext>, tool: { name: string; args: any }, result: any];
}
```

### RunHookEvents

```typescript
interface RunHookEvents<TContext, TOutput> {
  agent_start: [context: RunContextWrapper<TContext>, agent: Agent<TContext, TOutput>];
  agent_end: [context: RunContextWrapper<TContext>, agent: Agent<TContext, TOutput>, output: TOutput];
  agent_handoff: [context: RunContextWrapper<TContext>, fromAgent: Agent<any, any>, toAgent: Agent<any, any>];
  agent_tool_start: [context: RunContextWrapper<TContext>, agent: Agent<TContext, TOutput>, tool: { name: string; args: any }];
  agent_tool_end: [context: RunContextWrapper<TContext>, agent: Agent<TContext, TOutput>, tool: { name: string; args: any }, result: any];
}
```

---

## Usage Examples

### Example 1: Logging Agent Execution

```typescript
import { Agent, run } from '@tawk.to/tawk-agents-sdk';

const agent = new Agent({
  name: 'support-agent',
  instructions: 'You help users.',
  tools: {
    // ... tools
  }
});

// Log all agent events
agent.on('agent_start', (context, agent) => {
  console.log(`[${new Date().toISOString()}] Agent ${agent.name} started`);
});

agent.on('agent_tool_start', (context, tool) => {
  console.log(`[${new Date().toISOString()}] Tool ${tool.name} called`);
});

agent.on('agent_tool_end', (context, tool, result) => {
  console.log(`[${new Date().toISOString()}] Tool ${tool.name} completed`);
});

agent.on('agent_end', (context, output) => {
  console.log(`[${new Date().toISOString()}] Agent finished`);
});

await run(agent, 'Hello!');
```

### Example 2: Analytics Tracking

```typescript
import { Agent, run } from '@tawk.to/tawk-agents-sdk';

const agent = new Agent({
  name: 'support-agent',
  instructions: 'You help users.',
  tools: {
    // ... tools
  }
});

// Track analytics
agent.on('agent_start', (context, agent) => {
  analytics.track('agent_started', {
    agentName: agent.name,
    userId: context.context.userId,
  });
});

agent.on('agent_tool_start', (context, tool) => {
  analytics.track('tool_called', {
    toolName: tool.name,
    agentName: agent.name,
  });
});

agent.on('agent_end', (context, output) => {
  analytics.track('agent_finished', {
    agentName: agent.name,
    outputLength: output.length,
  });
});

await run(agent, 'Hello!');
```

### Example 3: Monitoring Transfers

```typescript
import { Agent, run } from '@tawk.to/tawk-agents-sdk';

const triageAgent = new Agent({
  name: 'triage',
  instructions: 'Route queries.',
  subagents: [knowledgeAgent, actionAgent]
});

// Monitor handoffs
triageAgent.on('agent_handoff', (context, nextAgent) => {
  console.log(`Triage routing to: ${nextAgent.name}`);

  // Log to monitoring system
  monitoring.logTransfer({
    from: 'triage',
    to: nextAgent.name,
    timestamp: Date.now(),
  });
});

await run(triageAgent, 'What is the weather?');
```

### Example 4: Custom Event Handling

```typescript
import { Agent, run } from '@tawk.to/tawk-agents-sdk';

const agent = new Agent({
  name: 'support-agent',
  instructions: 'You help users.',
  tools: {
    sendEmail: tool({
      description: 'Send an email',
      inputSchema: z.object({ to: z.string(), subject: z.string() }),
      execute: async ({ to, subject }) => {
        // Send email
        return { success: true };
      }
    })
  }
});

// Custom handler for email tool
agent.on('agent_tool_start', (context, tool) => {
  if (tool.name === 'sendEmail') {
    // Require additional approval for emails
    console.log('⚠️  Email tool called - requiring approval');
    // Could pause execution here for approval
  }
});

agent.on('agent_tool_end', (context, tool, result) => {
  if (tool.name === 'sendEmail' && result.success) {
    // Log email sent
    emailLog.log({
      to: tool.args.to,
      subject: tool.args.subject,
      timestamp: Date.now(),
    });
  }
});

await run(agent, 'Send an email to user@example.com');
```

---

## Best Practices

### 1. Use Type-Safe Event Handlers

```typescript
// ✅ Good: Type-safe handler
agent.on('agent_start', (context, agent) => {
  // TypeScript knows the types
  console.log(agent.name);
});

// ❌ Bad: Untyped handler
agent.on('agent_start', (...args: any[]) => {
  // No type safety
});
```

### 2. Clean Up Event Listeners

```typescript
const handler = (context, agent) => {
  console.log(`Agent ${agent.name} started`);
};

agent.on('agent_start', handler);

// Later, remove listener
agent.off('agent_start', handler);
```

### 3. Handle Errors in Event Handlers

```typescript
agent.on('agent_tool_end', (context, tool, result) => {
  try {
    // Your logic
    analytics.track('tool_completed', { tool: tool.name });
  } catch (error) {
    // Don't let event handler errors break execution
    console.error('Analytics error:', error);
  }
});
```

### 4. Use Once for One-Time Events

```typescript
// Listen only once
agent.once('agent_start', (context, agent) => {
  console.log('First agent start');
});
```

### 5. Combine with Langfuse Tracing

```typescript
import { withTrace } from '@tawk.to/tawk-agents-sdk';

const agent = new Agent({
  name: 'support-agent',
  instructions: 'You help users.'
});

agent.on('agent_start', (context, agent) => {
  // Create trace span
  const trace = getCurrentTrace();
  if (trace) {
    trace.span({
      name: `Agent: ${agent.name}`,
      input: context.messages,
    });
  }
});

await withTrace('Support Request', async (trace) => {
  return await run(agent, 'Hello!');
});
```

---

## API Reference

### AgentHooks

```typescript
class AgentHooks<TContext, TOutput> extends EventEmitter {
  // Convenience registration methods
  onStart(handler: (context, agent) => void): this;
  onEnd(handler: (context, output) => void): this;
  onHandoff(handler: (context, nextAgent) => void): this;
  onToolStart(handler: (context, tool) => void): this;
  onToolEnd(handler: (context, tool, result) => void): this;

  // Standard EventEmitter methods
  on(event: string, handler: Function): this;
  once(event: string, handler: Function): this;
  off(event: string, handler: Function): this;
  emit(event: string, ...args: any[]): boolean;
}
```

### RunHooks

```typescript
class RunHooks<TContext, TOutput> extends EventEmitter {
  // Convenience registration methods
  onAgentStart(handler: (context, agent) => void): this;
  onAgentEnd(handler: (context, agent, output) => void): this;
  onAgentHandoff(handler: (context, fromAgent, toAgent) => void): this;
  onToolStart(handler: (context, agent, tool) => void): this;
  onToolEnd(handler: (context, agent, tool, result) => void): this;

  // Standard EventEmitter methods
  on(event: string, handler: Function): this;
  once(event: string, handler: Function): this;
  off(event: string, handler: Function): this;
  emit(event: string, ...args: any[]): boolean;
}
```

---

## Related Documentation

- [Core Concepts](./CORE_CONCEPTS.md) - Understanding agents
- [Features Guide](./FEATURES.md) - All SDK features
- [API Reference](../reference/API.md) - Complete API documentation
- [Tracing Guide](./TRACING.md) - Advanced tracing patterns

---

**Status**: ✅ **Documentation Complete**






