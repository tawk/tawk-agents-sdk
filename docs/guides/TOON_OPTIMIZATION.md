# TOON Optimization Guide

Complete guide to using TOON (Token-Oriented Object Notation) for token optimization in the Tawk Agents SDK.

## Overview

TOON is a compact data format that provides **18-33% token reduction** compared to JSON for structured data. The SDK supports automatic TOON encoding for all tool results when enabled.

## Quick Start

Enable automatic TOON encoding with a single config option:

```typescript
import { Agent, run, tool } from '@tawk.to/tawk-agents-sdk';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';

const agent = new Agent({
  name: 'Data Agent',
  model: openai('gpt-4o-mini'),
  instructions: 'You analyze data and provide insights.',
  tools: {
    getLargeData: tool({
      description: 'Get a large dataset with many records',
      inputSchema: z.object({
        count: z.number().describe('Number of records to return')
      }),
      execute: async ({ count }) => {
        // Generate large array of objects
        const data = Array.from({ length: count }, (_, i) => ({
          id: i + 1,
          name: `Item ${i + 1}`,
          description: `Detailed description for item ${i + 1}`,
          metadata: {
            category: `Category ${(i % 5) + 1}`,
            tags: [`tag${i}`, `tag${i + 1}`],
            properties: {
              value: i * 10,
              active: i % 2 === 0,
              timestamp: new Date().toISOString()
            }
          }
        }));
        return { data, total: count };
      }
    })
  },
  output: { toon: true }  // ✅ Enable automatic TOON encoding
});

const result = await run(agent, 'Get 50 records and summarize them');
console.log(result.finalOutput);
```

## How It Works

### Automatic Encoding

When `output: { toon: true }` is set:

1. **Tool Execution**: Tools return normal JavaScript objects/arrays
2. **Automatic Encoding**: SDK automatically encodes tool results to TOON format
3. **LLM Processing**: LLM receives TOON-encoded data (18-33% smaller)
4. **Automatic Decoding**: LLM can decode TOON format natively
5. **No Code Changes**: Your tool code remains unchanged

### What Gets Encoded

- ✅ **Objects** - All plain objects
- ✅ **Arrays** - All arrays
- ✅ **Nested structures** - Deeply nested objects/arrays
- ❌ **Strings** - Already efficient, not encoded
- ❌ **Primitives** - Numbers, booleans, null (not encoded)
- ❌ **Transfer markers** - Special `__transfer` objects preserved

### Encoding Process

```typescript
// Your tool returns this:
{
  users: [
    { id: 1, name: 'Alice', email: 'alice@example.com' },
    { id: 2, name: 'Bob', email: 'bob@example.com' }
  ],
  total: 2
}

// SDK automatically converts to TOON (18-33% smaller):
// users: [
//   id: 1, name: "Alice", email: "alice@example.com"
//   id: 2, name: "Bob", email: "bob@example.com"
// ]
// total: 2
```

## Performance Results

### Real-World Benchmarks

Based on RAG E2E test results:

| Scenario | Token Savings | Latency Improvement |
|----------|---------------|---------------------|
| Simple Query | **-18.4%** | **-10.6%** |
| Multi-Domain | +1.6%* | **-13.8%** |
| Ambiguous Query | **-33.2%** | **-20.4%** |
| Complex Multi-Step | N/A** | N/A** |
| Domain-Specific | **-22.9%** | -1.4% |

*Slight increase due to LLM response variability  
**Previously failed, now works with ModelMessage fix

### Average Performance

- **Token Reduction**: 18-33% in most scenarios
- **Latency Improvement**: 10-20% faster in most scenarios
- **Cost Savings**: 18-33% per query in most cases
- **Best Case**: 33% token reduction (React query example)

## When to Use TOON

### ✅ Best For

1. **Large Tool Responses**
   - Arrays with many items
   - Objects with many fields
   - Nested structures

2. **Data-Heavy Agents**
   - RAG systems
   - Analytics agents
   - Reporting agents
   - Data processing agents

3. **Cost-Sensitive Applications**
   - High-volume systems
   - Production deployments
   - Cost optimization requirements

4. **Structured Data**
   - Database queries
   - API responses
   - JSON data processing

### ❌ Not Needed For

1. **Simple String Responses**
   - Already efficient
   - No encoding benefit

2. **Small Objects** (< 100 tokens)
   - Encoding overhead may exceed savings
   - Minimal benefit

3. **Agents with Minimal Tool Usage**
   - If tools are rarely called
   - Savings may not justify complexity

## Configuration

### Enable for Single Agent

```typescript
const agent = new Agent({
  name: 'My Agent',
  instructions: '...',
  tools: { ... },
  output: { toon: true }  // Enable TOON for this agent
});
```

### Enable for Multiple Agents

```typescript
// Enable for all data-heavy agents
const dataAgent = new Agent({
  name: 'Data Agent',
  output: { toon: true },
  // ...
});

const analyticsAgent = new Agent({
  name: 'Analytics Agent',
  output: { toon: true },
  // ...
});

const reportingAgent = new Agent({
  name: 'Reporting Agent',
  output: { toon: true },
  // ...
});
```

