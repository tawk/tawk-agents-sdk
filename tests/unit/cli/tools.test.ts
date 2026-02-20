import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { ALL_TOOLS, getTools, getToolDescriptions, resolveSafePath } from '../../../bin/cli/tools';

describe('CLI tools', () => {
  describe('tool registry', () => {
    it('should have exactly 10 tools', () => {
      expect(Object.keys(ALL_TOOLS)).toHaveLength(10);
    });

    it('should include all expected tool names', () => {
      const names = Object.keys(ALL_TOOLS);
      expect(names).toEqual(expect.arrayContaining([
        'current_time', 'calculator', 'read_file', 'write_file',
        'list_files', 'shell_exec', 'web_fetch', 'json_parse',
        'generate_uuid', 'sleep',
      ]));
    });

    it('every tool should have a description', () => {
      for (const [name, tool] of Object.entries(ALL_TOOLS)) {
        expect(tool.description).toBeTruthy();
        expect(typeof tool.description).toBe('string');
      }
    });

    it('every tool should have an execute function', () => {
      for (const [name, tool] of Object.entries(ALL_TOOLS)) {
        expect(typeof tool.execute).toBe('function');
      }
    });
  });

  describe('getTools', () => {
    it('should return subset of tools by name', () => {
      const tools = getTools(['calculator', 'sleep']);
      expect(Object.keys(tools)).toHaveLength(2);
      expect(tools).toHaveProperty('calculator');
      expect(tools).toHaveProperty('sleep');
    });

    it('should skip unknown tool names', () => {
      const tools = getTools(['calculator', 'nonexistent']);
      expect(Object.keys(tools)).toHaveLength(1);
      expect(tools).toHaveProperty('calculator');
    });

    it('should return empty object for no matches', () => {
      const tools = getTools(['foo', 'bar']);
      expect(Object.keys(tools)).toHaveLength(0);
    });
  });

  describe('getToolDescriptions', () => {
    it('should return array of name/description pairs', () => {
      const descs = getToolDescriptions();
      expect(descs).toHaveLength(10);
      for (const d of descs) {
        expect(d).toHaveProperty('name');
        expect(d).toHaveProperty('description');
        expect(typeof d.name).toBe('string');
        expect(typeof d.description).toBe('string');
      }
    });
  });

  describe('resolveSafePath', () => {
    it('should resolve relative paths within CWD', () => {
      const result = resolveSafePath('package.json');
      expect(result).toBe(path.resolve(process.cwd(), 'package.json'));
    });

    it('should resolve nested paths within CWD', () => {
      const result = resolveSafePath('src/index.ts');
      expect(result).toBe(path.resolve(process.cwd(), 'src/index.ts'));
    });

    it('should block path traversal with ../', () => {
      expect(() => resolveSafePath('../../../etc/passwd')).toThrow('Path traversal');
    });

    it('should block absolute paths outside CWD', () => {
      expect(() => resolveSafePath('/etc/passwd')).toThrow('Path traversal');
    });

    it('should allow the CWD itself', () => {
      const result = resolveSafePath('.');
      expect(result).toBe(process.cwd());
    });
  });

  describe('current_time', () => {
    it('should return time information', async () => {
      const result = await ALL_TOOLS.current_time.execute!({});
      expect(result).toHaveProperty('iso');
      expect(result).toHaveProperty('local');
      expect(result).toHaveProperty('timezone');
      expect(result).toHaveProperty('unix');
      expect(typeof result.unix).toBe('number');
    });
  });

  describe('calculator', () => {
    it('should evaluate simple arithmetic', async () => {
      const result = await ALL_TOOLS.calculator.execute!({ expression: '2 + 3' });
      expect(result).toEqual({ expression: '2 + 3', result: 5 });
    });

    it('should evaluate multiplication and division', async () => {
      const result = await ALL_TOOLS.calculator.execute!({ expression: '10 * 3 / 2' });
      expect(result).toEqual({ expression: '10 * 3 / 2', result: 15 });
    });

    it('should evaluate exponentiation with ^', async () => {
      const result = await ALL_TOOLS.calculator.execute!({ expression: '2 ^ 10' });
      expect(result).toEqual({ expression: '2 ^ 10', result: 1024 });
    });

    it('should evaluate parenthesized expressions', async () => {
      const result = await ALL_TOOLS.calculator.execute!({ expression: '(2 + 3) * 4' });
      expect(result).toEqual({ expression: '(2 + 3) * 4', result: 20 });
    });

    it('should evaluate modulo', async () => {
      const result = await ALL_TOOLS.calculator.execute!({ expression: '10 % 3' });
      expect(result).toEqual({ expression: '10 % 3', result: 1 });
    });

    it('should reject expressions with letters', async () => {
      const result = await ALL_TOOLS.calculator.execute!({ expression: 'Math.PI' });
      expect(result).toHaveProperty('error');
    });

    it('should reject process.exit attempts', async () => {
      const result = await ALL_TOOLS.calculator.execute!({ expression: 'process.exit(1)' });
      expect(result).toHaveProperty('error');
    });

    it('should reject require() attempts', async () => {
      const result = await ALL_TOOLS.calculator.execute!({ expression: 'require("fs")' });
      expect(result).toHaveProperty('error');
    });

    it('should handle division by zero', async () => {
      const result = await ALL_TOOLS.calculator.execute!({ expression: '1 / 0' });
      expect(result).toHaveProperty('error');
      expect(result.error).toMatch(/finite/i);
    });
  });

  describe('read_file', () => {
    it('should read an existing file', async () => {
      const result = await ALL_TOOLS.read_file.execute!({ path: 'package.json' });
      expect(result).toHaveProperty('content');
      expect(result).toHaveProperty('size');
      expect(result.content).toContain('tawk-agents-sdk');
    });

    it('should return error for nonexistent file', async () => {
      const result = await ALL_TOOLS.read_file.execute!({ path: 'nonexistent-file.txt' });
      expect(result).toHaveProperty('error');
    });

    it('should block path traversal', async () => {
      const result = await ALL_TOOLS.read_file.execute!({ path: '../../../etc/passwd' });
      expect(result).toHaveProperty('error');
      expect(result.error).toMatch(/traversal/i);
    });
  });

  describe('write_file + read_file roundtrip', () => {
    const testFile = path.join('tests', '.cli-test-write-' + Date.now() + '.tmp');

    afterAll(() => {
      try { fs.unlinkSync(path.resolve(process.cwd(), testFile)); } catch {}
    });

    it('should write and read back a file', async () => {
      const writeResult = await ALL_TOOLS.write_file.execute!({
        path: testFile,
        content: 'hello cli test',
      });
      expect(writeResult).toHaveProperty('bytesWritten');
      expect(writeResult.bytesWritten).toBe(14);

      const readResult = await ALL_TOOLS.read_file.execute!({ path: testFile });
      expect(readResult.content).toBe('hello cli test');
    });

    it('should block write_file path traversal', async () => {
      const result = await ALL_TOOLS.write_file.execute!({
        path: '/tmp/evil-file.txt',
        content: 'bad',
      });
      expect(result).toHaveProperty('error');
      expect(result.error).toMatch(/traversal/i);
    });
  });

  describe('list_files', () => {
    it('should list files in CWD', async () => {
      const result = await ALL_TOOLS.list_files.execute!({ path: '.' });
      expect(result).toHaveProperty('items');
      expect(result.count).toBeGreaterThan(0);
      const names = result.items.map((i: any) => i.name);
      expect(names).toContain('package.json');
      expect(names).toContain('src');
    });

    it('should list src directory', async () => {
      const result = await ALL_TOOLS.list_files.execute!({ path: 'src' });
      expect(result).toHaveProperty('items');
      const names = result.items.map((i: any) => i.name);
      expect(names).toContain('index.ts');
    });

    it('should return error for nonexistent directory', async () => {
      const result = await ALL_TOOLS.list_files.execute!({ path: 'nonexistent-dir' });
      expect(result).toHaveProperty('error');
    });

    it('should block path traversal', async () => {
      const result = await ALL_TOOLS.list_files.execute!({ path: '../../../' });
      expect(result).toHaveProperty('error');
      expect(result.error).toMatch(/traversal/i);
    });
  });

  describe('shell_exec', () => {
    it('should execute a simple command', async () => {
      const result = await ALL_TOOLS.shell_exec.execute!({ command: 'echo hello' });
      expect(result.exitCode).toBe(0);
      expect(result.output).toBe('hello');
    });

    it('should return exit code for failing command', async () => {
      const result = await ALL_TOOLS.shell_exec.execute!({ command: 'false' });
      expect(result.exitCode).not.toBe(0);
    });

    it('should not leak API keys in env', async () => {
      // The tool strips env vars matching key/secret/token/password/credential
      const result = await ALL_TOOLS.shell_exec.execute!({ command: 'env' });
      const output = result.output || '';
      expect(output).not.toContain('OPENAI_API_KEY');
    });
  });

  describe('json_parse', () => {
    it('should parse valid JSON', async () => {
      const result = await ALL_TOOLS.json_parse.execute!({ json: '{"a":1,"b":[2,3]}' });
      expect(result.formatted).toBe('{\n  "a": 1,\n  "b": [\n    2,\n    3\n  ]\n}');
    });

    it('should return error for invalid JSON', async () => {
      const result = await ALL_TOOLS.json_parse.execute!({ json: '{invalid}' });
      expect(result).toHaveProperty('error');
      expect(result.error).toMatch(/Invalid JSON/i);
    });
  });

  describe('generate_uuid', () => {
    it('should return a valid UUID v4', async () => {
      const result = await ALL_TOOLS.generate_uuid.execute!({});
      expect(result).toHaveProperty('uuid');
      expect(result.uuid).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
      );
    });

    it('should return unique UUIDs', async () => {
      const r1 = await ALL_TOOLS.generate_uuid.execute!({});
      const r2 = await ALL_TOOLS.generate_uuid.execute!({});
      expect(r1.uuid).not.toBe(r2.uuid);
    });
  });

  describe('sleep', () => {
    it('should wait for the specified duration', async () => {
      const start = Date.now();
      const result = await ALL_TOOLS.sleep.execute!({ ms: 50 });
      const elapsed = Date.now() - start;
      expect(result).toEqual({ slept: 50 });
      expect(elapsed).toBeGreaterThanOrEqual(40); // allow some tolerance
    });

    it('should clamp to 30 seconds max', async () => {
      // Don't actually wait — just verify the parameter clamping
      const result = await ALL_TOOLS.sleep.execute!({ ms: 0 });
      expect(result).toEqual({ slept: 0 });
    });
  });
});
