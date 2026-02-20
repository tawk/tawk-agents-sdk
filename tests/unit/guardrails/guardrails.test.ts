import {
  lengthGuardrail,
  piiDetectionGuardrail,
  customGuardrail,
  rateLimitGuardrail,
} from '@tawk-agents-sdk/core';

const mockContext = {
  context: {},
  agent: {
    name: 'test',
    _tokenizerFn: (text: string) => Math.ceil(text.length / 4),
  },
  messages: [],
  usage: { requests: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0 },
} as any;

describe('Guardrails', () => {
  describe('lengthGuardrail', () => {
    it('should pass for content within character limits', async () => {
      const guardrail = lengthGuardrail({ maxLength: 100, unit: 'characters', type: 'output' });
      const result = await guardrail.validate('short text', mockContext);
      expect(result.passed).toBe(true);
    });

    it('should fail for content exceeding character limits', async () => {
      const guardrail = lengthGuardrail({ maxLength: 5, unit: 'characters', type: 'output' });
      const result = await guardrail.validate('this is too long', mockContext);
      expect(result.passed).toBe(false);
      expect(result.message).toContain('too long');
    });

    it('should validate by word count', async () => {
      const guardrail = lengthGuardrail({ maxLength: 3, unit: 'words', type: 'output' });
      const pass = await guardrail.validate('one two three', mockContext);
      expect(pass.passed).toBe(true);
      const fail = await guardrail.validate('one two three four', mockContext);
      expect(fail.passed).toBe(false);
    });

    it('should validate by token count', async () => {
      const guardrail = lengthGuardrail({ maxLength: 5, unit: 'tokens', type: 'output' });
      // 'short' = 5 chars = ceil(5/4) = 2 tokens
      const pass = await guardrail.validate('short', mockContext);
      expect(pass.passed).toBe(true);
      // 'this is a much longer sentence' = 30 chars = ceil(30/4) = 8 tokens
      const fail = await guardrail.validate('this is a much longer sentence', mockContext);
      expect(fail.passed).toBe(false);
    });

    it('should validate minimum length', async () => {
      const guardrail = lengthGuardrail({
        minLength: 10,
        unit: 'characters',
        type: 'output',
      });
      const fail = await guardrail.validate('short', mockContext);
      expect(fail.passed).toBe(false);
      expect(fail.message).toContain('too short');
    });

    it('should default to characters unit', async () => {
      const guardrail = lengthGuardrail({ maxLength: 100, type: 'output' });
      const result = await guardrail.validate('test', mockContext);
      expect(result.passed).toBe(true);
    });

    it('should set the correct guardrail name', () => {
      const guardrail = lengthGuardrail({ maxLength: 100, type: 'output' });
      expect(guardrail.name).toBe('length_check');
    });

    it('should accept custom name', () => {
      const guardrail = lengthGuardrail({
        name: 'my-length-check',
        maxLength: 100,
        type: 'output',
      });
      expect(guardrail.name).toBe('my-length-check');
    });
  });

  describe('piiDetectionGuardrail', () => {
    it('should detect email addresses', async () => {
      const guardrail = piiDetectionGuardrail({ type: 'input' });
      const result = await guardrail.validate('Contact me at john@example.com', mockContext);
      expect(result.passed).toBe(false);
      expect(result.message).toContain('PII');
    });

    it('should detect SSN patterns', async () => {
      const guardrail = piiDetectionGuardrail({ type: 'input' });
      const result = await guardrail.validate('My SSN is 123-45-6789', mockContext);
      expect(result.passed).toBe(false);
    });

    it('should pass for clean content', async () => {
      const guardrail = piiDetectionGuardrail({ type: 'input' });
      const result = await guardrail.validate(
        'Hello, how can I help you today?',
        mockContext
      );
      expect(result.passed).toBe(true);
    });

    it('should detect credit card patterns', async () => {
      const guardrail = piiDetectionGuardrail({ type: 'input' });
      const result = await guardrail.validate(
        'My card number is 4111 1111 1111 1111',
        mockContext
      );
      expect(result.passed).toBe(false);
    });

    it('should warn but not block when block is false', async () => {
      const guardrail = piiDetectionGuardrail({ type: 'input', block: false });
      const result = await guardrail.validate('Email me at test@test.com', mockContext);
      expect(result.passed).toBe(true);
      expect(result.message).toContain('Warning');
    });

    it('should filter by specific PII categories', async () => {
      const guardrail = piiDetectionGuardrail({
        type: 'input',
        categories: ['email'],
      });
      // SSN should pass because we only check email
      const result = await guardrail.validate('My SSN is 123-45-6789', mockContext);
      expect(result.passed).toBe(true);
    });
  });

  describe('customGuardrail', () => {
    it('should use custom validation function', async () => {
      const guardrail = customGuardrail({
        name: 'no-profanity',
        type: 'input',
        validate: async (content) => ({
          passed: !content.includes('badword'),
          message: content.includes('badword') ? 'Profanity detected' : undefined,
        }),
      });
      const pass = await guardrail.validate('clean text', mockContext);
      expect(pass.passed).toBe(true);
      const fail = await guardrail.validate('has badword in it', mockContext);
      expect(fail.passed).toBe(false);
      expect(fail.message).toBe('Profanity detected');
    });

    it('should preserve custom name', () => {
      const guardrail = customGuardrail({
        name: 'my-guard',
        type: 'output',
        validate: async () => ({ passed: true }),
      });
      expect(guardrail.name).toBe('my-guard');
      expect(guardrail.type).toBe('output');
    });
  });

  describe('rateLimitGuardrail', () => {
    it('should allow requests within limit', async () => {
      const storage = new Map();
      const guardrail = rateLimitGuardrail({
        maxRequests: 5,
        windowMs: 60000,
        storage,
        keyExtractor: () => 'user-1',
      });
      const result = await guardrail.validate('test', mockContext);
      expect(result.passed).toBe(true);
    });

    it('should block requests exceeding limit', async () => {
      const storage = new Map();
      const guardrail = rateLimitGuardrail({
        maxRequests: 2,
        windowMs: 60000,
        storage,
        keyExtractor: () => 'user-1',
      });
      await guardrail.validate('req1', mockContext);
      await guardrail.validate('req2', mockContext);
      const result = await guardrail.validate('req3', mockContext);
      expect(result.passed).toBe(false);
      expect(result.message).toContain('Rate limit');
    });

    it('should track different keys independently', async () => {
      const storage = new Map();
      let currentUser = 'user-1';
      const guardrail = rateLimitGuardrail({
        maxRequests: 1,
        windowMs: 60000,
        storage,
        keyExtractor: () => currentUser,
      });
      await guardrail.validate('req1', mockContext);
      // user-1 is now at limit

      currentUser = 'user-2';
      const result = await guardrail.validate('req1', mockContext);
      // user-2 should still be allowed
      expect(result.passed).toBe(true);
    });

    it('should default guardrail type to input', () => {
      const storage = new Map();
      const guardrail = rateLimitGuardrail({
        maxRequests: 5,
        windowMs: 60000,
        storage,
        keyExtractor: () => 'user-1',
      });
      expect(guardrail.type).toBe('input');
    });

    it('should include metadata on rate limit failure', async () => {
      const storage = new Map();
      const guardrail = rateLimitGuardrail({
        maxRequests: 1,
        windowMs: 60000,
        storage,
        keyExtractor: () => 'user-1',
      });
      await guardrail.validate('req1', mockContext);
      const result = await guardrail.validate('req2', mockContext);
      expect(result.passed).toBe(false);
      expect(result.metadata).toBeDefined();
      expect(result.metadata.count).toBe(2);
      expect(result.metadata.limit).toBe(1);
    });
  });
});
