# CLI Test Queries

Comprehensive test playbook for the tawk-cli. Copy-paste these queries into the REPL to exercise every feature.

## Quick Start

```bash
npm run cli
# Select a model (recommended: openai:gpt-4o-mini for speed, anthropic:claude-sonnet-4-5 for quality)
# Enable verbose for debugging: /verbose
```

**Requirements:**
- At least one API key set (OPENAI_API_KEY, ANTHROPIC_API_KEY, GROQ_API_KEY, or GOOGLE_GENERATIVE_AI_API_KEY)
- Node.js 18+
- Built SDK: `npm run build:check`

---

## 1. Tool Testing

### 1.1 Individual Tools (10 queries)

Each query should trigger exactly one tool.

```
what time is it?
```
> Expected: `current_time` tool called. Returns ISO timestamp, local time, timezone, unix.

```
calculate 17 * 43 + (89 / 3)
```
> Expected: `calculator` tool. Result: ~760.67

```
read the file package.json and tell me the version
```
> Expected: `read_file` tool with path `package.json`. Returns version `3.0.0`.

```
list all files in the src/core directory
```
> Expected: `list_files` tool. Shows agent/, execution.ts, runner.ts, etc.

```
write "hello world" to /tmp/tawk-test.txt
```
> Expected: `write_file` tool. **Permission prompt** appears (dangerous tool). Accept with Y.

```
run the command: ls -la src/
```
> Expected: `shell_exec` tool. **Permission prompt** appears. Accept with Y.

```
fetch the content from https://httpbin.org/json
```
> Expected: `web_fetch` tool. Returns JSON with slideshow data.

```
parse this JSON: {"users":[{"name":"Alice","age":30},{"name":"Bob","age":25}]}
```
> Expected: `json_parse` tool. Returns parsed object with 2 users.

```
generate a UUID for me
```
> Expected: `generate_uuid` tool. Returns UUID v4 format (8-4-4-4-12).

```
wait 2 seconds then tell me the time
```
> Expected: `sleep` tool (2000ms), then `current_time` tool.

### 1.2 Multi-Tool Chains (5 queries)

Each query requires output from one tool to feed into another.

```
read package.json, extract the version number, then calculate the major version times 100
```
> Expected: `read_file` -> agent parses version "3.0.0" -> `calculator` with `3 * 100` = 300

```
list files in src/core, then read the smallest one and summarize it
```
> Expected: `list_files` -> identifies smallest file -> `read_file` -> text summary

```
run "node --version" and "npm --version", then tell me both
```
> Expected: `shell_exec` x2 (may be parallel). Reports both versions.

```
fetch https://httpbin.org/uuid and parse the JSON response
```
> Expected: `web_fetch` -> `json_parse`. Returns parsed UUID object.

```
generate 3 UUIDs and write them to /tmp/uuids.txt, one per line
```
> Expected: `generate_uuid` x3 -> `write_file`. Permission prompt for write_file.

### 1.3 Parallel Tool Calls (3 queries)

These should trigger multiple tools simultaneously.

```
what time is it, what's 99 * 101, and generate a UUID - all at once
```
> Expected: 3 tools called in parallel: `current_time`, `calculator` (9999), `generate_uuid`

```
list files in src/, src/core/, and src/helpers/ simultaneously
```
> Expected: 3 `list_files` calls in parallel

```
read package.json, README.md, and CHANGELOG.md at the same time and compare their sizes
```
> Expected: 3 `read_file` calls in parallel, then size comparison

### 1.4 Tool Errors (7 queries)

Each should produce a graceful error, not crash the CLI.

```
read the file /etc/shadow
```
> Expected: Path traversal blocked. Error message about path outside allowed directory.

```
read nonexistent-file-xyz.ts
```
> Expected: File not found error. Agent should report it gracefully.

```
calculate require("fs").readFileSync("/etc/passwd")
```
> Expected: Expression rejected (unsafe). Calculator only allows math expressions.

```
fetch http://169.254.169.254/latest/meta-data/
```
> Expected: SSRF protection blocks private/metadata IP.

```
fetch https://thisdoesnotexist99999.com
```
> Expected: Network error (DNS resolution failure). Handled gracefully.

```
parse this JSON: {invalid json!!!}
```
> Expected: JSON parse error. Returns error message, no crash.

```
calculate 1/0
```
> Expected: Returns Infinity or error message about division by zero.

---

## 2. Subagent Transfers

### 2.1 Trigger Coder (3 queries)

These should cause the main agent to transfer to the Coder subagent.

