# Human-in-the-Loop: RunState and Approvals

Complete guide to implementing human-in-the-loop workflows with RunState (pause/resume) and Approvals.

---

## 📋 Table of Contents

- [Overview](#overview)
- [RunState: Pause and Resume](#runstate-pause-and-resume)
- [Approvals: Request Human Approval](#approvals-request-human-approval)
- [Complete Examples](#complete-examples)
- [Best Practices](#best-practices)
- [API Reference](#api-reference)

---

## Overview

**Human-in-the-Loop** workflows allow you to:

1. **Pause agent execution** before executing sensitive operations
2. **Request human approval** for dangerous or costly actions
3. **Resume execution** after approval/rejection
4. **Maintain context** across pauses

### When to Use

- **Dangerous Operations**: Delete files, modify databases, send emails
- **Costly Operations**: Expensive API calls, long-running processes
- **Compliance**: Operations requiring audit trails
- **Security**: Sensitive operations needing verification

---

## RunState: Pause and Resume

### What is RunState?

**RunState** is a snapshot of an agent's execution state that allows you to pause and resume execution. It contains:

- Current agent
- Conversation messages
- Execution context
- Step number
- Pending approvals (optional)

### Basic Usage

```typescript
import { Agent, run } from '@tawk.to/tawk-agents-sdk';

const agent = new Agent({
  name: 'file-manager',
  instructions: 'You manage files.',
  tools: {
    deleteFile: tool({
      description: 'Delete a file',
      inputSchema: z.object({
        path: z.string().describe('Path to file')
      }),
      execute: async ({ path }) => {
        // Tool execution
        return { success: true, path };
      }
    })
  }
});

// Start execution
const result = await run(agent, 'Delete /tmp/file.txt');

// If execution pauses (e.g., for approval), result.state contains RunState
if (result.state) {
  console.log('Execution paused at step:', result.state.stepNumber);
  console.log('Pending approvals:', result.state.pendingApprovals);
  
  // Update approvals
  result.state.pendingApprovals[0].approved = true;
  
  // Resume execution
  const finalResult = await run(agent, result.state);
  console.log('Final result:', finalResult.finalOutput);
}
```

### RunState Interface

```typescript
interface RunState {
  agent: Agent<any, any>;        // The agent that was running
  messages: ModelMessage[];      // Current conversation history
  context: any;                  // Execution context
  stepNumber: number;            // Current step number
  pendingApprovals?: Array<{     // Optional: pending approvals
    toolName: string;
    args: any;
    approved: boolean;
  }>;
}
```

### Resuming Execution

The `run()` function accepts three types of input:

```typescript
// 1. String input (normal run)
await run(agent, 'Hello!');

// 2. Messages array (normal run with history)
await run(agent, [{ role: 'user', content: 'Hello!' }]);

// 3. RunState (resume paused run) ⭐
await run(agent, runState);
```

When you pass a `RunState`, execution resumes from the saved step with the same context and messages.

---

## Approvals: Request Human Approval

### What is the Approval System?

The **approval system** intercepts tool calls and requests human approval before execution. This ensures dangerous or costly operations are verified before running.

### Components

1. **ApprovalManager** - Manages approval requests and responses
2. **ApprovalConfig** - Configures which tools need approval
3. **Approval Handlers** - Handle approval requests (CLI, webhook, etc.)

### Basic Usage

```typescript
import { ApprovalManager, createCLIApprovalHandler } from '@tawk.to/tawk-agents-sdk';

const approvalManager = new ApprovalManager();
const approvalHandler = createCLIApprovalHandler();

const agent = new Agent({
  name: 'file-manager',
  instructions: 'You manage files.',
  tools: {
    deleteFile: tool({
      description: 'Delete a file (requires approval)',
      inputSchema: z.object({
        path: z.string().describe('Path to file')
      }),
      execute: async ({ path }, context) => {
        // Check if approval is required
        const config = {
          requiredForTools: ['deleteFile'],
          requestApproval: approvalHandler,
          timeout: 300000 // 5 minutes
        };

        if (approvalManager.requiresApproval('deleteFile', config)) {
          // Request approval
          const response = await approvalManager.requestApproval(
            'deleteFile',
            { path },
            config
          );

          if (!response.approved) {
            throw new Error(`Deletion rejected: ${response.reason}`);
          }
        }

        // Execute deletion (approved)
        return { success: true, path };
      }
    })
  }
});
```

### Approval Configuration

```typescript
interface ApprovalConfig {
  requiredForTools?: string[];        // Tools that require approval
  requestApproval: (                  // Handler function
    toolName: string,
    args: any
  ) => Promise<ApprovalResponse>;
  timeout?: number;                   // Timeout in ms (default: 5 minutes)
}

interface ApprovalResponse {
  approved: boolean;
  reason?: string;
}
```

### Built-in Approval Handlers

#### 1. CLI Handler (Terminal Prompt)

```typescript
import { createCLIApprovalHandler } from '@tawk.to/tawk-agents-sdk';

const handler = createCLIApprovalHandler();
// Prompts user in terminal: "Approve? (y/n)"
```

#### 2. Webhook Handler (External API)

```typescript
import { createWebhookApprovalHandler } from '@tawk.to/tawk-agents-sdk';

const handler = createWebhookApprovalHandler(
  'https://api.example.com/approve',
  'api-key'
);
// Sends POST request to webhook, waits for response
```

#### 3. Auto-Approve (Testing)

```typescript
import { createAutoApproveHandler } from '@tawk.to/tawk-agents-sdk';

const handler = createAutoApproveHandler();
// Always approves (for testing)
```

#### 4. Auto-Reject (Testing)

```typescript
import { createAutoRejectHandler } from '@tawk.to/tawk-agents-sdk';

const handler = createAutoRejectHandler();
// Always rejects (for testing)
```

---

## Complete Examples

### Example 1: File Deletion with CLI Approval

```typescript
import { Agent, run, tool } from '@tawk.to/tawk-agents-sdk';
import { z } from 'zod';
import { 
  ApprovalManager, 
  createCLIApprovalHandler 
} from '@tawk.to/tawk-agents-sdk';

const approvalManager = new ApprovalManager();
const approvalHandler = createCLIApprovalHandler();

const agent = new Agent({
  name: 'file-manager',
  instructions: 'You manage files. When asked to delete, use the deleteFile tool.',
  tools: {
    deleteFile: tool({
      description: 'Delete a file (requires approval)',
      inputSchema: z.object({
        path: z.string().describe('Path to file to delete')
      }),
      execute: async ({ path }, context) => {
        const config = {
          requiredForTools: ['deleteFile'],
          requestApproval: approvalHandler,
          timeout: 300000
        };

        if (approvalManager.requiresApproval('deleteFile', config)) {
          const response = await approvalManager.requestApproval(
            'deleteFile',
            { path },
            config
          );

          if (!response.approved) {
            throw new Error(`Deletion rejected: ${response.reason}`);
          }
        }

        // Simulate deletion
        console.log(`Deleting file: ${path}`);
        return { success: true, path, deleted: true };
      }
    })
  }
});

const result = await run(agent, 'Delete /tmp/important.txt');
console.log(result.finalOutput);
```

### Example 2: Webhook-Based Approval

```typescript
import { createWebhookApprovalHandler } from '@tawk.to/tawk-agents-sdk';

// Create webhook handler
const webhookHandler = createWebhookApprovalHandler(
  'https://your-api.com/approve',
  process.env.APPROVAL_API_KEY
);

// Use in approval config
const config = {
  requiredForTools: ['deleteFile', 'sendEmail', 'modifyDatabase'],
  requestApproval: webhookHandler,
  timeout: 600000 // 10 minutes
};

// Your API endpoint receives:
// POST /approve
// {
//   "toolName": "deleteFile",
//   "args": { "path": "/tmp/file.txt" },
//   "timestamp": 1234567890
// }
//
// And responds with:
// {
//   "approved": true,
//   "reason": "Approved by admin"
// }
```

### Example 3: Multi-Step Approval Workflow

```typescript
const approvalManager = new ApprovalManager();
const approvalHandler = createCLIApprovalHandler();

const agent = new Agent({
  name: 'multi-action',
  instructions: 'You perform multiple actions. Each requires approval.',
  tools: {
    action1: tool({
      description: 'First action (requires approval)',
      inputSchema: z.object({ step: z.string() }),
      execute: async ({ step }, context) => {
        const config = {
          requiredForTools: ['action1', 'action2'],
          requestApproval: approvalHandler,
          timeout: 30000
        };

        if (approvalManager.requiresApproval('action1', config)) {
          const response = await approvalManager.requestApproval(
            'action1',
            { step },
            config
          );

          if (!response.approved) {
            throw new Error(`Action 1 rejected: ${response.reason}`);
          }
        }

        return { success: true, step, action: 'action1' };
      }
    }),
    action2: tool({
      description: 'Second action (requires approval)',
      inputSchema: z.object({ step: z.string() }),
      execute: async ({ step }, context) => {
        const config = {
          requiredForTools: ['action1', 'action2'],
          requestApproval: approvalHandler,
          timeout: 30000
        };

        if (approvalManager.requiresApproval('action2', config)) {
          const response = await approvalManager.requestApproval(
            'action2',
            { step },
            config
          );

          if (!response.approved) {
            throw new Error(`Action 2 rejected: ${response.reason}`);
          }
        }

        return { success: true, step, action: 'action2' };
      }
    })
  }
});

const result = await run(
  agent, 
  'Perform action1 with step "first" and action2 with step "second"'
);
```

---

## Best Practices

### 1. Always Check Approval Before Execution

```typescript
// ✅ Good: Check approval first
execute: async ({ path }, context) => {
  if (approvalManager.requiresApproval('deleteFile', config)) {
    const response = await approvalManager.requestApproval(...);
    if (!response.approved) {
      throw new Error('Operation rejected');
    }
  }
  // Execute operation
}

// ❌ Bad: Execute first, ask later
execute: async ({ path }, context) => {
  // Execute operation
  // Then ask for approval (too late!)
}
```

### 2. Provide Clear Rejection Messages

```typescript
if (!response.approved) {
  throw new Error(
    `Operation rejected: ${response.reason || 'No reason provided'}`
  );
}
```

### 3. Set Appropriate Timeouts

```typescript
const config = {
  requiredForTools: ['deleteFile'],
  requestApproval: approvalHandler,
  timeout: 300000 // 5 minutes for critical operations
};
```

### 4. Use Sessions for Context Preservation

```typescript
import { MemorySession } from '@tawk.to/tawk-agents-sdk';

const session = new MemorySession('user-123');

const result = await run(agent, 'Delete file.txt', {
  session
});

// Context is preserved in session
const result2 = await run(agent, 'What did I just delete?', {
  session
});
```

### 5. Handle Approval Timeouts

```typescript
try {
  const response = await approvalManager.requestApproval(
    'deleteFile',
    { path },
    config
  );
} catch (error) {
  if (error.message.includes('timeout')) {
    // Handle timeout - maybe auto-reject or retry
    throw new Error('Approval request timed out');
  }
  throw error;
}
```

---

## API Reference

### ApprovalManager

```typescript
class ApprovalManager {
  // Check if tool requires approval
  requiresApproval(toolName: string, config?: ApprovalConfig): boolean;
  
  // Request approval for a tool
  requestApproval(
    toolName: string,
    args: any,
    config: ApprovalConfig
  ): Promise<ApprovalResponse>;
  
  // Get pending approval by token
  getPendingApproval(token: string): PendingApproval | undefined;
  
  // Submit approval response
  submitApproval(token: string, response: ApprovalResponse): void;
  
  // Get all pending approvals
  getPendingApprovals(): PendingApproval[];
  
  // Clear expired approvals
  clearExpired(maxAge?: number): void;
}
```

### RunState Interface

```typescript
interface RunState {
  agent: Agent<any, any>;
  messages: ModelMessage[];
  context: any;
  stepNumber: number;
  pendingApprovals?: Array<{
    toolName: string;
    args: any;
    approved: boolean;
  }>;
}
```

### Approval Handlers

```typescript
// CLI handler
function createCLIApprovalHandler(): ApprovalConfig['requestApproval'];

// Webhook handler
function createWebhookApprovalHandler(
  webhookUrl: string,
  apiKey?: string
): ApprovalConfig['requestApproval'];

// Auto-approve (testing)
function createAutoApproveHandler(): ApprovalConfig['requestApproval'];

// Auto-reject (testing)
function createAutoRejectHandler(): ApprovalConfig['requestApproval'];
```

---

## Related Documentation

- [API Reference](../reference/API.md#approvals) - Complete API documentation
- [Core Concepts](./CORE_CONCEPTS.md) - Understanding agents and tools
- [Features Guide](./FEATURES.md) - All SDK features
- [E2E Test](../../tests/e2e/13-runstate-approvals-e2e.test.ts) - Complete working example

---

**Status**: ✅ **Documentation Complete**






