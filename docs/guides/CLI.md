# CLI Guide

Interactive developer tool for testing the Tawk Agents SDK.

## Quick Start

```bash
# Run with interactive model picker
npm run cli

# Run with a specific model
npm run cli -- --model openai:gpt-4o-mini

# Run with Anthropic + custom system prompt
npm run cli -- -m anthropic:claude-sonnet-4-5 --system-prompt "You are a pirate"

# Run with a focused agent preset
npm run cli -- --agent coder -m openai:gpt-4o
```

## Setup

### Environment Variables

Create a `.env` file in the project root with at least one API key:

```env
# Required (at least one)
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_GENERATIVE_AI_API_KEY=...
GROQ_API_KEY=gsk_...
```

### Supported Models

| Provider | Example models | Required env var |
|----------|----------------|------------------|
| OpenAI | `gpt-4o-mini`, `gpt-4o`, `o3-mini` | `OPENAI_API_KEY` |
| Anthropic | `claude-sonnet-4-5`, `claude-haiku-4-5`, `claude-opus-4-6` | `ANTHROPIC_API_KEY` |
| Groq | `llama-3.3-70b-versatile` | `GROQ_API_KEY` |
| Google | `gemini-2.0-flash` | `GOOGLE_GENERATIVE_AI_API_KEY` |

Model format: `provider:model-id` (e.g. `openai:gpt-4o`). You can also type just the model name — the provider is auto-detected from the prefix (`gpt-` → openai, `claude-` → anthropic, etc.).

---

## CLI Flags

```
npm run cli -- [options]
```

| Flag | Alias | Default | Description |
|------|-------|---------|-------------|
| `--model <p:id>` | `-m` | interactive picker | Model to use |
| `--agent <preset>` | `-a` | `default` | Agent preset |
| `--session <id>` | `-s` | random | Session ID |
| `--system-prompt <text>` | | | Override system prompt |
| `--append-system-prompt <text>` | | | Append to preset prompt |
| `--mcp-config <path>` | | `.mcp.json` | MCP config file path |
| `--verbose` | `-v` | off | Show step details |
| `--max-turns <n>` | | `50` | Max turns per query |
| `--help` | `-h` | | Show help |

---

## Agent Presets

Switch presets with `--agent <name>` or `/agent <name>` at runtime.

### `default` — Main Agent + Subagents

The default agent has all 10 tools and 3 specialized subagents it can dynamically transfer to:

| Subagent | Tools | Use case |
|----------|-------|----------|
| **Coder** | shell_exec, read_file, write_file, list_files, current_time | Code editing, building, testing |
| **Researcher** | web_fetch, read_file, list_files, calculator, current_time | Multi-file research, web lookups |
| **Analyst** | read_file, list_files, calculator, json_parse, current_time | Data analysis, reports, calculations |

The main agent decides when to delegate — no predetermined workflow. It handles simple questions directly and transfers to specialists for complex tasks.

### `minimal` — All Tools, No Subagents

Same 10 tools as default but handles everything itself. Good for testing without transfers.

### `coder` — Focused Coding

5 tools: `shell_exec`, `read_file`, `write_file`, `list_files`, `current_time`

### `researcher` — Focused Research

5 tools: `web_fetch`, `read_file`, `list_files`, `calculator`, `current_time`

---

## Built-in Tools

| Tool | Description | Notes |
|------|-------------|-------|
| `current_time` | Current date, time, timezone, unix timestamp | |
| `calculator` | Evaluate math expressions safely | Only digits and operators allowed |
| `read_file` | Read a file (relative to CWD) | Max 50KB, path traversal blocked |
| `write_file` | Write content to a file | Creates parent dirs. **Requires permission** |
| `list_files` | List directory contents with sizes | Path traversal blocked |
| `shell_exec` | Execute a shell command | 30s timeout, 1MB output. **Requires permission** |
| `web_fetch` | Fetch URL content (SSRF-safe) | 15s timeout, 5KB max |
| `json_parse` | Parse and format JSON | |
| `generate_uuid` | Generate UUID v4 | |
| `sleep` | Wait N milliseconds | Max 30 seconds |

