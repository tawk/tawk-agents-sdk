import { TokenBudgetTracker } from '../../src/core/runner';

describe('TokenBudgetTracker', () => {
  const tokenizerFn = (text: string) => Math.ceil(text.length / 4);

  describe('estimateMessageTokens', () => {
    it('should handle string content like estimateTokens', async () => {
      const tracker = new TokenBudgetTracker({
        maxTokens: 10000,
        tokenizerFn,
      });

      const result = await tracker.estimateMessageTokens('hello world');
      const expected = await tracker.estimateTokens('hello world');
      expect(result).toBe(expected);
    });

    it('should handle array content with text parts only', async () => {
      const tracker = new TokenBudgetTracker({
        maxTokens: 10000,
        tokenizerFn,
      });

      const content = [
        { type: 'text', text: 'hello' },
        { type: 'text', text: 'world' },
      ];

      const result = await tracker.estimateMessageTokens(content);
      const expected =
        (await tracker.estimateTokens(content[0])) +
        (await tracker.estimateTokens(content[1]));
      expect(result).toBe(expected);
    });

    it('should use imageTokenizerFn for image parts instead of stringifying binary', async () => {
      const imageTokenizerFn = jest.fn().mockReturnValue(2840);

      const tracker = new TokenBudgetTracker({
        maxTokens: 10000,
        tokenizerFn,
        imageTokenizerFn,
      });

      const imagePart = {
        type: 'image',
        image: new Uint8Array(50000),
      };

      const result = await tracker.estimateMessageTokens([imagePart]);
      expect(result).toBe(2840);
      expect(imageTokenizerFn).toHaveBeenCalledWith(imagePart);
    });

    it('should handle mixed text and image array content', async () => {
      const imageTokenizerFn = jest.fn().mockReturnValue(2840);

      const tracker = new TokenBudgetTracker({
        maxTokens: 10000,
        tokenizerFn,
        imageTokenizerFn,
      });

      const content = [
        { type: 'text', text: 'describe this image' },
        { type: 'image', image: new Uint8Array(50000) },
      ];

      const result = await tracker.estimateMessageTokens(content);
      const textTokens = await tracker.estimateTokens(content[0]);
      expect(result).toBe(textTokens + 2840);
    });

    it('should default to 2840 tokens per image when no imageTokenizerFn provided', async () => {
      const tracker = new TokenBudgetTracker({
        maxTokens: 10000,
        tokenizerFn,
      });

      const content = [
        { type: 'image', image: new Uint8Array(50000) },
      ];

      const result = await tracker.estimateMessageTokens(content);
      expect(result).toBe(2840);
    });

    it('should fall back to estimateTokens for non-string non-array content', async () => {
      const tracker = new TokenBudgetTracker({
        maxTokens: 10000,
        tokenizerFn,
      });

      const content = { role: 'user', text: 'hello' };
      const result = await tracker.estimateMessageTokens(content);
      const expected = await tracker.estimateTokens(content);
      expect(result).toBe(expected);
    });
  });
});