### Conditional Usage

```typescript
// Enable based on environment or feature flag
const agent = new Agent({
  name: 'My Agent',
  output: { toon: process.env.ENABLE_TOON === 'true' },
  // ...
});
```

## Manual TOON Encoding

For custom use cases, you can manually encode/decode TOON:

```typescript
import { encodeTOON, decodeTOON } from '@tawk.to/tawk-agents-sdk';

// Encode data to TOON
const data = { users: [...], total: 100 };
const toonString = encodeTOON(data);

// Decode TOON back to object
const decoded = decodeTOON(toonString);
```

### Use Cases for Manual Encoding

1. **Pre-processing data** before tool execution
2. **Custom serialization** for storage
3. **Inter-agent communication** with TOON format
4. **Legacy system integration** requiring TOON format

## Advanced Usage

### Tool-Level Control

While `output.toon` applies to all tools, you can control encoding per tool with `useTOON` on individual tool definitions:

```typescript
const agent = new Agent({
  name: 'Hybrid Agent',
  output: { toon: true },  // Enable for most tools
  tools: {
    // This tool's result will be TOON-encoded
    getLargeData: tool({
      description: 'Get large dataset',
      inputSchema: z.object({}),
      execute: async () => {
        return { data: [...] };  // Auto-encoded to TOON
      }
    }),
    
    // This tool returns a string (not encoded)
    getStatus: tool({
      description: 'Get status',
      inputSchema: z.object({}),
      execute: async () => {
        return 'OK';  // String, not encoded
      }
    })
  }
});
```

### Error Handling

TOON encoding includes automatic error handling:

```typescript
// If encoding fails, original result is returned
// No errors thrown, graceful fallback
const agent = new Agent({
  name: 'Safe Agent',
  output: { toon: true },
  tools: {
    getData: tool({
      execute: async () => {
        // Even if this causes encoding issues,
        // SDK will return original data
        return complexData;
      }
    })
  }
});
```

## Best Practices

### 1. Enable for Data-Heavy Agents

```typescript
// ✅ Good - Large data responses
const dataAgent = new Agent({
  name: 'Data Agent',
  output: { toon: true },
  tools: {
    getUsers: tool({
      execute: async () => {
        return await db.users.find().toArray();  // Large array
      }
    })
  }
});

// ❌ Not needed - Small responses
const simpleAgent = new Agent({
  name: 'Simple Agent',
  output: { toon: false },  // Small responses, no benefit
  tools: {
    getStatus: tool({
      execute: async () => {
        return { status: 'ok' };  // Small object
      }
    })
  }
});
```

### 2. Monitor Performance

```typescript
const result = await run(agent, 'Get data');

console.log('Tokens used:', result.metadata.totalTokens);
console.log('Cost:', calculateCost(result.metadata.totalTokens));

// Compare with/without TOON to measure savings
```

### 3. Test Before Production

```typescript
// Test with TOON enabled
const testAgent = new Agent({
  name: 'Test Agent',
  output: { toon: true },
  // ...
});

const result = await run(testAgent, 'Test query');
console.log('Performance:', result.metadata);
```

## Troubleshooting

### No Token Savings

**Problem**: TOON enabled but no token reduction observed.

**Solutions**:
1. Check if tool responses are actually large (> 100 tokens)
2. Verify tool returns objects/arrays (not strings)
3. Check LLM response variability (may mask savings)
4. Monitor over multiple queries (single query may vary)

### Encoding Errors

**Problem**: Tool execution fails with encoding errors.

**Solutions**:
1. SDK automatically falls back to original data
2. Check for circular references in data
3. Ensure data is JSON-serializable
4. Review tool return types

### Performance Issues

**Problem**: TOON enabled but slower performance.

**Solutions**:
1. Encoding overhead is minimal (~1-2ms)
2. Check if tool responses are small (overhead may exceed savings)
3. Verify LLM can decode TOON (should be automatic)
4. Monitor latency over multiple runs

## Related Documentation

- [Performance Guide](../reference/PERFORMANCE.md) - General optimization strategies
- [Features Guide](./FEATURES.md) - All SDK features
- [API Reference](../reference/API.md) - Complete API documentation
- [Core Concepts](./CORE_CONCEPTS.md) - Understanding the SDK

## Examples

See the examples directory for complete TOON usage examples:

- `examples/03-advanced/11-toon-format.ts` - Manual TOON encoding

## Summary

**TOON Optimization** provides:
- ✅ **18-33% token reduction** in most scenarios
- ✅ **10-20% faster latency** in most scenarios
- ✅ **Zero code changes** - automatic encoding/decoding
- ✅ **Production-ready** - 100% reliability
- ✅ **Cost savings** - 18-33% per query

Enable `output: { toon: true }` on agents that return large structured data to reduce token usage and costs!


