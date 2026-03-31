import { wrapWithPermission, DANGEROUS_TOOLS } from '../../../bin/cli/tools';
import type { CoreTool } from '../../../src';

// Mock readline for the askConfirm function inside tools.ts
const mockQuestion = jest.fn();
const mockClose = jest.fn();
jest.mock('readline', () => ({
  createInterface: jest.fn(() => ({
    question: mockQuestion,
    close: mockClose,
  })),
}));

describe('DANGEROUS_TOOLS', () => {
  it('should contain shell_exec and write_file', () => {
    expect(DANGEROUS_TOOLS.has('shell_exec')).toBe(true);
    expect(DANGEROUS_TOOLS.has('write_file')).toBe(true);
  });

  it('should not contain safe tools', () => {
    expect(DANGEROUS_TOOLS.has('read_file')).toBe(false);
    expect(DANGEROUS_TOOLS.has('calculator')).toBe(false);
    expect(DANGEROUS_TOOLS.has('current_time')).toBe(false);
  });
});

describe('wrapWithPermission', () => {
  let mockTool: CoreTool;
  let pauseSpinner: jest.Mock;
  let resumeSpinner: jest.Mock;
  let shouldConfirm: jest.Mock;
  let stderrSpy: jest.SpyInstance;

  beforeEach(() => {
    mockTool = {
      description: 'Test tool',
      parameters: { type: 'object', properties: {} },
      execute: jest.fn().mockResolvedValue({ result: 'ok' }),
    } as any;
    pauseSpinner = jest.fn();
    resumeSpinner = jest.fn();
    shouldConfirm = jest.fn(() => true);
    mockQuestion.mockClear();
    mockClose.mockClear();
    // Default: user accepts (presses enter / types 'y')
    mockQuestion.mockImplementation((_prompt: string, cb: (answer: string) => void) => {
      cb('y');
    });
    stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    stderrSpy.mockRestore();
  });

  it('should call original execute when shouldConfirm returns false', async () => {
    shouldConfirm.mockReturnValue(false);
    const wrapped = wrapWithPermission(mockTool, 'shell_exec', {
      pauseSpinner,
      resumeSpinner,
      shouldConfirm,
    });
    const result = await wrapped.execute!({ command: 'ls' }, {} as any);
    expect(result).toEqual({ result: 'ok' });
    expect(mockTool.execute).toHaveBeenCalledWith({ command: 'ls' }, expect.anything());
    expect(mockQuestion).not.toHaveBeenCalled();
  });

  it('should show confirm prompt when shouldConfirm returns true', async () => {
    const wrapped = wrapWithPermission(mockTool, 'shell_exec', {
      pauseSpinner,
      resumeSpinner,
      shouldConfirm,
    });
    await wrapped.execute!({ command: 'ls' }, {} as any);
    expect(pauseSpinner).toHaveBeenCalled();
    expect(mockQuestion).toHaveBeenCalled();
    expect(resumeSpinner).toHaveBeenCalledWith('Executing shell_exec...');
    expect(mockTool.execute).toHaveBeenCalled();
  });

  it('should return error when user denies permission', async () => {
    mockQuestion.mockImplementation((_prompt: string, cb: (answer: string) => void) => {
      cb('n');
    });
    const wrapped = wrapWithPermission(mockTool, 'shell_exec', {
      pauseSpinner,
      resumeSpinner,
      shouldConfirm,
    });
    const result = await wrapped.execute!({ command: 'rm -rf /' }, {} as any);
    expect(result).toEqual({ error: 'User denied permission for shell_exec' });
    expect(mockTool.execute).not.toHaveBeenCalled();
    expect(resumeSpinner).toHaveBeenCalledWith('Thinking...');
  });

  it('should accept empty input as confirmation (default Y)', async () => {
    mockQuestion.mockImplementation((_prompt: string, cb: (answer: string) => void) => {
      cb('');
    });
    const wrapped = wrapWithPermission(mockTool, 'shell_exec', {
      pauseSpinner,
      resumeSpinner,
      shouldConfirm,
    });
    await wrapped.execute!({ command: 'ls' }, {} as any);
    expect(mockTool.execute).toHaveBeenCalled();
  });

  it('should return tool unchanged if it has no execute function', () => {
    const noExecTool = { description: 'No exec' } as any;
    const wrapped = wrapWithPermission(noExecTool, 'test', {
      pauseSpinner,
      resumeSpinner,
      shouldConfirm,
    });
    expect(wrapped).toBe(noExecTool);
  });

  it('should preserve tool description and parameters', () => {
    const wrapped = wrapWithPermission(mockTool, 'shell_exec', {
      pauseSpinner,
      resumeSpinner,
      shouldConfirm,
    });
    expect(wrapped.description).toBe('Test tool');
    expect(wrapped.parameters).toEqual(mockTool.parameters);
  });
});
