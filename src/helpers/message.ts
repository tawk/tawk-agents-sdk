/**
 * Message Helper Utilities
 * 
 * @module helpers/message
 * @description
 * Production-ready utilities for creating and manipulating AI messages.
 * 
 * **Features**:
 * - Type-safe message creation
 * - Multi-provider compatibility
 * - Message filtering and extraction
 * - Content manipulation utilities
 * - Zero overhead abstractions
 * 
 * **Supported Message Types**:
 * - User messages
 * - Assistant messages
 * - System messages
 * - Tool messages
 * 
 * @author Tawk.to
 * @license MIT
 * @version 3.0.0
 */

import type { ModelMessage } from 'ai';

/**
 * Create a user message for conversation history.
 * 
 * @param {string} content - Message content
 * @returns {ModelMessage} User message object
 * 
 * @example
 * ```typescript
 * const message = user('Hello, how are you?');
 * ```
 */
export function user(content: string): ModelMessage {
  return {
    role: 'user',
    content,
  };
}

/**
 * Create an assistant message for conversation history.
 * 
 * @param {string} content - Message content
 * @returns {ModelMessage} Assistant message object
 * 
 * @example
 * ```typescript
 * const message = assistant('I am doing well, thank you!');
 * ```
 */
export function assistant(content: string): ModelMessage {
  return {
    role: 'assistant',
    content,
  };
}

/**
 * Create a system message for conversation history.
 * 
 * @param {string} content - Message content
 * @returns {ModelMessage} System message object
 * 
 * @example
 * ```typescript
 * const message = system('You are a helpful assistant.');
 * ```
 */
export function system(content: string): ModelMessage {
  return {
    role: 'system',
    content,
  };
}

/**
 * Create a tool message for conversation history.
 * Note: Uses AI SDK's standard tool message structure.
 * 
 * @param {string} content - Tool result content
 * @returns {ModelMessage} Tool message object
 * 
 * @example
 * ```typescript
 * const message = toolMessage('File deleted successfully');
 * ```
 */
export function toolMessage(content: string): ModelMessage {
  return {
    role: 'tool',
    content: [{ type: 'tool-result', toolCallId: '', toolName: '', result: content } as any],
  };
}

/**
 * Get the last text content from an assistant message in the conversation.
 * 
 * @param {ModelMessage[]} messages - Array of conversation messages
 * @returns {string | undefined} Last assistant text content or undefined if not found
 * 
 * @example
 * ```typescript
 * const lastText = getLastTextContent(messages);
 * console.log(lastText); // "Hello, how can I help?"
 * ```
 */
export function getLastTextContent(messages: ModelMessage[]): string | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role === 'assistant' && typeof msg.content === 'string') {
      return msg.content;
    }
  }
  return undefined;
}

/**
 * Filter messages by role.
 * 
 * @param {ModelMessage[]} messages - Array of conversation messages
 * @param {'user' | 'assistant' | 'system' | 'tool'} role - Role to filter by
 * @returns {ModelMessage[]} Filtered messages
 * 
 * @example
 * ```typescript
 * const userMessages = filterMessagesByRole(messages, 'user');
 * ```
 */
export function filterMessagesByRole(
  messages: ModelMessage[],
  role: 'user' | 'assistant' | 'system' | 'tool'
): ModelMessage[] {
  return messages.filter(m => m.role === role);
}

/**
 * Extract all text content from messages (concatenates all string content).
 * 
 * @param {ModelMessage[]} messages - Array of conversation messages
 * @returns {string} Concatenated text from all messages
 * 
 * @example
 * ```typescript
 * const allText = extractAllText(messages);
 * console.log(allText); // "Hello\n\nHi there\n\nHow are you?"
 * ```
 */
export function extractAllText(messages: ModelMessage[]): string {
  return messages
    .filter(m => typeof m.content === 'string')
    .map(m => m.content as string)
    .join('\n\n');
}

