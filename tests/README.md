# Tests

## Structure

```
tests/
  unit/           # Jest unit tests (mocked, fast, no API keys)
  e2e/            # E2E tests (real API calls, requires OPENAI_API_KEY)
  manual/         # Jest tests with mocked models
  utils/          # Shared test utilities
```

## Running

```bash
# Unit tests (198 tests, <1s)
npm test

# E2E tests (requires .env with OPENAI_API_KEY)
npm run e2e
```

## Unit Tests

| File | Coverage |
|------|----------|
| `unit/core/agent/agent-class.test.ts` | Agent creation, config, accessors |
| `unit/core/runstate.test.ts` | RunState management |
| `unit/core/transfers.test.ts` | Agent transfer/handoff logic |
| `unit/guardrails/guardrails.test.ts` | Guardrail validation |
| `unit/helpers/safe-fetch.test.ts` | SSRF-safe fetch |
| `unit/cli/*.test.ts` | CLI modules |
| `manual/agent.test.ts` | Agent execution (mocked model) |

## E2E Tests

E2E test files are planned but not yet implemented. When added, they will cover:

| Planned File | Coverage |
|--------------|----------|
| `e2e/01-core.test.ts` _(planned)_ | Simple agent, tool calling, context injection, multi-turn, streaming, guardrails, error handling |
| `e2e/02-multi-agent.test.ts` _(planned)_ | Subagent handoff, race agents |
| `e2e/03-advanced.test.ts` _(planned)_ | Tool-level TOON, structured output |

E2E cost per run: < $0.01
