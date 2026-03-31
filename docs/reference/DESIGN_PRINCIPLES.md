# Design Principles & Industry Alignment

How the Tawk Agents SDK aligns with industry standards for AI agent frameworks.

**References:**
- [OpenAI Agents SDK](https://openai.github.io/openai-agents-python/) — Industry reference implementation
- [Anthropic: Building Effective Agents](https://www.anthropic.com/research/building-effective-agents) — Canonical design principles
- [Vercel AI SDK v6](https://sdk.vercel.ai) — Underlying model layer

---

## Core Design Principles

### 1. Minimal Abstraction

The SDK follows OpenAI's principle: *"Enough features to be worth using, but few enough primitives to make it quick to learn."*

Three concepts to get started:

```typescript
import { Agent, run, tool } from '@tawk.to/tawk-agents-sdk';

const agent = new Agent({ name: 'Assistant', instructions: '...' });
const result = await run(agent, 'Hello!');
```

Everything else (guardrails, transfers, tracing) is opt-in.

### 2. Agent-Driven Execution

Following Anthropic's principle that agents should *autonomously direct processes and tool selection*:

- The **agent decides** when to call tools, transfer, or finish — the SDK does not control the loop
- `determineNextStep()` inspects the model's response to figure out what to do
- No predefined execution paths — the agent chooses its journey

### 3. Simplicity Over Sophistication

Following Anthropic's recommendation to *start with the simplest solution that works*:

- `run(agent, input)` — one function call for the common case
- Sensible defaults everywhere (`execution: { maxSteps: 10 }`, `maxTurns=50`)
- Advanced features (streaming, hooks, guardrails) layer on without changing the core API

### 4. Transparency

Agent reasoning is fully observable:

- `StreamEvent` exposes every step, tool call, transfer, and guardrail check
- `RunResult.steps` provides complete execution history
- `RunResult.metadata` tracks tokens, tool calls, transfer chains, and per-agent metrics
- Langfuse integration traces the full execution hierarchy automatically

### 5. Customization-Ready

Following OpenAI's principle: *"Works great out of the box, but you can customize exactly what happens."*

- Override instructions dynamically via functions
- Custom guardrails with arbitrary validation logic
- Lifecycle hooks for every event
- `prepareStep` for per-step model settings
- `stopWhen` for custom termination conditions
- `shouldFinish` for context-aware completion
- Middleware support via AI SDK v6 `wrapLanguageModel`

---

## Three Primitives Architecture

The SDK follows the same three-primitive architecture established by OpenAI's Agents SDK:

### Agents

An autonomous AI entity with intelligence, tools, instructions, context, and safety guardrails.

```typescript
const agent = new Agent({
  name: 'Support',
  model: openai('gpt-4o'),
  instructions: 'You help users with technical issues.',
  tools: { searchDocs, createTicket },
  guardrails: [contentSafetyGuardrail({ type: 'input', model: openai('gpt-4o-mini') })],
});
```

### Transfers (Handoffs)

Agents delegate to specialists via `subagents`. The SDK auto-generates `transfer_to_{name}` tools. The transfer marker (`{ __transfer: true }`) is detected by `detectTransfer()` and triggers an agent switch with context isolation.

```typescript
const coordinator = new Agent({
  name: 'Coordinator',
  instructions: 'Route tasks to specialists.',
  subagents: [researcher, writer],  // Auto-creates transfer tools
});
```

### Guardrails

Input and output validation with 9 built-in validators. Guardrails run in parallel for performance. Failed output guardrails inject feedback and re-enter the loop, giving the agent a chance to fix its response.

```typescript
const agent = new Agent({
  guardrails: [
    lengthGuardrail({ type: 'output', maxLength: 1000 }),
    piiDetectionGuardrail({ type: 'input', block: true }),
    contentSafetyGuardrail({ type: 'output', model: openai('gpt-4o-mini') }),
  ],
});
```

---

## Agentic Patterns

Anthropic identifies five fundamental patterns for agentic systems. The SDK supports all five:

### 1. Prompt Chaining

Sequential steps where each call processes the previous output.

```typescript
const research = await run(researchAgent, query);
const article = await run(writerAgent, research.finalOutput);
```

### 2. Routing

Classify inputs and delegate to specialized handlers.

```typescript
const coordinator = new Agent({
  instructions: 'Route queries to the right specialist.',
  subagents: [salesAgent, supportAgent, billingAgent],
});
// Agent autonomously decides which specialist to transfer to
```

### 3. Parallelization

Execute independent subtasks concurrently.

```typescript
// Tool-level: multiple tool calls in one step run via Promise.all
await run(agent, 'Get weather in Tokyo, London, and New York');
```

### 4. Orchestrator-Worker

A central agent dynamically delegates to workers.

```typescript
const coordinator = new Agent({
  name: 'Coordinator',
  instructions: 'Break down the task and delegate to specialists.',
  subagents: [analyst, writer, reviewer],
});
// Coordinator decides the delegation chain at runtime
```

### 5. Evaluator-Optimizer

Iterative refinement through feedback loops.

```typescript
// Output guardrails implement this pattern automatically:
// 1. Agent generates response
// 2. Guardrail validates → fails
// 3. Feedback injected as system message
// 4. Agent retries with feedback
const agent = new Agent({
  guardrails: [
    customGuardrail({
      name: 'quality-check',
      type: 'output',
      validate: async (content) => ({
        passed: content.includes('citation'),
        message: 'Response must include citations. Please add references.',
      }),
    }),
  ],
});
```

---

## Agent Loop Design

The execution loop follows the same pattern as OpenAI's Agents SDK:

```
run(agent, input, options)
  → AgenticRunner.execute()
    → RunState (tracks messages, steps, usage)
    → Input guardrails (parallel validation)
    → Main loop:
        → Model generation (generateText from AI SDK v6)
        → executeSingleStep() → parallel tool execution (Promise.all)
        → detectTransfer() → agent switch with context isolation
        → determineNextStep() → agent decides: continue / transfer / finish
    → Output guardrails (retry with feedback on failure)
    → Return RunResult
```

Key design decisions:

| Decision | Rationale |
|----------|-----------|
| Agent decides when to finish | Follows agentic principle — no hardcoded control flow |
| Parallel tool execution | All tool calls in a step run concurrently for performance |
| Context isolation on transfer | New agent gets fresh context (original query only) to prevent confusion |
| Output guardrail retry | Failed guardrails inject feedback, giving the agent a chance to self-correct |
| Tracing as sibling spans | Agent spans are siblings (not nested) for cleaner Langfuse hierarchies |

---

## Feature Comparison with OpenAI Agents SDK

### Matched Features

| Feature | OpenAI SDK | Tawk SDK |
|---------|-----------|----------|
| Agent class | `Agent(name, instructions, model, tools)` | Identical API |
| Dynamic instructions | Function receiving context | Function receiving `RunContextWrapper` |
| Tool calling | Pydantic schemas | Zod + JSON Schema + AI SDK Schema |
| Handoffs / Transfers | `handoffs=[agent]` | `subagents: [agent]` |
| Transfer description | `handoff_description` | `transferDescription` |
| Input guardrails | Parallel validation | Parallel via `Promise.allSettled` |
| Output guardrails | Validation | Validation + retry with feedback |
| Lifecycle hooks | `AgentHooks` subclass | `AgentHooks` + `RunHooks` |
| Tracing | OpenAI dashboard | Langfuse integration |
| Structured output | `output_type` | `output: { schema }` |
| Context (DI) | Generic `TContext` | Generic `TContext` |
| Clone | `agent.clone()` | `agent.clone()` |
| Agent as tool | `agent.as_tool()` | `agent.asTool()` |
| MCP integration | Yes | stdio + HTTP + auth |
| Streaming | Yes | `runStream()` |
| State pause/resume | RunState for HITL | `RunState` |
| Max turns | `max_turns` | `maxTurns` |

### Features Beyond OpenAI SDK

| Feature | Description |
|---------|-------------|
| **9 guardrail types** | Length, PII, content safety, toxicity, sentiment, language, topic, rate limit, custom |
| **TOON optimization** | 18-33% token reduction for structured tool results |
| **Token budget tracking** | `maxTokens` (total) and `maxInputTokens` with auto-pruning |
| **Interactive CLI** | REPL with streaming, tool visualization, multi-agent transfers |
| **SSRF-safe fetch** | URL validation, redirect protection |
| **Error sanitization** | Automatic API key/token redaction in traces |
| **Per-agent metrics** | Token usage, tool calls, and duration per agent in transfer chains |

---

## Security Practices

| Practice | Implementation |
|----------|---------------|
| Input validation | 9 built-in guardrail validators |
| PII detection | `piiDetectionGuardrail` — regex-based, no external calls |
| Content safety | `contentSafetyGuardrail` — LLM-based moderation |
| Toxicity detection | `toxicityGuardrail` — LLM-scored with configurable threshold |
| Rate limiting | `rateLimitGuardrail` — per-key sliding window |
| API key protection | `sanitizeError()` redacts keys matching `/key\|secret\|token\|password/i` |
| SSRF protection | `safeFetch` validates URLs, blocks private IPs, limits redirects |
| Path traversal protection | `resolveSafePath()` in CLI tools bounds paths to CWD |

---

## Known Gaps

Features present in AI SDK v6 or other frameworks that are not yet implemented:

| Feature | Source | Impact | Notes |
|---------|--------|--------|-------|
| `inputTokenDetails` / `outputTokenDetails` | AI SDK v6 | Medium | Cache read/write and reasoning token breakdown |
| Tool `toModelOutput()` | AI SDK v6 | Medium | Control what tool results the model sees |
| MCP `readResource` / `getPrompt` | AI SDK v6 | Medium | Only list operations implemented, not read |
| Tool `inputExamples` | AI SDK v6 | Low | Zod `.describe()` serves a similar purpose |
| Image editing (reference images) | AI SDK v6 | Low | `images` parameter for inpainting/outpainting |
| `devToolsMiddleware` | AI SDK v6 | Low | Users can import directly from `'ai'` |
| Standard Schema V1 | AI SDK v6 | Low | Zod-only; no Arktype/Valibot support |
| Provider-specific tools | Various | N/A | Anthropic memory, OpenAI shell, etc. — provider responsibility |

---

## References

- [OpenAI Agents SDK](https://openai.github.io/openai-agents-python/) — Three primitives: Agents, Handoffs, Guardrails
- [Anthropic: Building Effective Agents](https://www.anthropic.com/research/building-effective-agents) — Simplicity, transparency, tool design
- [Vercel AI SDK v6](https://sdk.vercel.ai) — Underlying model and tool layer
- [IBM: The 2026 Guide to AI Agents](https://www.ibm.com/think/ai-agents) — Enterprise governance patterns
