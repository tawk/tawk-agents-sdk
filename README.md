# Tawk Agents SDK

> **Production-Ready AI Agent Framework** built on Vercel AI SDK v6

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green)](https://nodejs.org/)
[![AI SDK](https://img.shields.io/badge/AI_SDK-v6-purple)](https://sdk.vercel.ai)

Enterprise-grade multi-agent orchestration with parallel tool execution, guardrails, session management, and Langfuse observability.

> **v3.0.0** — AI SDK v6 migration, interactive CLI, 197 tests.

---

## Key Features

- **True Agentic Architecture** — Autonomous agents with context-isolated transfers
- **Parallel Tool Execution** — Automatic parallel execution via `Promise.all`
- **Multi-Agent Coordination** — Specialized agents with seamless transfers
- **Smart Guardrails** — 10 validators with LLM-based content safety
- **Complete Observability** — Hierarchical Langfuse tracing with token tracking
- **Session Management** — Memory, Redis, MongoDB with auto-summarization
- **Streaming Support** — Real-time responses with granular events
- **Interactive CLI** — REPL for testing agents with live tool visualization
- **TypeScript First** — Strict mode, 100% type safety

---

## Installation

```bash
git clone https://github.com/Manoj-tawk/tawk-agents-sdk.git
cd tawk-agents-sdk
npm install
```

Install your AI provider:

```bash
npm install @ai-sdk/openai    # OpenAI
npm install @ai-sdk/anthropic  # Anthropic
npm install @ai-sdk/google     # Google
# Groq is included as a dependency
```

---

## Quick Start

### Basic Agent

```typescript
import { Agent, run } from '@tawk.to/tawk-agents-sdk';
import { openai } from '@ai-sdk/openai';

const agent = new Agent({
  name: 'Assistant',
  model: openai('gpt-4o'),
  instructions: 'You are a helpful assistant.'
});

const result = await run(agent, 'Hello!');
console.log(result.finalOutput);
```

### Agent with Tools

```typescript
import { Agent, run, tool } from '@tawk.to/tawk-agents-sdk';
import { z } from 'zod';

const agent = new Agent({
  name: 'Assistant',
  model: openai('gpt-4o'),
  tools: {
    getWeather: tool({
      description: 'Get weather for a city',
      inputSchema: z.object({ city: z.string() }),
      execute: async ({ city }) => ({ city, temp: 22, condition: 'Sunny' })
    })
  }
});

// Tools execute in parallel automatically
const result = await run(agent, 'Weather in Tokyo and current time?');
```

### Multi-Agent Transfers

```typescript
const analyst = new Agent({
  name: 'DataAnalyst',
  model: openai('gpt-4o'),
  instructions: 'You analyze data and provide insights.',
  tools: { analyzeData: /* ... */ }
});

const coordinator = new Agent({
  name: 'Coordinator',
  model: openai('gpt-4o'),
  instructions: 'Route tasks to specialist agents.',
  subagents: [analyst]  // Creates transfer_to_dataanalyst tool
});

const result = await run(coordinator, 'Analyze Q4 sales data');
```

### With Guardrails

```typescript
import { Agent, run, lengthGuardrail, piiDetectionGuardrail, contentSafetyGuardrail } from '@tawk.to/tawk-agents-sdk';

const agent = new Agent({
  name: 'SafeAgent',
  model: openai('gpt-4o'),
  guardrails: [
    lengthGuardrail({ type: 'input', maxLength: 1000, unit: 'characters' }),
    piiDetectionGuardrail({ type: 'input', block: true }),
    contentSafetyGuardrail({ type: 'output', model: openai('gpt-4o-mini'), categories: ['violence'] })
  ]
});
```

### With Observability

```typescript
import { initLangfuse, Agent, run } from '@tawk.to/tawk-agents-sdk';

initLangfuse(); // Reads LANGFUSE_* env vars — tracing is automatic
const result = await run(agent, 'Hello!');
```

### With Sessions

```typescript
import { Agent, run, MemorySession } from '@tawk.to/tawk-agents-sdk';

const session = new MemorySession('user-123', 50);
await run(agent, 'My name is Alice', { session });
const result = await run(agent, 'What is my name?', { session });
// "Your name is Alice"
```

---

## Interactive CLI

Test agents interactively with real-time streaming, tool visualization, and multi-agent transfers:

```bash
npm run cli                                          # Default (openai:gpt-4o-mini)
npm run cli -- --model groq:llama-3.3-70b-versatile  # Groq
npm run cli -- --agent coder --verbose               # Coder preset
```

```
  TAWK Agents SDK  v3.0.0 CLI

  Model:    groq:llama-3.3-70b-versatile
  Agent:    Assistant (10 tools)
  Session:  a1b2c3d4

Assistant > what time is it?

Agent: Assistant ────────────────────────────────────────
  ⚡ Tool  current_time
  ✓ Result {"iso":"2026-02-20T06:22:46Z","timezone":"Asia/Kuala_Lumpur"}
The current time is 2:22 PM on February 20, 2026.

  Tokens  in: 2,303  out: 30  total: 2,333  |  Tools: 1  |  Duration: 1.9s
```

**Agent presets:** `default` (10 tools), `researcher`, `coder`, `multi-research` (multi-agent with transfers)

**Slash commands:** `/help`, `/agent <name>`, `/tools`, `/model <p:id>`, `/session`, `/history`, `/usage`, `/verbose`, `/clear`, `/quit`

---

## Architecture

```
run(agent, input, options)
  → AgenticRunner.execute()
    → RunState (tracks messages, steps, usage)
    → Input guardrails
    → Main loop:
        → Model generation (generateText from 'ai')
        → executeSingleStep() → parallel tool execution (Promise.all)
        → detectTransfer() → agent switch with context isolation
        → determineNextStep() → agent decides: continue / transfer / finish
    → Output guardrails (retry with feedback on failure)
    → Return RunResult
```

### Module Structure

```
src/
├── core/              # Core agent system
│   ├── agent/         # Agent class, run(), tool(), types
│   ├── runner.ts      # AgenticRunner — main execution engine
│   ├── execution.ts   # Parallel tool execution, step management
│   ├── transfers.ts   # Multi-agent transfer system
│   ├── runstate.ts    # Mutable execution state
│   └── usage.ts       # Token tracking and cost estimation
├── guardrails/        # 10 validators (length, PII, content-safety, etc.)
├── sessions/          # Memory, Redis, MongoDB, Hybrid sessions
├── lifecycle/         # Event hooks + Langfuse integration
├── tracing/           # AsyncLocalStorage-based trace context
├── helpers/           # Message builders, safe-execute, safe-fetch, sanitize
├── tools/             # Audio, embeddings, image, RAG, rerank, video tools
├── mcp/               # Model Context Protocol integration
└── index.ts           # Barrel exports
```

---

## Testing

```bash
npm test              # 197 unit tests
npm run test:coverage # With coverage report
npm run lint          # ESLint on src/
npm run build:check   # Type check only
npm run build         # Full build

# Specific suites
npm run test:core     # Core module tests
npm run test:guards   # Guardrail tests
npm run test:sessions # Session tests

# E2E (requires API keys)
npm run e2e
```

| Metric | Status |
|--------|--------|
| **Build** | Passing |
| **Lint** | Zero errors |
| **Tests** | 197 passing (12 suites) |
| **Type Safety** | Strict mode enabled |

---

## Environment Variables

```bash
# AI Provider (at least one required)
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_GENERATIVE_AI_API_KEY=...
GROQ_API_KEY=gsk_...

# Langfuse Tracing (optional)
LANGFUSE_PUBLIC_KEY=pk-lf-...
LANGFUSE_SECRET_KEY=sk-lf-...
LANGFUSE_BASE_URL=https://cloud.langfuse.com

# Sessions (optional)
REDIS_URL=redis://localhost:6379
MONGODB_URI=mongodb://localhost:27017/myapp
```

---

## Documentation

| Guide | Description | Time |
|-------|-------------|------|
| [Getting Started](./docs/getting-started/GETTING_STARTED.md) | Installation, first agent, tools, multi-agent | 15 min |
| [Core Concepts](./docs/guides/CORE_CONCEPTS.md) | Agentic architecture, tool model, lifecycle | 20 min |
| [Features Overview](./docs/guides/FEATURES.md) | All features at a glance | 30 min |
| [Advanced Features](./docs/guides/ADVANCED_FEATURES.md) | Hooks, RunState, message helpers | 45 min |
| [Flow Diagrams](./docs/reference/FLOW_DIAGRAMS.md) | 7 Mermaid sequence diagrams | 30 min |
| [Agentic RAG](./docs/guides/AGENTIC_RAG.md) | RAG with Pinecone, multi-agent patterns | 30 min |
| [Human-in-the-Loop](./docs/guides/HUMAN_IN_THE_LOOP.md) | Approval workflows | 20 min |
| [Tracing](./docs/guides/TRACING.md) | Langfuse integration | 15 min |
| [Error Handling](./docs/guides/ERROR_HANDLING.md) | Error patterns, recovery | 15 min |
| [TOON Optimization](./docs/guides/TOON_OPTIMIZATION.md) | 18-33% token reduction | 15 min |
| [API Reference](./docs/reference/API.md) | Complete API documentation | Reference |
| [Architecture](./docs/reference/COMPLETE_ARCHITECTURE.md) | Full system design | 60 min |
| [Performance](./docs/reference/PERFORMANCE.md) | Optimization and benchmarks | 30 min |

---

## Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `ai` | ^6.0.0 | Vercel AI SDK v6 |
| `@ai-sdk/groq` | ^3.0.0 | Groq provider |
| `zod` | ^3.25 | Schema validation |
| `langfuse` | ^3.30 | Observability |
| `@ai-sdk/openai` | ^3.0.0 | OpenAI (peer, optional) |
| `@ai-sdk/anthropic` | ^3.0.0 | Anthropic (peer, optional) |
| `@ai-sdk/google` | ^3.0.0 | Google (peer, optional) |

---

## License

MIT - [Tawk.to](https://www.tawk.to)

## Support

- [Documentation](./docs/README.md)
- [GitHub Issues](https://github.com/Manoj-tawk/tawk-agents-sdk/issues)
- [Examples](./examples)
