# Error Handling

Complete guide to error handling in Tawk Agents SDK.

---

## 📋 Table of Contents

- [Overview](#overview)
- [Error Types](#error-types)
- [Error Handling Patterns](#error-handling-patterns)
- [Recovery Strategies](#recovery-strategies)
- [Best Practices](#best-practices)
- [API Reference](#api-reference)

---

## Overview

The SDK provides comprehensive error handling with specific error types for different failure scenarios. Understanding these errors helps you build robust agent applications.

### Error Categories

1. **Execution Errors** - Max turns, timeouts
2. **Validation Errors** - Guardrails, input validation
3. **Tool Errors** - Tool execution failures
4. **Transfer Errors** (`HandoffError`) - Agent delegation failures

---

## Error Types

### MaxTurnsExceededError

Thrown when an agent exceeds the maximum number of turns.

```typescript
import { run, MaxTurnsExceededError } from '@tawk.to/tawk-agents-sdk';

try {
  const result = await run(agent, 'Complex query...', {
    maxTurns: 10
  });
} catch (error) {
  if (error instanceof MaxTurnsExceededError) {
    console.error('Agent exceeded max turns:', error.message);

    // Recovery: Increase maxTurns or simplify query
    const retry = await run(agent, 'Simplified query...', {
      maxTurns: 20
    });
  }
}
```

**Properties:**
- `message` - Error message including the max turns limit

---

### GuardrailTripwireTriggered

Thrown when a guardrail blocks input or output.

```typescript
import { run, GuardrailTripwireTriggered } from '@tawk.to/tawk-agents-sdk';

try {
  const result = await run(agent, 'User input...');
} catch (error) {
  if (error instanceof GuardrailTripwireTriggered) {
    console.error('Guardrail blocked:', error.guardrailName);
    console.error('Reason:', error.message);
    
    // Recovery: Inform user or retry with different input
    return {
      error: 'Input blocked by safety guardrail',
      reason: error.message
    };
  }
}
```

**Properties:**
- `guardrailName` - Name of the guardrail that triggered
- `message` - Reason for blocking
- `metadata` - Optional metadata from the guardrail

---

### ToolExecutionError

Thrown when a tool execution fails.

```typescript
import { run, ToolExecutionError } from '@tawk.to/tawk-agents-sdk';

try {
  const result = await run(agent, 'Use tool...');
} catch (error) {
  if (error instanceof ToolExecutionError) {
    console.error('Tool failed:', error.toolName);
    console.error('Error:', error.originalError);
    
    // Recovery: Retry tool or use fallback
    if (error.toolName === 'databaseQuery') {
      // Use cached data or fallback query
      return await useFallbackData();
    }
  }
}
```

**Properties:**
- `toolName` - Name of the tool that failed
- `originalError` - Original error from tool execution (optional)
- `message` - Error message with details

---

### HandoffError

Thrown when an agent handoff fails.

```typescript
import { run, HandoffError } from '@tawk.to/tawk-agents-sdk';

try {
  const result = await run(triageAgent, 'Query...');
} catch (error) {
  if (error instanceof HandoffError) {
    console.error('Handoff failed:', error.fromAgent, '→', error.toAgent);
    console.error('Reason:', error.message);
    
    // Recovery: Fallback to default agent or escalate
    return await run(escalationAgent, 'Query...');
  }
}
```

**Properties:**
- `fromAgent` - Name of the agent that attempted handoff (string)
- `toAgent` - Name of the target agent (string)
- `message` - Reason for handoff failure
- `originalError` - Underlying error if available

---

## Error Handling Patterns

### Pattern 1: Try-Catch with Type Guards

```typescript
import { 
  run, 
  MaxTurnsExceededError,
  GuardrailTripwireTriggered,
  ToolExecutionError 
} from '@tawk.to/tawk-agents-sdk';

try {
  const result = await run(agent, query);
  return result;
} catch (error) {
  // Handle specific error types
  if (error instanceof MaxTurnsExceededError) {
    return handleMaxTurnsError(error);
  }
  
  if (error instanceof GuardrailTripwireTriggered) {
    return handleGuardrailError(error);
  }
  
  if (error instanceof ToolExecutionError) {
    return handleToolError(error);
  }
  
  // Handle unknown errors
  console.error('Unknown error:', error);
  throw error;
}
```

### Pattern 2: Error Handler Function

```typescript
import { run } from '@tawk.to/tawk-agents-sdk';

async function runWithErrorHandling(agent, query) {
  try {
    return await run(agent, query);
  } catch (error) {
    return handleAgentError(error, agent, query);
  }
}

function handleAgentError(error, agent, query) {
  // Log error
  logger.error('Agent error', {
    agent: agent.name,
    query,
    error: error.message,
    errorType: error.constructor.name
  });
  
  // Return user-friendly error
  return {
    success: false,
    error: 'An error occurred while processing your request',
    errorType: error.constructor.name,
    canRetry: error instanceof ToolExecutionError
  };
}
```

### Pattern 3: Retry with Exponential Backoff

```typescript
import { run, ToolExecutionError } from '@tawk.to/tawk-agents-sdk';

async function runWithRetry(agent, query, maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await run(agent, query);
    } catch (error) {
      if (error instanceof ToolExecutionError && attempt < maxRetries - 1) {
        // Retry with exponential backoff
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
}
```

---

## Recovery Strategies

### Strategy 1: Fallback Agent

```typescript
import { run } from '@tawk.to/tawk-agents-sdk';

async function runWithFallback(primaryAgent, fallbackAgent, query) {
  try {
    return await run(primaryAgent, query);
  } catch (error) {
    console.warn('Primary agent failed, using fallback');
    return await run(fallbackAgent, query);
  }
}
```

### Strategy 2: Graceful Degradation

```typescript
import { run, ToolExecutionError } from '@tawk.to/tawk-agents-sdk';

try {
  const result = await run(agent, query);
  return result;
} catch (error) {
  if (error instanceof ToolExecutionError) {
    // Return partial result without tool
    return {
      success: false,
      message: 'Some features are unavailable',
      partialResult: 'Basic response without tool results'
    };
  }
  throw error;
}
```

### Strategy 3: User Notification

```typescript
import { run, GuardrailTripwireTriggered } from '@tawk.to/tawk-agents-sdk';

try {
  const result = await run(agent, userInput);
  return result;
} catch (error) {
  if (error instanceof GuardrailTripwireTriggered) {
    // Notify user
    return {
      success: false,
      message: 'Your input was blocked by safety filters',
      reason: error.message,
      suggestion: 'Please rephrase your query'
    };
  }
  throw error;
}
```

---

## Best Practices

### 1. Always Handle Errors

```typescript
// ✅ Good: Handle errors
try {
  const result = await run(agent, query);
  return result;
} catch (error) {
  return handleError(error);
}

// ❌ Bad: Let errors propagate unhandled
const result = await run(agent, query); // Could throw
```

### 2. Use Specific Error Types

```typescript
// ✅ Good: Handle specific errors
if (error instanceof MaxTurnsExceededError) {
  // Specific handling
}

// ❌ Bad: Generic error handling
catch (error) {
  // Too generic
}
```

### 3. Log Errors with Context

```typescript
catch (error) {
  logger.error('Agent execution failed', {
    agent: agent.name,
    query,
    error: error.message,
    errorType: error.constructor.name,
    stack: error.stack
  });
  throw error;
}
```

### 4. Provide User-Friendly Messages

```typescript
catch (error) {
  if (error instanceof GuardrailTripwireTriggered) {
    return {
      error: 'Your input was blocked for safety reasons',
      // Don't expose internal details
    };
  }
}
```

### 5. Implement Retry Logic

```typescript
// Retry transient errors
if (error instanceof ToolExecutionError && isTransient(error)) {
  return await retryWithBackoff(() => run(agent, query));
}
```

---

## API Reference

### Error Classes

```typescript
// Execution errors
class MaxTurnsExceededError extends Error {
  // message includes the maxTurns limit
}

// Validation errors
class GuardrailTripwireTriggered extends Error {
  guardrailName: string;
  metadata?: Record<string, any>;
}

// Tool errors
class ToolExecutionError extends Error {
  toolName: string;
  originalError?: Error;
}

// Handoff errors
class HandoffError extends Error {
  fromAgent: string;
  toAgent: string;
  originalError?: Error;
}
```

---

## Related Documentation

- [CLI Guide](./CLI.md) - Test error handling interactively
- [Core Concepts](./CORE_CONCEPTS.md) - Understanding agents
- [Features Guide](./FEATURES.md) - All SDK features
- [API Reference](../reference/API.md) - Complete API documentation
- [Flow Diagrams](../reference/FLOW_DIAGRAMS.md#4-guardrails-validation-flow) - Guardrail validation flow

---

**Status**: ✅ **Documentation Complete**



