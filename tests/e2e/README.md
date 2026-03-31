# E2E Tests

Real API tests that validate SDK functionality. Requires `OPENAI_API_KEY` in `.env`.

## Run

```bash
npm run e2e   # requires OPENAI_API_KEY in .env
```

## Planned Test Files

E2E test files are not yet implemented. When added, they will cover:

| Planned File | Coverage | ~Tokens |
|--------------|----------|---------|
| `01-core.test.ts` _(planned)_ | Simple agent, tool calling, context injection, multi-turn, streaming, guardrails, error handling | ~2000 |
| `02-multi-agent.test.ts` _(planned)_ | Subagent handoff, race agents | ~3000 |
| `03-advanced.test.ts` _(planned)_ | Tool-level TOON, structured output schema | ~1500 |

Total cost per run: < $0.01
