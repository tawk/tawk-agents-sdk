import { parseModelString } from '../../../bin/cli/model-provider';

describe('model-provider', () => {
  describe('parseModelString', () => {
    it('should parse explicit provider:model format', () => {
      const result = parseModelString('openai:gpt-4o-mini');
      expect(result).toEqual({ provider: 'openai', modelId: 'gpt-4o-mini' });
    });

    it('should parse anthropic:claude format', () => {
      const result = parseModelString('anthropic:claude-3-opus');
      expect(result).toEqual({ provider: 'anthropic', modelId: 'claude-3-opus' });
    });

    it('should parse groq:llama format', () => {
      const result = parseModelString('groq:llama-3.3-70b-versatile');
      expect(result).toEqual({ provider: 'groq', modelId: 'llama-3.3-70b-versatile' });
    });

    it('should parse google:gemini format', () => {
      const result = parseModelString('google:gemini-1.5-pro');
      expect(result).toEqual({ provider: 'google', modelId: 'gemini-1.5-pro' });
    });

    it('should auto-infer openai from gpt- prefix', () => {
      const result = parseModelString('gpt-4o');
      expect(result).toEqual({ provider: 'openai', modelId: 'gpt-4o' });
    });

    it('should auto-infer openai from o1 prefix', () => {
      const result = parseModelString('o1-preview');
      expect(result).toEqual({ provider: 'openai', modelId: 'o1-preview' });
    });

    it('should auto-infer anthropic from claude- prefix', () => {
      const result = parseModelString('claude-3-sonnet');
      expect(result).toEqual({ provider: 'anthropic', modelId: 'claude-3-sonnet' });
    });

    it('should auto-infer google from gemini- prefix', () => {
      const result = parseModelString('gemini-1.5-flash');
      expect(result).toEqual({ provider: 'google', modelId: 'gemini-1.5-flash' });
    });

    it('should auto-infer groq from llama- prefix', () => {
      const result = parseModelString('llama-3.3-70b');
      expect(result).toEqual({ provider: 'groq', modelId: 'llama-3.3-70b' });
    });

    it('should auto-infer groq from mixtral- prefix', () => {
      const result = parseModelString('mixtral-8x7b');
      expect(result).toEqual({ provider: 'groq', modelId: 'mixtral-8x7b' });
    });

    it('should auto-infer groq from deepseek- prefix', () => {
      const result = parseModelString('deepseek-r1');
      expect(result).toEqual({ provider: 'groq', modelId: 'deepseek-r1' });
    });

    it('should default to openai for unknown model names', () => {
      const result = parseModelString('some-unknown-model');
      expect(result).toEqual({ provider: 'openai', modelId: 'some-unknown-model' });
    });

    it('should handle provider with colons in model id', () => {
      const result = parseModelString('openai:ft:gpt-4o-mini:custom');
      expect(result).toEqual({ provider: 'openai', modelId: 'ft:gpt-4o-mini:custom' });
    });
  });
});
