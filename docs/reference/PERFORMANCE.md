# Performance Optimization

Strategies for optimizing agent performance and reducing costs.

## Embedding Optimization

### Use Batch Processing

Batch embedding generation is 5x faster than individual calls:

```typescript
// ❌ Slow - Individual calls
for (const text of texts) {
  const embedding = await generateEmbeddingAI({ model, value: text });
}

// ✅ Fast - Batch processing
const result = await generateEmbeddingsAI({ model, values: texts });
const embeddings = result.embeddings;
```

### Enable Caching

Embedding generation includes automatic LRU caching:

```typescript
// First call - API request
const embedding1 = await generateEmbeddingAI({ model, value: 'text' });

// Second call - Cached (1000x faster)
const embedding2 = await generateEmbeddingAI({ model, value: 'text' });
```

## Tool Execution

### Parallel Tool Execution

The SDK automatically executes multiple tools in parallel:

```typescript
// Agent calls multiple tools - executed in parallel
const agent = new Agent({
  tools: {
    tool1: { /* ... */ },
    tool2: { /* ... */ },
    tool3: { /* ... */ }
  }
});

// All three tools execute simultaneously
await run(agent, 'Use all tools');
```

### Optimize Tool Responses with TOON

**Automatic TOON encoding** (Recommended - 18-33% token reduction):

Enable automatic TOON encoding for all tool results:

```typescript
const agent = new Agent({
  name: 'Data Agent',
  instructions: 'You analyze data.',
  tools: {
    getUsers: tool({
      description: 'Get user list',
      inputSchema: z.object({}),
      execute: async () => {
        const users = await db.users.find().toArray();
        // Automatically encoded to TOON (no manual encoding needed)
        return users;
      }
    })
  },
  output: { toon: true }  // ✅ Enable automatic TOON encoding
});
```

**Benefits:**
- **18-33% token reduction** in most scenarios
- **10-20% faster latency** in most scenarios
- **Zero code changes** - automatic encoding/decoding
- **Transfer-safe** - transfer markers preserved

**Manual TOON encoding** (for custom use cases):

```typescript
import { encodeTOON } from '@tawk.to/tawk-agents-sdk';

const agent = new Agent({
  tools: {
    getUsers: tool({
      description: 'Get user list',
      inputSchema: z.object({}),
      execute: async () => {
        const users = await db.users.find().toArray();
        // Manual TOON encoding
        return encodeTOON(users);
      }
    })
  }
});
```

**When to use TOON:**
- ✅ Large tool responses (arrays/objects with many fields)
- ✅ Data-heavy agents (RAG, analytics, reporting)
- ✅ Agents that return structured data repeatedly
- ✅ Cost-sensitive applications

**Performance results:**
- RAG systems: 18-33% token reduction
- Best case: 33% token savings (React query example)
- Average: 20-25% token reduction
- Latency: 10-20% faster in most scenarios

## Model Selection

### Use Faster Models for Simple Tasks

```typescript
// ✅ Fast and cheap for simple tasks
const fastAgent = new Agent({
  model: openai('gpt-4o-mini'),
  instructions: 'Quick responses'
});

// ✅ Powerful for complex tasks
const smartAgent = new Agent({
  model: openai('gpt-4o'),
  instructions: 'Detailed analysis'
});
```

## Guardrails

### Use Efficient Models

Use smaller models for guardrails:

```typescript
// ✅ Efficient
const agent = new Agent({
  name: 'SafeAgent',
  model: openai('gpt-4o'),
  instructions: 'You are helpful.',
  guardrails: [
    contentSafetyGuardrail({
      type: 'output',
      model: openai('gpt-4o-mini') // Smaller, faster model
    })
  ]
});
```

### Parallel Guardrail Execution

Guardrails execute in parallel automatically:

```typescript
// All guardrails execute simultaneously
const agent = new Agent({
  guardrails: [
    guardrail1,
    guardrail2,
    guardrail3
  ]
});
```

## Streaming

### Use Streaming for Long Responses

Streaming provides better perceived performance:

```typescript
// ✅ Better UX - user sees response immediately
const stream = await runStream(agent, 'Tell a long story');
for await (const chunk of stream.textStream) {
  process.stdout.write(chunk);
}
```

## Caching Strategies

### Cache Embeddings

Embeddings are automatically cached, but you can also cache at application level:

```typescript
const embeddingCache = new Map<string, number[]>();

async function getCachedEmbedding(text: string) {
  if (embeddingCache.has(text)) {
    return embeddingCache.get(text)!;
  }
  
  const result = await generateEmbeddingAI({ model, value: text });
  embeddingCache.set(text, result.embedding);
  return result.embedding;
}
```

### Cache Agent Responses

For deterministic queries, cache agent responses:

```typescript
const responseCache = new Map<string, string>();

async function getCachedResponse(query: string) {
  const cacheKey = hashQuery(query);
  if (responseCache.has(cacheKey)) {
    return responseCache.get(cacheKey)!;
  }
  
  const result = await run(agent, query);
  responseCache.set(cacheKey, result.finalOutput);
  return result.finalOutput;
}
```

## Monitoring

### Track Token Usage

Monitor token usage to optimize costs:

```typescript
const result = await run(agent, 'Hello');

console.log('Tokens used:', result.metadata.totalTokens);
console.log('Prompt tokens:', result.metadata.promptTokens);
console.log('Completion tokens:', result.metadata.completionTokens);
```

### Monitor Performance

Track execution times:

```typescript
const start = Date.now();
const result = await run(agent, 'Hello');
const duration = Date.now() - start;

console.log(`Execution time: ${duration}ms`);
```

## Message Format Handling

### Automatic ModelMessage Conversion

The SDK automatically handles message format conversion for compatibility:

**Solution**: SDK automatically converts messages to the format required by AI SDK's `generateText()` using `convertToModelMessages()`.

**What gets converted:**
- ✅ Tool results (already `ModelMessage[]` compatible)
- ✅ Transfer messages (preserved as `ModelMessage[]`)
- ✅ User input (already `ModelMessage[]`)

**No action required** - conversion happens automatically in `prepareMessages()`.

## Best Practices

1. **Enable TOON** for data-heavy agents (18-33% token reduction)
2. **Batch operations** when possible
3. **Use caching** for repeated operations
4. **Choose appropriate models** for each task
5. **Limit context size** with message limits
6. **Use streaming** for better UX
7. **Monitor token usage** to optimize costs
8. **Parallel execution** for multiple operations

---

For more details, see:
- [TOON Optimization Guide](../guides/TOON_OPTIMIZATION.md) - Complete TOON guide
- [API Reference](./API.md)
- [Architecture](./COMPLETE_ARCHITECTURE.md)
- [Getting Started](../getting-started/GETTING_STARTED.md)
- [Core Concepts](../guides/CORE_CONCEPTS.md)

