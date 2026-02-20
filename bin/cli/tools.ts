/**
 * Built-in CLI tools for tawk-cli
 *
 * 10 tools that showcase the SDK's tool system with practical utility.
 */

import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { randomUUID } from 'crypto';
import { tool, safeFetchText } from '../../src';
import type { CoreTool } from '../../src';

// ============================================
// PATH SAFETY
// ============================================

/**
 * Resolve a user-provided path and verify it stays within CWD.
 * Throws on path traversal attempts.
 */
function resolveSafePath(userPath: string): string {
  const cwd = process.cwd();
  const resolved = path.resolve(cwd, userPath);
  if (!resolved.startsWith(cwd + path.sep) && resolved !== cwd) {
    throw new Error('Path traversal outside working directory is not allowed');
  }
  return resolved;
}

// ============================================
// TOOL DEFINITIONS
// ============================================

const currentTime = tool({
  description: 'Get the current date, time, and timezone',
  inputSchema: z.object({}),
  execute: async () => {
    const now = new Date();
    return {
      iso: now.toISOString(),
      local: now.toLocaleString(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      unix: Math.floor(now.getTime() / 1000),
    };
  },
});

const calculator = tool({
  description: 'Evaluate a mathematical expression safely',
  inputSchema: z.object({
    expression: z.string().describe('Mathematical expression (e.g. "2 + 3 * 4")'),
  }),
  execute: async ({ expression }: { expression: string }) => {
    // Whitelist: digits, operators, parens, spaces, decimal points only
    if (!/^[\d\s+\-*/().%^]+$/.test(expression)) {
      return { error: 'Invalid expression. Only numbers and operators (+, -, *, /, ^, %, .) allowed.' };
    }
    // Block alphabetic chars that could sneak through via unicode
    if (/[a-zA-Z_$]/.test(expression)) {
      return { error: 'Variables and identifiers are not allowed.' };
    }
    try {
      // Replace ^ with ** for exponentiation
      const sanitized = expression.replace(/\^/g, '**');
      const result = new Function(`"use strict"; return (${sanitized})`)();
      if (typeof result !== 'number' || !isFinite(result)) {
        return { error: 'Expression did not evaluate to a finite number.' };
      }
      return { expression, result };
    } catch (err: any) {
      return { error: `Evaluation failed: ${err.message}` };
    }
  },
});

const readFile = tool({
  description: 'Read the contents of a file (relative to current working directory, max 50KB)',
  inputSchema: z.object({
    path: z.string().describe('File path relative to CWD'),
  }),
  execute: async ({ path: filePath }: { path: string }) => {
    try {
      const resolved = resolveSafePath(filePath);
      const stat = fs.statSync(resolved);
      if (stat.size > 50 * 1024) {
        return { error: `File too large: ${(stat.size / 1024).toFixed(1)}KB (max 50KB)` };
      }
      const content = fs.readFileSync(resolved, 'utf-8');
      return { path: filePath, size: stat.size, content };
    } catch (err: any) {
      return { error: `Failed to read file: ${err.message}` };
    }
  },
});

const writeFile = tool({
  description: 'Write content to a file (creates parent directories if needed)',
  inputSchema: z.object({
    path: z.string().describe('File path relative to CWD'),
    content: z.string().describe('Content to write'),
  }),
  execute: async ({ path: filePath, content }: { path: string; content: string }) => {
    try {
      const resolved = resolveSafePath(filePath);
      fs.mkdirSync(path.dirname(resolved), { recursive: true });
      fs.writeFileSync(resolved, content, 'utf-8');
      return { path: filePath, bytesWritten: Buffer.byteLength(content, 'utf-8') };
    } catch (err: any) {
      return { error: `Failed to write file: ${err.message}` };
    }
  },
});

const listFiles = tool({
  description: 'List files and directories in a path with size and type info',
  inputSchema: z.object({
    path: z.string().describe('Directory path relative to CWD').default('.'),
  }),
  execute: async ({ path: dirPath }: { path: string }) => {
    try {
      const resolved = resolveSafePath(dirPath);
      const entries = fs.readdirSync(resolved, { withFileTypes: true });
      const items = entries.map((entry) => {
        const fullPath = path.join(resolved, entry.name);
        try {
          const stat = fs.statSync(fullPath);
          return {
            name: entry.name,
            type: entry.isDirectory() ? 'directory' : 'file',
            size: entry.isFile() ? stat.size : undefined,
          };
        } catch {
          return { name: entry.name, type: 'unknown' };
        }
      });
      return { path: dirPath, count: items.length, items };
    } catch (err: any) {
      return { error: `Failed to list directory: ${err.message}` };
    }
  },
});

const shellExec = tool({
  description: 'Execute a shell command (30s timeout, 1MB output limit)',
  inputSchema: z.object({
    command: z.string().describe('Shell command to execute'),
  }),
  execute: async ({ command }: { command: string }) => {
    try {
      // Strip sensitive env vars from child process
      const safeEnv = { ...process.env };
      for (const key of Object.keys(safeEnv)) {
        if (/key|secret|token|password|credential/i.test(key)) {
          delete safeEnv[key];
        }
      }
      const output = execSync(command, {
        timeout: 30_000,
        maxBuffer: 1024 * 1024,
        encoding: 'utf-8',
        cwd: process.cwd(),
        env: safeEnv,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      return { command, exitCode: 0, output: output.trim() };
    } catch (err: any) {
      return {
        command,
        exitCode: err.status ?? 1,
        output: (err.stdout || '').trim(),
        error: (err.stderr || err.message || '').trim(),
      };
    }
  },
});

const webFetch = tool({
  description: 'Fetch the content of a URL (SSRF-safe, max 5KB response)',
  inputSchema: z.object({
    url: z.string().url().describe('URL to fetch'),
  }),
  execute: async ({ url }: { url: string }) => {
    try {
      const text = await safeFetchText(url, {
        timeoutMs: 15_000,
        maxResponseBytes: 5 * 1024,
        allowHttp: true,
      });
      return { url, length: text.length, content: text };
    } catch (err: any) {
      return { error: `Fetch failed: ${err.message}` };
    }
  },
});

const jsonParse = tool({
  description: 'Parse a JSON string and return formatted output',
  inputSchema: z.object({
    json: z.string().describe('JSON string to parse'),
  }),
  execute: async ({ json }: { json: string }) => {
    try {
      const parsed = JSON.parse(json);
      return { formatted: JSON.stringify(parsed, null, 2) };
    } catch (err: any) {
      return { error: `Invalid JSON: ${err.message}` };
    }
  },
});

const generateUuid = tool({
  description: 'Generate a random UUID v4',
  inputSchema: z.object({}),
  execute: async () => {
    return { uuid: randomUUID() };
  },
});

const sleep = tool({
  description: 'Wait for a specified number of milliseconds (max 30 seconds)',
  inputSchema: z.object({
    ms: z.number().min(0).max(30_000).describe('Milliseconds to wait'),
  }),
  execute: async ({ ms }: { ms: number }) => {
    const clamped = Math.min(ms, 30_000);
    await new Promise((resolve) => setTimeout(resolve, clamped));
    return { slept: clamped };
  },
});

// ============================================
// TOOL REGISTRY
// ============================================

export const ALL_TOOLS: Record<string, CoreTool> = {
  current_time: currentTime,
  calculator,
  read_file: readFile,
  write_file: writeFile,
  list_files: listFiles,
  shell_exec: shellExec,
  web_fetch: webFetch,
  json_parse: jsonParse,
  generate_uuid: generateUuid,
  sleep,
};

/**
 * Get a subset of tools by name
 */
export function getTools(names: string[]): Record<string, CoreTool> {
  const result: Record<string, CoreTool> = {};
  for (const name of names) {
    if (ALL_TOOLS[name]) {
      result[name] = ALL_TOOLS[name];
    }
  }
  return result;
}

/**
 * Get all tool names and descriptions
 */
export function getToolDescriptions(): { name: string; description: string }[] {
  return Object.entries(ALL_TOOLS).map(([name, t]) => ({
    name,
    description: t.description,
  }));
}

// Export for testing
export { resolveSafePath };
