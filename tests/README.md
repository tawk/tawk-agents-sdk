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
# Unit tests (199 tests, <1s)
npm test

# E2E tests (13 tests, requires .env with OPENAI_API_KEY)
npm run e2e

# Individual E2E
npm run e2e:core      # agent, tools, context, streaming, guardrails
npm run e2e:multi     # handoffs, race agents
npm run e2e:advanced  # TOON encoding, structured output
```

## Unit Tests

| File | Coverage |
|------|----------|
| `unit/core/agent/agent-class.test.ts` | Agent creation, config, accessors |
| `unit/core/runstate.test.ts` | RunState management |
| `unit/core/transfers.test.ts` | Agent transfer/handoff logic |
| `unit/guardrails/guardrails.test.ts` | Guardrail validation |
| `unit/helpers/safe-fetch.test.ts` | SSRF-safe fetch |
| `unit/tools/planner.test.ts` | Planning tool |
| `unit/cli/*.test.ts` | CLI modules |
| `manual/agent.test.ts` | Agent execution (mocked model) |

## E2E Tests

| File | Tests |
|------|-------|
| `e2e/01-core.test.ts` | Simple agent, tool calling, context injection, multi-turn, streaming, guardrails, error handling |
| `e2e/02-multi-agent.test.ts` | Subagent handoff, race agents |
| `e2e/03-advanced.test.ts` | Tool-level TOON, structured output |

E2E cost per run: < $0.01
