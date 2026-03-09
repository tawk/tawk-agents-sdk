# E2E Tests

Real API tests that validate SDK functionality. Requires `OPENAI_API_KEY` in `.env`.

## Run

```bash
npm run e2e          # all tests
npm run e2e:core     # 01: agent, tools, context, streaming, guardrails
npm run e2e:multi    # 02: handoffs, race agents
npm run e2e:advanced # 03: TOON encoding, structured output
```

## Test Files

| File | Tests | ~Tokens |
|------|-------|---------|
| `01-core.test.ts` | Simple agent, tool calling, context injection, multi-turn, streaming, guardrails, error handling | ~2000 |
| `02-multi-agent.test.ts` | Subagent handoff, race agents | ~3000 |
| `03-advanced.test.ts` | Tool-level TOON, structured output schema | ~1500 |

Total cost per run: < $0.01
