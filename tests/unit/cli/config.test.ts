import * as fs from 'fs';
import * as path from 'path';
import { loadSettings, saveSetting, saveProjectSetting, getConfigPaths, formatConfig, resolveSystemPrompt } from '../../../bin/cli/config';

// Use a temp directory for tests
const TEST_DIR = path.join(__dirname, '__config_test_tmp__');
const TAWK_DIR = path.join(TEST_DIR, '.tawk');

beforeEach(() => {
  fs.mkdirSync(TAWK_DIR, { recursive: true });
  jest.spyOn(process, 'cwd').mockReturnValue(TEST_DIR);
  // Clear env vars
  delete process.env.TAWK_CLI_MODEL;
  delete process.env.TAWK_CLI_AGENT;
});

afterEach(() => {
  jest.restoreAllMocks();
  fs.rmSync(TEST_DIR, { recursive: true, force: true });
});

describe('getConfigPaths', () => {
  it('should return paths relative to cwd', () => {
    const paths = getConfigPaths();
    expect(paths.projectDir).toBe(TAWK_DIR);
    expect(paths.project).toBe(path.join(TAWK_DIR, 'settings.json'));
    expect(paths.local).toBe(path.join(TAWK_DIR, 'settings.local.json'));
  });
});

describe('loadSettings', () => {
  it('should return defaults when no config files exist', () => {
    // Remove the .tawk dir so no files exist
    fs.rmSync(TAWK_DIR, { recursive: true, force: true });
    const config = loadSettings();
    expect(config.agent).toBe('default');
    expect(config.verbose).toBe(false);
    expect(config.maxTurns).toBe(50);
    expect(config.model).toBeUndefined();
  });

  it('should load from project settings', () => {
    fs.writeFileSync(
      path.join(TAWK_DIR, 'settings.json'),
      JSON.stringify({ model: 'openai:gpt-4o', verbose: true })
    );
    const config = loadSettings();
    expect(config.model).toBe('openai:gpt-4o');
    expect(config.verbose).toBe(true);
    expect(config.sources.model).toBe('project');
  });

  it('should override project with local settings', () => {
    fs.writeFileSync(
      path.join(TAWK_DIR, 'settings.json'),
      JSON.stringify({ model: 'openai:gpt-4o' })
    );
    fs.writeFileSync(
      path.join(TAWK_DIR, 'settings.local.json'),
      JSON.stringify({ model: 'anthropic:claude-sonnet-4-5' })
    );
    const config = loadSettings();
    expect(config.model).toBe('anthropic:claude-sonnet-4-5');
    expect(config.sources.model).toBe('local');
  });

  it('should override with env vars', () => {
    fs.writeFileSync(
      path.join(TAWK_DIR, 'settings.json'),
      JSON.stringify({ model: 'openai:gpt-4o' })
    );
    process.env.TAWK_CLI_MODEL = 'groq:llama-3.3-70b-versatile';
    const config = loadSettings();
    expect(config.model).toBe('groq:llama-3.3-70b-versatile');
    expect(config.sources.model).toBe('env');
  });
});

describe('saveSetting', () => {
  it('should save to settings.local.json', () => {
    saveSetting('model', 'openai:gpt-4o');
    const raw = fs.readFileSync(path.join(TAWK_DIR, 'settings.local.json'), 'utf-8');
    const parsed = JSON.parse(raw);
    expect(parsed.model).toBe('openai:gpt-4o');
  });

  it('should merge with existing local settings', () => {
    fs.writeFileSync(
      path.join(TAWK_DIR, 'settings.local.json'),
      JSON.stringify({ verbose: true })
    );
    saveSetting('model', 'openai:gpt-4o');
    const raw = fs.readFileSync(path.join(TAWK_DIR, 'settings.local.json'), 'utf-8');
    const parsed = JSON.parse(raw);
    expect(parsed.verbose).toBe(true);
    expect(parsed.model).toBe('openai:gpt-4o');
  });
});

describe('saveProjectSetting', () => {
  it('should save to settings.json', () => {
    saveProjectSetting('agent', 'coder');
    const raw = fs.readFileSync(path.join(TAWK_DIR, 'settings.json'), 'utf-8');
    const parsed = JSON.parse(raw);
    expect(parsed.agent).toBe('coder');
  });
});

describe('resolveSystemPrompt', () => {
  it('should return systemPrompt directly', () => {
    expect(resolveSystemPrompt({ systemPrompt: 'Hello' })).toBe('Hello');
  });

  it('should read from systemPromptFile', () => {
    const promptFile = path.join(TEST_DIR, 'prompt.txt');
    fs.writeFileSync(promptFile, 'Custom prompt');
    expect(resolveSystemPrompt({ systemPromptFile: 'prompt.txt' })).toBe('Custom prompt');
  });

  it('should return undefined for missing file', () => {
    expect(resolveSystemPrompt({ systemPromptFile: 'nonexistent.txt' })).toBeUndefined();
  });
});

describe('formatConfig', () => {
  it('should format config with sources', () => {
    const config = {
      model: 'openai:gpt-4o',
      agent: 'default',
      verbose: false,
      maxTurns: 50,
      sources: { model: 'project' as const, agent: 'default' as const, verbose: 'default' as const, maxTurns: 'default' as const },
    };
    const output = formatConfig(config);
    expect(output).toContain('model: openai:gpt-4o');
    expect(output).toContain('(project)');
    expect(output).toContain('agent: default');
  });
});
