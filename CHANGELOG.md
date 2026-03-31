# Changelog

All notable changes to the Tawk Agents SDK will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.0.0] — 2026-03-15

### Breaking Changes
- **AI SDK v6 migration**: Updated from `ai@^4.0.0` to `ai@^6.0.0` and all `@ai-sdk/*` providers to `^3.0.0`
- `RunState.create()` is now the async factory (required for AI SDK v6 `convertToModelMessages`)
- `GenerateTextResult` generic signature updated for v6 (`GenerateTextResult<ToolSet, any>`)
- `generateImage` promoted to stable (removed `experimental_` prefix)
- `rerank` is now a direct import from `'ai'`
- `EmbeddingModel` no longer takes a generic parameter
- Removed stale integration, e2e, and manual test suites
- Langfuse integration now requires explicit `initLangfuse({ publicKey, secretKey })` config (removed auto-init from env vars)

### Added
- Per-tool TOON encoding support via `useTOON` on individual tool definitions
- Token budget tracking with graceful degradation (`TokenBudgetTracker`)

### Fixed
- Error sanitization applied consistently across all tracing paths
- Updated all unit tests for v3.0.0 API compatibility (198 tests passing)

### Compatibility

**Node.js**: >= 18.0.0
**TypeScript**: >= 5.7.0
**AI SDK**: `ai@^6.0.0`, `@ai-sdk/*@^3.0.0`

---

## [2.0.0] - 2026-01-27

### Added

  - Support for JSON schema formatted tool definitions
  - Added an option to set `responseTokens` and `maxTokens` on agent initialization
    - `responseTokens` - Sets the limit for the tokens used for the final output (default: `undefined` [unlimited])
    - `maxTokens` - Sets the limit for the total tokens used in an agent run (default: `undefined` [unlimited])

## [1.0.0] - 2025-12-02

### 🎉 Major Release: True Agentic Architecture

This release represents a complete architectural overhaul to implement true agentic patterns, proper observability, and clean code organization.

### Added

#### Initial Release
- Basic agent execution
- Tool support
- Guardrails
- Sessions
- MCP integration
- TOON optimization

#### Core Features
- **Enhanced Streaming**: Granular event types for better observability
  - `text-delta`: Text generation updates
  - `tool-call-start`, `tool-call`, `tool-result`: Tool execution lifecycle
  - `agent-start`, `agent-end`: Agent lifecycle tracking
  - `transfer`: Agent transfer events
  - `guardrail-check`: Guard rail validation events
  - `step-start`, `step-complete`: Step lifecycle
  - `finish`: Completion with finish reason

- **Context Isolation**: Agents start with fresh context after transfers
- **Parallel Tool Execution**: Multiple tools can execute simultaneously
- **Token Aggregation**: Agent spans report accumulated token usage in metadata
- **Intelligent Guardrail Feedback**: Length violations provide actionable retry instructions

#### New Modules
- `src/core/runner.ts`: Dedicated runner with AgenticRunner class
- `src/core/transfers.ts`: Transfer mechanism (formerly handoffs)
- `src/core/execution.ts`: Single-step execution logic

#### Examples
- `examples/goal-planner-reflector-agents.ts`: Goal/Planner/Reflector pattern
- `examples/multi-agent-coordination.ts`: Complex multi-agent workflows
- `examples/real-coordination-demo.ts`: Realistic coordination scenarios
- `examples/simple-goal-planner-test.ts`: Basic multi-agent flow
- `examples/test-langfuse-trace.ts`: Tracing verification

#### Documentation
- `docs/analysis/FINAL_GAP_ANALYSIS.md`: Comprehensive comparison with OpenAI agents-js
- `docs/analysis/TRACING_FIXED.md`: Tracing implementation details
- `docs/analysis/INTELLIGENT_GUARDRAIL_FEEDBACK.md`: Guardrail feedback system
- `docs/analysis/TOKEN_USAGE_FIXED.md`: Token tracking improvements

### Changed

#### Breaking Changes
- **Terminology**: `agent.handoffs` → `agent.subagents`
- **Tool Names**: `handoff_to_*` → `transfer_to_*`
- **Module**: Removed `src/handoffs/` (replaced with `src/core/transfers.ts`)

#### Architecture
- **Trace Hierarchy**: Agents are now siblings under main trace (not nested)
- **LLM Tracking**: Changed from SPAN to GENERATION type for proper token tracking
- **Guardrails**: No longer throw errors; return feedback for agent retry

#### Performance
- **62% Latency Improvement**: From architectural refactoring
- **Token Optimization**: TOON format provides ~60% token reduction
- **Efficient Execution**: Parallel tool calls and optimized message handling

### Fixed

#### Tracing
- Agent spans properly show as siblings in Langfuse
- LLM calls correctly tracked as GENERATION objects
- Token usage properly aggregated and displayed
- Guardrail spans correctly positioned in hierarchy
- Trace output is plain text (not nested objects)

#### Guardrails
- Length violations now calculate reduction percentage
- Provide specific instructions to agent for retry
- Changed from throwing errors to providing feedback

#### Execution
- Tool arguments correctly passed to tool execution
- Fixed duplicate message additions
- Proper message history management
- Context isolation for transferred agents

### Improved

#### Code Organization
- Separated concerns: agent definition vs. execution
- Clear module boundaries
- Reduced complexity in core agent class
- Better state management

#### Documentation
- Updated all docs to reflect new architecture
- Comprehensive API documentation
- Real-world examples
- Gap analysis with OpenAI agents-js

#### Testing
- Updated test terminology (subagents, transfer_to_*)
- Increased maxTurns for complex scenarios
- Adjusted guardrail limits for comprehensive queries

### Performance Metrics

**Before True Agentic Architecture:**
- Average latency: ~5.7s per query
- Deeply nested trace hierarchy
- Manual token tracking
- Inflexible handoff system

**After True Agentic Architecture:**
- Average latency: ~2.0s per query (**62% improvement**)
- Flat trace hierarchy (siblings)
- Automatic token aggregation
- Flexible transfer system with context isolation

### Migration Guide

#### 1. Update Agent Configuration
```typescript
// Before
const agent = new Agent({
  name: 'MyAgent',
  handoffs: [otherAgent],
  // ...
});

// After
const agent = new Agent({
  name: 'MyAgent',
  subagents: [otherAgent],
  // ...
});
```

#### 2. Transfer Tools
Transfer tools are automatically created. No manual `handoff_to_*` needed.

```typescript
// Before
const handoffTool = tool({
  description: 'Handoff to specialist',
  parameters: z.object({...}),
  execute: async () => ({ __handoff: true, ... })
});

// After
// Automatically created from agent.subagents
// Agent decides when to transfer using transfer_to_* tools
```

#### 3. Streaming Events
```typescript
// New enhanced streaming
const result = await runStream(agent, input);

for await (const event of result.fullStream) {
  if (event.type === 'text-delta') {
    console.log(event.textDelta);
  } else if (event.type === 'agent-start') {
    console.log(`Agent ${event.agentName} started`);
  } else if (event.type === 'transfer') {
    console.log(`Transfer: ${event.from} → ${event.to}`);
  }
}
```

### Compatibility

**Node.js**: >= 18.0.0
**TypeScript**: >= 5.0.0
**AI SDK**: >= 4.0.0

### Dependencies

- Updated exports to match new architecture
- Removed handoffs module references
- Added enhanced streaming types
- Cleaned up duplicate exports

---