### Permission System

`write_file` and `shell_exec` are dangerous tools. Each call shows a confirmation prompt:

```
⚠ Allow shell_exec? {"command":"ls -la"} [Y/n]
```

- Press **Enter** or type **y** to allow
- Type **n** to deny (agent receives an error and adapts)
- Multiple concurrent tool calls are serialized (prompts never overlap)

---

## Slash Commands

### Session

| Command | Description |
|---------|-------------|
| `/clear` | Clear history and terminal |
| `/session` | Show session info (ID, messages, turns) |
| `/session new` | Start a fresh session (new ID, reset counters) |
| `/history` | Show last 10 messages |
| `/usage` | Show cumulative tokens, tool calls, duration, cost |

### Agent & Model

| Command | Description |
|---------|-------------|
| `/agent` | Show current agent info (tools, subagents) |
| `/agent <name>` | Switch preset (`default`, `minimal`, `coder`, `researcher`) |
| `/model` | Show current model |
| `/model <p:id>` | Switch model (e.g. `/model anthropic:claude-sonnet-4-5`) |
| `/tools` | List all available tools |

### System Prompt

| Command | Description |
|---------|-------------|
| `/system` | Show current system prompt |
| `/system set <text>` | Replace system prompt |
| `/system reset` | Revert to preset default |

### MCP Servers

| Command | Description |
|---------|-------------|
| `/mcp` | List servers with connection status |
| `/mcp reload` | Reconnect all servers from `.mcp.json` |
| `/mcp add <name> <cmd> [args]` | Add server to `.mcp.json` |
| `/mcp remove <name>` | Remove server from `.mcp.json` |

### Config

| Command | Description |
|---------|-------------|
| `/config` | Show all settings with sources |
| `/config set <key> <value>` | Save to `.tawk/settings.local.json` |
| `/verbose` | Toggle verbose mode |
| `/help` | Show command reference |
| `/quit` | Exit (also `/exit`, `/q`) |

---

## Input Modes

### Single Line
Type a message and press Enter.

