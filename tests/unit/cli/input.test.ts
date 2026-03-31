import { MultiLineInput } from '../../../bin/cli/input';

describe('MultiLineInput', () => {
  let input: MultiLineInput;

  beforeEach(() => {
    input = new MultiLineInput();
  });

  describe('single-line input', () => {
    it('should pass through normal lines', () => {
      const result = input.feed('hello world');
      expect(result.complete).toBe(true);
      expect(result.text).toBe('hello world');
    });

    it('should not be active after single line', () => {
      input.feed('hello');
      expect(input.isActive()).toBe(false);
    });
  });

  describe('backslash continuation', () => {
    it('should detect continuation with trailing backslash', () => {
      const result = input.feed('hello \\');
      expect(result.complete).toBe(false);
      expect(result.promptHint).toBe('... ');
      expect(input.isActive()).toBe(true);
    });

    it('should join lines on completion', () => {
      input.feed('line 1 \\');
      const result = input.feed('line 2');
      expect(result.complete).toBe(true);
      expect(result.text).toBe('line 1 \nline 2');
    });

    it('should support multiple continuations', () => {
      input.feed('a \\');
      input.feed('b \\');
      const result = input.feed('c');
      expect(result.complete).toBe(true);
      expect(result.text).toBe('a \nb \nc');
    });

    it('should reset after completion', () => {
      input.feed('a \\');
      input.feed('b');
      expect(input.isActive()).toBe(false);
    });
  });

  describe('block mode', () => {
    it('should enter block mode with """', () => {
      const result = input.feed('"""');
      expect(result.complete).toBe(false);
      expect(result.promptHint).toBe('""" ');
      expect(input.isActive()).toBe(true);
    });

    it('should collect lines until closing """', () => {
      input.feed('"""');
      input.feed('line 1');
      input.feed('line 2');
      const result = input.feed('"""');
      expect(result.complete).toBe(true);
      expect(result.text).toBe('line 1\nline 2');
    });

    it('should handle empty block', () => {
      input.feed('"""');
      const result = input.feed('"""');
      expect(result.complete).toBe(true);
      expect(result.text).toBe('');
    });
  });

  describe('reset', () => {
    it('should cancel multi-line mode', () => {
      input.feed('hello \\');
      expect(input.isActive()).toBe(true);
      input.reset();
      expect(input.isActive()).toBe(false);
    });

    it('should cancel block mode', () => {
      input.feed('"""');
      expect(input.isActive()).toBe(true);
      input.reset();
      expect(input.isActive()).toBe(false);
    });
  });
});
