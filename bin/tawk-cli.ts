#!/usr/bin/env npx tsx
/**
 * tawk-cli — Interactive CLI for testing Tawk Agents SDK
 *
 * Usage:
 *   npm run cli
 *   npm run cli -- --model anthropic:claude-sonnet-4-5
 *   npm run cli -- --agent multi-research --verbose
 *   npm run cli -- --system-prompt "You are a pirate" --model openai:gpt-4o
 */

import 'dotenv/config';
import pc from 'picocolors';
import { runStartup, printBanner } from './cli/startup';
import { startRepl } from './cli/repl';

async function main(): Promise<void> {
  const { state, rendererRef } = await runStartup(process.argv);
  printBanner(state);
  await startRepl(state, rendererRef);
}

main().catch((err) => {
  console.error(pc.red(`Fatal error: ${err.message}`));
  if (err.stack) console.error(pc.dim(err.stack));
  process.exit(1);
});