```
create a new file called /tmp/hello.ts with a function that returns "hello world"
```
> Expected: Transfer to Coder. Uses `write_file` tool. Permission prompt for write.

```
find all TODO comments in the src/ directory using shell grep
```
> Expected: Transfer to Coder. Uses `shell_exec` with `grep -r "TODO" src/`. Permission prompt.

```
write a simple bash script that lists all .ts files in src/ and counts them, save to /tmp/count.sh and run it
```
> Expected: Transfer to Coder. Multiple tools: `write_file` + `shell_exec`. Two permission prompts.

### 2.2 Trigger Researcher (3 queries)

```
analyze the src/ directory and provide me a summary of the codebase
```
> Expected: Transfer to Researcher. Multiple `list_files` + `read_file` calls. No permission prompts.

```
read all the files in docs/guides/ and tell me which topics are covered
```
> Expected: Transfer to Researcher. `list_files` then multiple `read_file`.

```
compare the package.json dependencies with what's actually imported in src/index.ts
```
> Expected: Transfer to Researcher. Reads both files, cross-references.

### 2.3 Trigger Analyst (3 queries)

```
read package.json and calculate the total number of dependencies plus devDependencies. What percentage are @ai-sdk packages?
```
> Expected: Transfer to Analyst. `read_file` + `calculator` for percentages.

```
analyze the file sizes in src/core/ - which files are largest? Calculate the average
```
> Expected: Transfer to Analyst. `list_files` (sizes) + `calculator`.

```
read CHANGELOG.md and count how many features vs fixes vs breaking changes are in v3.0.0
```
> Expected: Transfer to Analyst. `read_file` + analysis + `calculator`.

### 2.4 Should NOT Transfer (4 queries)

These should be handled directly by the main agent.

```
hello, how are you?
```
> Expected: Direct response. No tool calls. No transfers.

```
what is TypeScript?
```
> Expected: Direct response from main agent knowledge.

```
what time is it?
```
> Expected: `current_time` tool called by main agent directly, no transfer.

```
generate a UUID
```
> Expected: `generate_uuid` by main agent directly.

### 2.5 Multi-Hop Transfer (1 query)

```
research what files exist in src/tools/, then analyze the code patterns used across them, and finally write a summary to /tmp/tools-report.md
```
> Expected: Main -> Researcher (explore files) -> may return to Main -> Analyst or Coder. Watch handoff chain in verbose mode.

---

## 3. Multi-Turn Context

### 3.1 Context Retention (run sequentially)

```
my name is Alice and I'm working on the authentication module
```
> Expected: Acknowledges name and project.

```
what's my name?
```
> Expected: "Alice" - proves context retained.

```
what module am I working on?
```
> Expected: "authentication" - proves multi-turn memory.

```
read src/index.ts and tell me if it exports anything related to what I'm working on
```
> Expected: Reads file and relates it to "authentication" context from earlier turns.

```
based on everything we've discussed, summarize our conversation
```
> Expected: Accurate summary mentioning Alice, auth module, and file analysis.

### 3.2 Session Reset (run sequentially)

```
remember the number 42
```
> Expected: Confirms it remembers 42.

```
what number did I tell you?
```
> Expected: "42"

Now run: `/session new`

```
what number did I tell you?
```
> Expected: Should NOT know the number. Context was cleared.

### 3.3 History Verification

After several turns, run:
```
/history
```
> Expected: Shows all user/assistant messages from current session.

---

## 4. Slash Commands

### 4.1 Information Commands

```
/help
```
> Expected: Lists all available commands.

```
/tools
```
> Expected: Lists all 13 tools (10 + 3 transfer_to_*) for default agent.

```
/agent
```
> Expected: Shows current agent name, description, tool count.

```
/model
```
> Expected: Shows current model string.

```
/session
```
> Expected: Shows session ID, turn count.

```
/history
```
> Expected: Shows message history (may be empty if first command).

```
/usage
```
> Expected: Shows token usage, tool calls, duration, cost estimate.

```
/config
```
> Expected: Shows current configuration (agent, model, verbose, maxTurns, etc.)

```
/system
```
> Expected: Shows current system prompt.

### 4.2 State Modification Commands

```
/verbose
```
> Expected: Toggles verbose mode ON. Shows raw tool args/results.

```
/verbose
```
> Expected: Toggles verbose mode OFF.

```
/session new
```
> Expected: Creates new session ID. Resets turn count and usage.

```
/clear
```
> Expected: Clears session history. Same session ID.

### 4.3 Agent Switching

```
/agent coder
```
> Expected: Switches to Coder preset (5 tools). Clears session.