### Multi-Line (backslash)
End a line with `\` to continue on the next line:
```
tell me about \
the history of \
TypeScript
```

### Multi-Line (block)
Use `"""` to start and end a block:
```
"""
Write a function that:
1. Takes an array of numbers
2. Filters out negatives
3. Returns the sum of squares
"""
```

### Bash Passthrough
Prefix with `!` to run a shell command directly:
```
!ls -la src/
!git status
!npm test
```

### Keyboard Shortcuts

| Key | Context | Action |
|-----|---------|--------|
| **Ctrl+C** | While agent is running | Cancel current execution |
| **Ctrl+C** | In multi-line input | Cancel and return to `> ` prompt |
| **Ctrl+C** | Idle | Exit the CLI |
| **Ctrl+D** | Idle | Exit the CLI |
| **Up/Down** | At prompt | Navigate command history (200 entries) |

---

## Configuration

### Config Files

Settings are loaded in this order (later overrides earlier):

1. **Defaults** — `agent: "default"`, `verbose: false`, `maxTurns: 50`
2. **`.tawk/settings.json`** — Project-level (commit to VCS)
3. **`.tawk/settings.local.json`** — Local overrides (gitignore this)
4. **Environment variables** — `TAWK_CLI_MODEL`, `TAWK_CLI_AGENT`
5. **CLI flags** — `--model`, `--agent`, `--verbose`, `--max-turns`

### Example `.tawk/settings.json`

```json
{
  "model": "openai:gpt-4o-mini",
  "agent": "default",
  "verbose": false,
  "maxTurns": 50,
  "systemPrompt": "You are a helpful coding assistant."
}
```

### System Prompt from File

```json
{
  "systemPromptFile": "prompts/custom.md"
}
```

The file content is read at startup and used as the system prompt.

---

## MCP Integration

The CLI reads `.mcp.json` (Claude Code-compatible format) to connect MCP servers.

### Example `.mcp.json`

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]
    },
    "api": {
      "url": "http://localhost:3000/mcp",
      "env": {
        "API_KEY": "${MY_API_KEY}"
      }
    }
  }
}
```

- **stdio** servers: specify `command` and optional `args`
- **HTTP** servers: specify `url`
- Environment variables in `env` support `${VAR_NAME}` interpolation
- Failed servers show a warning but don't block startup
- MCP tools appear in `/tools` with a `[mcp]` prefix

---

## Streaming Output

Responses stream inline as a scrolling transcript:

```
> analyze the src/ directory

I'll analyze the source directory for you.
  ⎿ transfer_to_researcher(reason=Multi-file analysis task...)

  ⎿ Transfer → Researcher (Multi-file analysis task)

  ⎿ Agent: Researcher
Let me explore the directory structure.
  ⎿ list_files(src)
    {"path":"src","count":9,"items":[...]} (1ms)
  ⎿ read_file(src/index.ts)
    {"path":"src/index.ts","size":7408,...} (2ms)

Here's what I found...

  172,987 tokens · 2 agents · 27 tools · 138.3s · ~$0.0936
  Agents: Assistant → Researcher
```

- **Text** streams character by character
- **Tool calls** show as `⎿ toolName(args)` with result preview and duration
- **Transfers** show as `⎿ Transfer → AgentName (reason)`
- **Usage summary** appears after each turn with token count, cost, and agent chain
- **Verbose mode** (`/verbose`) adds step boundaries and guardrail check results

---

## Usage Examples

### Quick Q&A (no tools)
```
> what is TypeScript?
TypeScript is a strongly typed programming language...
```

### Tool Use
```
> what time is it and calculate 42 * 17
  ⎿ current_time()
  ⎿ calculator(42 * 17)
The current time is 2:30 PM EST, and 42 × 17 = 714.
```

### Multi-Agent Transfer
```
> analyze all files in src/core and write a summary report
  ⎿ Transfer → Researcher
  ⎿ Agent: Researcher
  ⎿ list_files(src/core)
  ⎿ read_file(src/core/runner.ts)
  ...
```

### Model Switching
```
> /model openai:gpt-4o
  Model switched to openai:gpt-4o — Assistant (13 tools)
> /model groq:llama-3.3-70b-versatile
  Model switched to groq:llama-3.3-70b-versatile — Assistant (13 tools)
```

### Custom System Prompt
```
> /system set You are a pirate. Respond only in pirate speak.
  System prompt updated.
> hello!
Ahoy there, matey! What brings ye to these waters?
```

### Config Persistence
```
> /config set model anthropic:claude-sonnet-4-5
  Saved model=anthropic:claude-sonnet-4-5 to .tawk/settings.local.json
```

---

## Troubleshooting

### "Missing API key" error
Set the required environment variable in `.env` or your shell:
```bash
export OPENAI_API_KEY=sk-...
```

### Agent not using tools
Some models (especially smaller ones) may not reliably call tools. Try a more capable model like `gpt-4o` or `claude-sonnet-4-5`.

### "Path traversal" error
Tools can only access files within the current working directory. Run the CLI from the project root.

### Permission prompts blocking
In non-interactive mode (piped stdin), permission prompts for dangerous tools will hang. Only use safe tools in piped scenarios.

### MCP server won't connect
Check your `.mcp.json` syntax and ensure the MCP server command is installed. Use `/mcp` to see connection status and `/mcp reload` to retry.

---

## Related

- [Test Queries](../../tests/cli-test-queries.md) — 130+ test scenarios for the CLI
- [API Reference](../reference/API.md) — SDK API documentation
- [Core Concepts](CORE_CONCEPTS.md) — Agent architecture
- [Features Guide](FEATURES.md) — All SDK features
