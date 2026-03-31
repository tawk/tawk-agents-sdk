# 📚 Tawk Agents SDK - Examples

Complete collection of examples demonstrating all features of the SDK, organized from basic to advanced.

## 🎯 Quick Start

```bash
# Install dependencies
npm install

# Run any example
npx tsx 01-basic/01-simple-agent.ts

# Or use the universal runner
npx tsx run.ts 01
```

---

## 📖 Examples by Level

### 01-basic/ - Getting Started

Perfect for beginners. Learn the fundamentals.

| File | Description | Key Concepts |
|------|-------------|--------------|
| **01-simple-agent.ts** | Basic conversational agent | Agent creation, run() |
| **02-agent-with-tools.ts** | Adding capabilities | Tools, parallel execution |
| **03-multi-agent.ts** | Agent coordination | Handoffs, specialization |
| **04-sessions.ts** | Conversation memory | Sessions, context |

### 02-intermediate/ - Core Features

Intermediate features for production apps.

| File | Description | Key Concepts |
|------|-------------|--------------|
| **05-guardrails.ts** | Safety and validation | Input/output guardrails |
| **06-streaming.ts** | Real-time responses | Streaming, events |
| **07-tracing.ts** | Observability | Langfuse, debugging |
| **08-langfuse-tracing.ts** | Langfuse integration | Trace setup, spans |

### 03-advanced/ - Advanced Features

Advanced patterns and integrations.

| File | Description | Key Concepts |
|------|-------------|--------------|
| **09-embeddings-rag.ts** | Semantic search | Embeddings, RAG |
| **10-vision.ts** | Image understanding | Vision models, multimodal |
| **11-toon-format.ts** | Token optimization | TOON format, efficiency |
| **12-mcp-integration.ts** | Model Context Protocol | MCP servers, tool discovery |
| **14-multi-agent-research.ts** | Complex coordination | Research patterns |

### 04-production/ - Production Ready

Complete production-ready systems.

| File | Description | Key Concepts |
|------|-------------|--------------|
| **15-ecommerce-system.ts** | E-commerce assistant | Full system, workflows |
| **16-complete-showcase.ts** | All features | Comprehensive demo |

### 05-patterns/ - Design Patterns

Proven agentic patterns and architectures.

| File | Description | Key Concepts |
|------|-------------|--------------|
| **17-agentic-patterns.ts** | Agentic design patterns | Architecture, best practices |
| **18-goal-planner-reflector.ts** | Goal/Planner/Reflector agents | Specialized roles, agent transfers |
| **19-multi-agent-coordination.ts** | Pipeline coordination (research → analyze → write → review) | Back-and-forth transfers |
| **20-real-coordination-demo.ts** | Real agent-to-agent coordination with data collection pipeline | Live coordination, tool use |

---

## 🎓 Learning Path

### Beginner Path (30 minutes)
1. 01-simple-agent.ts → Learn basic agent creation
2. 02-agent-with-tools.ts → Add capabilities
3. 03-multi-agent.ts → Agent coordination
4. 04-sessions.ts → Add memory

### Intermediate Path (1 hour)
5. 05-guardrails.ts → Add safety
6. 06-streaming.ts → Real-time UX
7. 07-tracing.ts → Observability

### Advanced Path (2+ hours)
8. 09-embeddings-rag.ts → Semantic search
9. 12-mcp-integration.ts → Tool discovery
10. 15-ecommerce-system.ts → Full system

---

## 🚀 Running Examples

### Option 1: Direct Execution
```bash
npx tsx 01-basic/01-simple-agent.ts
```

### Option 2: Universal Runner
```bash
# Run by number
npx tsx run.ts 01

# Run by name
npx tsx run.ts simple-agent

# List all examples
npx tsx run.ts --list
```

### Option 3: Watch Mode
```bash
# Auto-reload on changes
npx tsx watch 01-basic/01-simple-agent.ts
```

---

## ⚙️ Configuration

### Environment Variables

Create a `.env` file:

```env
# Required
OPENAI_API_KEY=sk-...

# Optional
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_GENERATIVE_AI_API_KEY=...
LANGFUSE_PUBLIC_KEY=pk-...
LANGFUSE_SECRET_KEY=sk-...
```

---

## 📚 Additional Resources

### Reference Files
- **all-features.ts** - Comprehensive feature reference
- **run.ts** - Universal example runner
- **STRUCTURE.md** - Detailed structure documentation

### Documentation
- [Getting Started Guide](../docs/getting-started/GETTING_STARTED.md)
- [Core Concepts](../docs/guides/CORE_CONCEPTS.md)
- [API Reference](../docs/reference/API.md)
- [Full Documentation](../docs/README.md)

---

## 🎯 Quick Reference

### Most Common Tasks

**Create a basic agent:**
```typescript
const agent = new Agent({
  name: 'Assistant',
  model: openai('gpt-4o-mini'),
  instructions: 'You are helpful.',
});
const result = await run(agent, 'Hello!');
```

**Add tools:**
```typescript
const calcTool = tool({
  description: 'Calculate',
  inputSchema: z.object({ expr: z.string() }),
  execute: async ({ expr }) => eval(expr)
});
```

**Multi-agent coordination:**
```typescript
const coordinator = new Agent({
  subagents: [specialist1, specialist2]
});
```

**Multi-turn conversation:**
```typescript
// Multi-turn conversation
const messages = [
  { role: 'user' as const, content: 'Hello' },
];
const result = await run(agent, messages);
```

---

## 🤝 Contributing

Want to add an example? Follow the structure:
1. Create file with number prefix (e.g., `08-my-example.ts`)
2. Add clear comments explaining what and why
3. Keep it focused on ONE concept
4. Update this README

---

## 📝 Notes

- All examples use TypeScript
- Examples are self-contained and runnable
- Check `utils/` folder for shared helpers
- Examples use `gpt-4o-mini` by default (change if needed)

**Ready to start?** Begin with `01-basic/01-simple-agent.ts`! 🚀