```
/tools
```
> Expected: Shows 5 tools: shell_exec, read_file, write_file, list_files, current_time

```
/agent researcher
```
> Expected: Switches to Researcher (5 tools). Clears session.

```
/tools
```
> Expected: Shows 5 tools: web_fetch, read_file, list_files, calculator, current_time

```
/agent minimal
```
> Expected: Switches to Minimal (10 tools, no subagents).

```
/agent default
```
> Expected: Back to default (13 tools including transfers).

```
/agent nonexistent
```
> Expected: Error message about unknown preset.

### 4.4 Model Switching

```
/model openai:gpt-4o-mini
```
> Expected: Model switched. Confirmation message.

```
/model
```
> Expected: Shows "openai:gpt-4o-mini"

```
/model anthropic:claude-sonnet-4-5
```
> Expected: Model switched (requires ANTHROPIC_API_KEY).

### 4.5 System Prompt

```
/system set You are a pirate who speaks only in nautical terms. End every sentence with "arrr!"
```
> Expected: System prompt updated.

```
hello, how are you?
```
> Expected: Response in pirate speak.

```
/system reset
```
> Expected: System prompt cleared back to default.

### 4.6 Config Commands

```
/config set maxTurns 10
```
> Expected: maxTurns updated to 10.

```
/config
```
> Expected: Shows maxTurns: 10

### 4.7 Exit

```
/quit
```
> Expected: CLI exits cleanly. (Also test: `/exit`, `/q`)

---

## 5. Streaming & Rendering

### 5.1 Long Streaming Text

```
write a detailed 500-word essay about the history of computing from the 1940s to today
```
> Expected: Long streaming text. Watch for smooth character-by-character rendering. No flickering.

### 5.2 Tool-Heavy Response

```
read every .ts file in src/helpers/ and explain each one in 2 sentences
```
> Expected: Multiple tool calls (5 read_file). Tool spinner shows for each. Results displayed inline.

### 5.3 Very Short Response

```
say "ok"
```
> Expected: Near-instant response. No unnecessary delay.

### 5.4 Sustained Multi-Tool Stream

```
list all files in src/, then read the 3 largest ones, then summarize each one in a single sentence
```
> Expected: Sequential tool calls with streaming text between them. Should handle cleanly without buffering issues.

---

## 6. Permission System

### 6.1 Accept Permission

```
run the command: echo "hello from shell"
```
> Expected: `[shell_exec] Run: echo "hello from shell"? [Y/n]` — Type `Y` or press Enter. Output: "hello from shell"

### 6.2 Accept Write Permission

```
write "test content" to /tmp/perm-test.txt
```
> Expected: `[write_file] Write to /tmp/perm-test.txt? [Y/n]` — Accept. File created.

### 6.3 Deny Permission

```
run the command: rm -rf /tmp/tawk-test-*
```
> Expected: Permission prompt appears. Type `n`. Get "User denied permission for shell_exec" error. Agent handles gracefully.

### 6.4 Multiple Permissions in One Turn

```
write "line 1" to /tmp/multi-1.txt and write "line 2" to /tmp/multi-2.txt and run echo "done"
```
> Expected: Up to 3 permission prompts (2 write_file + 1 shell_exec). Prompts are serialized (no overlap).

---

## 7. Error Handling

### 7.1 Path Traversal

```
read ../../../../etc/passwd
```
> Expected: "Path traversal detected" or similar. No file content returned.

### 7.2 SSRF Protection

```
fetch http://localhost:3000/api/secret
```
> Expected: Blocked — private/reserved address.

```
fetch http://10.0.0.1/internal
```
> Expected: Blocked — private IP range.

### 7.3 Unsafe Expressions

```
calculate eval("process.exit(1)")
```
> Expected: Rejected — only math expressions allowed.

```
calculate process.env.SECRET_KEY
```
> Expected: Rejected.

### 7.4 Empty/Invalid Args

```
write "" to ""
```
> Expected: Error about empty path. No crash.

```
read
```
> Expected: Agent asks for a file path, or tool returns error about missing arg.

### 7.5 Model Errors

First switch to a bad model:
```
/model openai:nonexistent-model-xyz
```
Then:
```
hello
```
> Expected: API error (model not found). Error displayed cleanly. CLI stays alive.

Switch back:
```
/model openai:gpt-4o-mini
```

---

## 8. Edge Cases

### 8.1 Empty Input

Just press Enter without typing anything.
> Expected: No error. Prompt re-appears. No API call.

### 8.2 Whitespace Only

```

```
> Expected: Treated as empty. No API call.

### 8.3 Unicode

