/**
 * Configuration system for tawk-cli
 *
 * Loads settings from:
 *   .tawk/settings.json       — project settings (committed)
 *   .tawk/settings.local.json — local overrides (gitignored)
 *   Environment variables      — TAWK_CLI_MODEL, TAWK_CLI_AGENT
 *   CLI flags                  — highest priority
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================
// TYPES
// ============================================

export interface TawkConfig {
  model?: string;
  agent?: string;
  verbose?: boolean;
  maxTurns?: number;
  systemPrompt?: string;
  systemPromptFile?: string;
}

export interface ResolvedConfig extends TawkConfig {
  /** Where each value came from */
  sources: Record<string, 'project' | 'local' | 'env' | 'flag' | 'default'>;
}

// ============================================
// PATHS
// ============================================

const PROJECT_DIR = '.tawk';
const SETTINGS_FILE = 'settings.json';
const LOCAL_FILE = 'settings.local.json';

export function getConfigPaths(): { projectDir: string; project: string; local: string } {
  const cwd = process.cwd();
  const projectDir = path.join(cwd, PROJECT_DIR);
  return {
    projectDir,
    project: path.join(projectDir, SETTINGS_FILE),
    local: path.join(projectDir, LOCAL_FILE),
  };
}

// ============================================
// LOADING
// ============================================

function readJsonFile(filePath: string): Record<string, any> | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Load and merge settings from all sources.
 * Priority: defaults → project → local → env vars
 * (CLI flags are applied separately by the caller)
 */
export function loadSettings(): ResolvedConfig {
  const paths = getConfigPaths();
  const sources: Record<string, 'project' | 'local' | 'env' | 'flag' | 'default'> = {};

  // Defaults
  const config: TawkConfig = {
    agent: 'default',
    verbose: false,
    maxTurns: 50,
  };
  sources.agent = 'default';
  sources.verbose = 'default';
  sources.maxTurns = 'default';

  // Project settings
  const project = readJsonFile(paths.project);
  if (project) {
    for (const [key, value] of Object.entries(project)) {
      if (value !== undefined && (key in config || ['model', 'systemPrompt', 'systemPromptFile'].includes(key))) {
        (config as any)[key] = value;
        sources[key] = 'project';
      }
    }
  }

  // Local overrides
  const local = readJsonFile(paths.local);
  if (local) {
    for (const [key, value] of Object.entries(local)) {
      if (value !== undefined) {
        (config as any)[key] = value;
        sources[key] = 'local';
      }
    }
  }

  // Environment variables
  if (process.env.TAWK_CLI_MODEL) {
    config.model = process.env.TAWK_CLI_MODEL;
    sources.model = 'env';
  }
  if (process.env.TAWK_CLI_AGENT) {
    config.agent = process.env.TAWK_CLI_AGENT;
    sources.agent = 'env';
  }

  return { ...config, sources };
}

// ============================================
// SAVING
// ============================================

function ensureConfigDir(): string {
  const paths = getConfigPaths();
  if (!fs.existsSync(paths.projectDir)) {
    fs.mkdirSync(paths.projectDir, { recursive: true });
  }
  return paths.projectDir;
}

/**
 * Save a setting to the project-local config (.tawk/settings.local.json).
 * Creates the file and directory if they don't exist.
 */
export function saveSetting(key: string, value: any): void {
  ensureConfigDir();
  const paths = getConfigPaths();
  const existing = readJsonFile(paths.local) || {};
  existing[key] = value;
  fs.writeFileSync(paths.local, JSON.stringify(existing, null, 2) + '\n', 'utf-8');
}

/**
 * Save a setting to the project config (.tawk/settings.json).
 */
export function saveProjectSetting(key: string, value: any): void {
  ensureConfigDir();
  const paths = getConfigPaths();
  const existing = readJsonFile(paths.project) || {};
  existing[key] = value;
  fs.writeFileSync(paths.project, JSON.stringify(existing, null, 2) + '\n', 'utf-8');
}

/**
 * Resolve systemPrompt from config — if systemPromptFile is set, read it.
 */
export function resolveSystemPrompt(config: TawkConfig): string | undefined {
  if (config.systemPromptFile) {
    const filePath = path.resolve(process.cwd(), config.systemPromptFile);
    try {
      return fs.readFileSync(filePath, 'utf-8').trim();
    } catch {
      return undefined;
    }
  }
  return config.systemPrompt;
}

/**
 * Format config for display (/config command).
 */
export function formatConfig(config: ResolvedConfig): string {
  const lines: string[] = [];
  const keys: (keyof TawkConfig)[] = ['model', 'agent', 'verbose', 'maxTurns', 'systemPrompt', 'systemPromptFile'];
  for (const key of keys) {
    const value = config[key];
    const source = config.sources[key] || 'default';
    if (value !== undefined) {
      const val = typeof value === 'string' && value.length > 60
        ? value.slice(0, 57) + '...'
        : String(value);
      lines.push(`  ${key}: ${val}  (${source})`);
    }
  }
  return lines.join('\n');
}
