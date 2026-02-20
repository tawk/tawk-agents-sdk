/**
 * Guardrails Shared Utilities
 * 
 * @module guardrails/utils
 * @description Helper functions for guardrail validation
 */

import { getCurrentSpan } from '../tracing/context';
import { extractModelName } from '../lifecycle/langfuse';

/**
 * Create a traced generation for LLM-based guardrails
 * Wraps the guardrail execution in proper Langfuse tracing
 */
export function createGuardrailGeneration(config: {
  name: string;
  model: any;
  systemPrompt: string;
  content: string;
  type: 'input' | 'output';
  metadata?: Record<string, any>;
}) {
  const parentSpan = getCurrentSpan();
  
  return parentSpan?.generation({
    name: `Guardrail: ${config.name}`,
    model: extractModelName(config.model),
    input: {
      system: config.systemPrompt,
      prompt: config.content
    },
    metadata: {
      guardrailName: config.name,
      guardrailType: config.type,
      ...config.metadata
    }
  });
}

/**
 * End a guardrail generation with usage tracking
 */
export function endGuardrailGeneration(
  generation: any,
  result: any,
  passed: boolean
) {
  if (!generation) return;
  
  generation.end({
    output: {
      classification: result,
      passed
    },
    usage: {
      input: result.usage?.inputTokens || 0,
      output: result.usage?.outputTokens || 0,
      total: (result.usage?.inputTokens || 0) + (result.usage?.outputTokens || 0)
    }
  });
}

/**
 * Luhn algorithm check for credit card number validation.
 * Prevents false positives on ISBNs, version numbers, dates, etc.
 */
function passesLuhn(digits: string): boolean {
  const nums = digits.split('').map(Number);
  let sum = 0;
  let alternate = false;
  for (let i = nums.length - 1; i >= 0; i--) {
    let n = nums[i];
    if (alternate) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alternate = !alternate;
  }
  return sum % 10 === 0;
}

/**
 * PII detection patterns.
 * creditCard uses a two-phase approach: regex match + Luhn checksum validation.
 */
export const PII_PATTERNS: Record<string, RegExp> = {
  email: /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g,
  phone: /\b(\+?\d{1,4}[\s\-.]?)?\(?\d{1,4}\)?[\s\-.]?\d{1,4}[\s\-.]?\d{1,9}\b/g,
  ssn: /\b\d{3}[\s\-]?\d{2}[\s\-]?\d{4}\b/g,
  // Matches 13-19 digit sequences; actual validation done via passesLuhn()
  creditCard: /\b(?:\d[\s\-]?){13,19}\b/g,
  ipAddress: /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/g,
};

/**
 * Test whether content contains a specific PII pattern.
 * For credit cards, applies Luhn checksum validation to reduce false positives.
 */
export function testPIIPattern(category: string, pattern: RegExp, content: string): boolean {
  // Reset lastIndex for global regexes
  pattern.lastIndex = 0;
  const matches = content.match(pattern);
  if (!matches) return false;

  if (category === 'creditCard') {
    // Filter through Luhn algorithm — only flag if at least one match is a valid CC number
    return matches.some(m => {
      const digits = m.replace(/[\s\-]/g, '');
      return digits.length >= 13 && digits.length <= 19 && passesLuhn(digits);
    });
  }

  return true;
}

/**
 * Calculate content length based on unit
 * @param content - The content to measure
 * @param unit - Unit of measurement (characters or words)
 * @returns The length of the content in the specified unit
 */
export function calculateLength(
  content: string,
  unit: 'characters' | 'words' = 'characters'
): number {
  switch (unit) {
    case 'characters':
      return content.length;
    case 'words':
      return content.split(/\s+/).length;
  }
}