```
explain these characters: Chinese hanzi, Japanese kanji, Korean hangul, Arabic, and Hindi
```
> Expected: Handles unicode in both input and output correctly.

### 8.4 Special Characters

```
what does the regex ^[\d\s+\-*/().%^]+$ match?
```
> Expected: Explains the regex without interpreting special chars as commands.

### 8.5 Markdown in Input

```
explain this code: `const x: Record<string, number> = { a: 1 }`
```
> Expected: Backticks and angle brackets handled correctly.

### 8.6 Bash Passthrough

```
!ls -la
```
> Expected: Runs `ls -la` directly in shell. Output displayed. No agent call.

```
!echo "hello from bash passthrough"
```
> Expected: Prints "hello from bash passthrough"

```
!nonexistent-command-xyz-123
```
> Expected: Shell error (command not found). CLI stays alive.

### 8.7 Rapid Questions (run these quickly one after another)

```
what is 1+1
```
```
what is 2+2
```
```
what is 3+3
```
> Expected: Each gets a separate response. No interleaving or corruption.

---

## 9. Multi-Provider Testing

Use the same query across different providers. Switch with `/model` between each.

**Canonical test query:**
```
read package.json and tell me the project name, version, and count of dependencies
```

**Providers to test:**
```
/model openai:gpt-4o-mini
```
> Run query. Expected: Uses read_file, provides name/version/count.

```
/model openai:gpt-4o
```
> Run query. Expected: Same behavior, possibly more detailed.

```
/model anthropic:claude-sonnet-4-5
```
> Run query. Expected: Same. No "Multiple system messages" error.

```
/model groq:llama-3.3-70b-versatile
```
> Run query. Expected: Same. May be less reliable with tool use.

```
/model google:gemini-2.0-flash
```
> Run query. Expected: Same (requires GOOGLE_GENERATIVE_AI_API_KEY).

---

## 10. Agent Presets

### 10.1 Default Agent (full power)

```
/agent default
```
```
research the src/ directory structure and write a file size report to /tmp/report.txt
```
> Expected: Transfers to Researcher or Coder. Multiple tool calls. Permission for write.

### 10.2 Minimal Agent (no subagents)

```
/agent minimal
```
```
read package.json and calculate total dependencies
```
> Expected: Uses read_file + calculator directly. NO transfer (no subagents available).

```
/tools
```
> Expected: 10 tools only. No transfer_to_* tools.

### 10.3 Coder Agent (focused)

```
/agent coder
```
```
list the files in src/core and read the index.ts
```
> Expected: Uses list_files + read_file. Only has: shell_exec, read_file, write_file, list_files, current_time.

```
calculate 2+2
```
> Expected: No calculator tool available. Agent should answer from knowledge or admit it can't use a calculator.

### 10.4 Researcher Agent (focused)

```
/agent researcher
```
```
fetch https://httpbin.org/json and calculate how many items are in the slideshow
```
> Expected: Uses web_fetch + calculator. Has: web_fetch, read_file, list_files, calculator, current_time.

```
write "hello" to /tmp/test.txt
```
> Expected: No write_file tool. Agent should say it can't write files.

### Reset to default:
```
/agent default
```

---

## 11. Multi-Line Input

### 11.1 Backslash Continuation

```
tell me about \
the history of \
TypeScript in \
three paragraphs
```
> Expected: Treated as single message. Multi-paragraph response about TypeScript history.

### 11.2 Block Mode

```
"""
Write a function in TypeScript that:
1. Takes an array of numbers
2. Filters out negative numbers
3. Squares the remaining numbers
4. Returns the sum

Just show the code, no explanation.
"""
```
> Expected: Treated as single message. Returns TypeScript function.

### 11.3 Empty Block

```
"""
"""
```
> Expected: Treated as empty input. No API call or graceful handling.

---

## 12. MCP Integration

> Requires MCP server configuration. Skip if not set up.

### 12.1 Add MCP Server

```
/mcp add filesystem npx -y @modelcontextprotocol/server-filesystem /tmp
```
> Expected: MCP server connected. Tools available.

### 12.2 List MCP Tools

```
/mcp
```
> Expected: Shows connected MCP servers and their tools.

### 12.3 Use MCP Tool

```
list files in /tmp using the filesystem tools
```
> Expected: Uses MCP-provided filesystem tool.

### 12.4 Remove MCP Server

```
/mcp remove filesystem
```
> Expected: Server disconnected. Tools removed.

---

## 13. Config System

### 13.1 View Config

```
/config
```
> Expected: Shows all current settings (agent, model, verbose, maxTurns, etc.)

