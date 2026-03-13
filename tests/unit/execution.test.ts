/**
 * Unit tests for processModelResponse
 *
 * Verifies that assistant message content parts (reasoning, tool-call, text)
 * are properly preserved when transforming model responses for subsequent
 * Responses API calls.
 */

import { processModelResponse } from '../../src/core/execution';

function createMockResponse(overrides: Record<string, unknown> = {}) {
  return {
    text: '',
    finishReason: 'stop' as const,
    toolCalls: [],
    toolResults: [],
    usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    steps: [],
    response: { messages: [] },
    ...overrides,
  } as any;
}

describe('processModelResponse', () => {
  describe('tool-call providerOptions preservation', () => {
    it('should preserve providerOptions on tool-call parts', () => {
      const response = createMockResponse({
        text: '',
        finishReason: 'tool-calls',
        toolCalls: [{
          toolCallId: 'call_123',
          toolName: 'search',
          input: { query: 'test' },
        }],
        response: {
          messages: [{
            role: 'assistant',
            content: [
              {
                type: 'tool-call',
                toolCallId: 'call_123',
                toolName: 'search',
                input: { query: 'test' },
                providerOptions: {
                  openai: { itemId: 'fc_abc123' },
                },
              },
            ],
          }],
        },
      });

      const result = processModelResponse(response);

      expect(result.newMessages).toHaveLength(1);
      const assistantMsg = result.newMessages[0] as any;
      expect(assistantMsg.role).toBe('assistant');
      expect(assistantMsg.content).toHaveLength(1);

      const toolCallPart = assistantMsg.content[0];
      expect(toolCallPart.type).toBe('tool-call');
      expect(toolCallPart.toolCallId).toBe('call_123');
      expect(toolCallPart.input).toEqual({ query: 'test' });
      expect(toolCallPart.providerOptions).toEqual({
        openai: { itemId: 'fc_abc123' },
      });
    });

    it('should preserve providerExecuted on tool-call parts', () => {
      const response = createMockResponse({
        response: {
          messages: [{
            role: 'assistant',
            content: [
              {
                type: 'tool-call',
                toolCallId: 'call_456',
                toolName: 'web_search',
                input: { query: 'news' },
                providerExecuted: true,
                providerOptions: {
                  openai: { itemId: 'fc_def456' },
                },
              },
            ],
          }],
        },
      });

      const result = processModelResponse(response);
      const toolCallPart = (result.newMessages[0] as any).content[0];

      expect(toolCallPart.providerExecuted).toBe(true);
      expect(toolCallPart.providerOptions).toEqual({
        openai: { itemId: 'fc_def456' },
      });
    });

    it('should work correctly when providerOptions is undefined', () => {
      const response = createMockResponse({
        toolCalls: [{
          toolCallId: 'call_789',
          toolName: 'calculator',
          input: { expression: '2+2' },
        }],
        response: {
          messages: [{
            role: 'assistant',
            content: [
              {
                type: 'tool-call',
                toolCallId: 'call_789',
                toolName: 'calculator',
                input: { expression: '2+2' },
              },
            ],
          }],
        },
      });

      const result = processModelResponse(response);
      const toolCallPart = (result.newMessages[0] as any).content[0];

      expect(toolCallPart.type).toBe('tool-call');
      expect(toolCallPart.input).toEqual({ expression: '2+2' });
      expect(toolCallPart.providerOptions).toBeUndefined();
    });

    it('should normalize input from args for backwards compatibility', () => {
      const response = createMockResponse({
        response: {
          messages: [{
            role: 'assistant',
            content: [
              {
                type: 'tool-call',
                toolCallId: 'call_legacy',
                toolName: 'search',
                args: { query: 'legacy' },
                providerOptions: { openai: { itemId: 'fc_legacy' } },
              },
            ],
          }],
        },
      });

      const result = processModelResponse(response);
      const toolCallPart = (result.newMessages[0] as any).content[0];

      expect(toolCallPart.input).toEqual({ query: 'legacy' });
      expect(toolCallPart.providerOptions).toEqual({
        openai: { itemId: 'fc_legacy' },
      });
    });
  });

  describe('reasoning + tool-call messages', () => {
    it('should preserve both reasoning and tool-call parts with providerOptions', () => {
      const response = createMockResponse({
        text: '',
        finishReason: 'tool-calls',
        toolCalls: [{
          toolCallId: 'call_001',
          toolName: 'search',
          input: { query: 'weather' },
        }],
        response: {
          messages: [{
            role: 'assistant',
            content: [
              {
                type: 'reasoning',
                text: 'I need to search for the weather.',
                providerOptions: {
                  openai: {
                    itemId: 'rs_reasoning123',
                    reasoningEncryptedContent: 'encrypted_data',
                  },
                },
              },
              {
                type: 'tool-call',
                toolCallId: 'call_001',
                toolName: 'search',
                input: { query: 'weather' },
                providerOptions: {
                  openai: { itemId: 'fc_toolcall123' },
                },
              },
            ],
          }],
        },
      });

      const result = processModelResponse(response);

      expect(result.newMessages).toHaveLength(1);
      const assistantMsg = result.newMessages[0] as any;
      expect(assistantMsg.content).toHaveLength(2);

      const reasoningPart = assistantMsg.content[0];
      expect(reasoningPart.type).toBe('reasoning');
      expect(reasoningPart.text).toBe('I need to search for the weather.');
      expect(reasoningPart.providerOptions).toEqual({
        openai: {
          itemId: 'rs_reasoning123',
          reasoningEncryptedContent: 'encrypted_data',
        },
      });

      const toolCallPart = assistantMsg.content[1];
      expect(toolCallPart.type).toBe('tool-call');
      expect(toolCallPart.providerOptions).toEqual({
        openai: { itemId: 'fc_toolcall123' },
      });
    });
  });

  describe('message filtering', () => {
    it('should include tool role messages from AI SDK response', () => {
      const response = createMockResponse({
        response: {
          messages: [
            {
              role: 'assistant',
              content: 'Hello',
            },
            {
              role: 'tool',
              content: [{ type: 'tool-result', toolCallId: 'call_1', output: 'result' }],
            },
          ],
        },
      });

      const result = processModelResponse(response);
      expect(result.newMessages).toHaveLength(2);
      expect((result.newMessages[0] as any).role).toBe('assistant');
      expect((result.newMessages[1] as any).role).toBe('tool');
    });

    it('should use response.text as fallback when no response messages', () => {
      const response = createMockResponse({
        text: 'Fallback text',
        response: { messages: [] },
      });

      const result = processModelResponse(response);
      expect(result.newMessages).toHaveLength(1);
      expect((result.newMessages[0] as any).role).toBe('assistant');
      expect((result.newMessages[0] as any).content).toBe('Fallback text');
    });
  });
});
