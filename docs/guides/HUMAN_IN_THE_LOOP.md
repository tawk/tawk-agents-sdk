# Human-in-the-Loop

## Current Approach

You can implement human-in-the-loop patterns today using custom tools:

```typescript
import { Agent, run, tool } from '@tawk.to/tawk-agents-sdk';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';
import * as readline from 'readline';

function askUser(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, answer => { rl.close(); resolve(answer); }));
}

const dangerousAction = tool({
  description: 'Delete a file (requires user approval)',
  inputSchema: z.object({ path: z.string() }),
  execute: async ({ path }) => {
    const answer = await askUser(`Approve deleting ${path}? (yes/no): `);
    if (answer.toLowerCase() !== 'yes') {
      return { status: 'rejected', message: 'User denied the action' };
    }
    // Perform the action...
    return { status: 'approved', message: `Deleted ${path}` };
  }
});

const agent = new Agent({
  name: 'FileManager',
  model: openai('gpt-4o'),
  instructions: 'You manage files. Always use the dangerousAction tool for deletions.',
  tools: { dangerousAction }
});

await run(agent, 'Delete temp.txt');
```

## Related Documentation

- [CLI Guide](./CLI.md) - Test HITL patterns with the permission system
- [Core Concepts](./CORE_CONCEPTS.md) - Understanding agents and tools
- [Features Guide](./FEATURES.md) - All SDK features