### 13.2 Modify Config

```
/config set maxTurns 5
```
> Expected: maxTurns set to 5. Verify with `/config`.

```
/config set verbose true
```
> Expected: Verbose enabled. Verify with `/config`.

### 13.3 Reset

```
/config set maxTurns 50
```
> Expected: Back to default.

---

## 14. Production Stress Tests

These are complex, multi-step scenarios that exercise multiple features simultaneously.

### Scenario A: Full Codebase Analysis

```
analyze the entire src/ directory structure. For each subdirectory, list the files, read the index.ts file if it exists, and list all exports. Then tell me which module has the most exports.
```
> Expected: Multiple transfers possible (Researcher + Analyst). Heavy tool use (10+ calls). Should complete in ~60-90s with gpt-4o-mini.

### Scenario B: Multi-Step Code Task

```
read src/core/agent/agent-class.ts, find all the public methods on the Agent class, and for each method write a one-line description. Then calculate the total number of methods.
```
> Expected: `read_file` + analysis + `calculator`. May transfer to Analyst.

### Scenario C: Research + Analysis Pipeline

```
fetch https://httpbin.org/json and https://httpbin.org/headers, parse both JSON responses, and tell me which response has more top-level keys
```
> Expected: `web_fetch` x2 (parallel) + `json_parse` x2 + `calculator`. Multi-tool chain.

### Scenario D: Rapid Multi-Turn Investigation (run sequentially)

```
list files in src/
```
```
which of those is the largest directory?
```
```
list files in that directory
```
```
read the largest file there
```
```
summarize it in 3 bullet points
```
```
write that summary to /tmp/summary.md
```
> Expected: 6-turn conversation with context carryover. Each turn builds on previous. Final write needs permission.

### Scenario E: Error Recovery

```
read the file src/nonexistent.ts, and if it doesn't exist, read src/index.ts instead and tell me how many lines it has
```
> Expected: First read_file fails. Agent recovers, reads src/index.ts, counts lines.

### Scenario F: Complex Transfer Chain

```
I need you to: 1) research what guardrails are available in the SDK by reading the guardrails source code, 2) analyze which ones use LLM calls vs regex, and 3) write a comparison table to /tmp/guardrails-comparison.md
```
> Expected: Main -> Researcher (reads files) -> possibly Analyst (comparison) -> Coder (write file). Watch handoff chain with `/verbose`.

### Scenario G: Token-Heavy Conversation

After 10+ turns of conversation:
```
/usage
```
> Expected: Shows accumulated tokens, tool calls, duration, and cost estimate. Verify numbers are reasonable.

### Scenario H: All Tools in One Turn

```
give me: the current time, 42 * 37 calculated, a new UUID, the contents of package.json, a list of files in src/, and parse this JSON: {"test": true}
```
> Expected: 6 tools called (many in parallel). All results returned in a single response. No crashes.

---

## 15. Regression Checks

These verify specific bugs that were fixed.

### 15.1 Anthropic Multiple System Messages

```
/model anthropic:claude-sonnet-4-5
```
```
hello
```
> Expected: Works without "Multiple system messages not supported" error.

### 15.2 Session New Creates Fresh Instance

```
/session
```
Note the session ID.
```
/session new
```
```
/session
```
> Expected: Different session ID. Turn count reset to 0.

### 15.3 Private Field Access

```
/tools
```
> Expected: Lists tools correctly without "Cannot read property 'tools' of undefined" error.

### 15.4 Permission Mutex

```
list files in src/ and also run echo "test"
```
> Expected: If both tool calls happen, permission prompts appear one at a time (not overlapping).

---

## Checklist

Use this to track your testing progress:

- [ ] Section 1: Tool Testing (30 queries)
- [ ] Section 2: Subagent Transfers (15 queries)
- [ ] Section 3: Multi-Turn Context (10 queries)
- [ ] Section 4: Slash Commands (20+ commands)
- [ ] Section 5: Streaming & Rendering (5 queries)
- [ ] Section 6: Permission System (5 queries)
- [ ] Section 7: Error Handling (8 queries)
- [ ] Section 8: Edge Cases (8 queries)
- [ ] Section 9: Multi-Provider (5 providers)
- [ ] Section 10: Agent Presets (4 presets)
- [ ] Section 11: Multi-Line Input (3 queries)
- [ ] Section 12: MCP Integration (4 queries)
- [ ] Section 13: Config System (3 queries)
- [ ] Section 14: Production Stress Tests (8 scenarios)
- [ ] Section 15: Regression Checks (4 checks)

**Total: ~130+ test queries across 15 categories**
