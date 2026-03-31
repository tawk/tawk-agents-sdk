/**
 * Guardrails System
 * 
 * @module guardrails
 * @description
 * Production-ready input/output validation and safety guardrails.
 * 
 * **Available Guardrails**:
 * - Content Safety: Block harmful or inappropriate content
 * - Length Control: Enforce output length constraints
 * - PII Detection: Detect and filter personal information
 * - Topic Relevance: Ensure responses stay on-topic
 * - Sentiment Analysis: Control response tone
 * - Toxicity Detection: Filter toxic content
 * - Language Detection: Enforce language requirements
 * - Rate Limiting: Control execution frequency
 * - Custom Guardrails: Build your own validators
 * 
 * **Features**:
 * - AI-powered validation for advanced checks
 * - Regex-based validation for simple checks
 * - Automatic feedback generation for regeneration
 * - Comprehensive error handling
 * 
 * @author Tawk.to
 * @license MIT
 * @version 3.0.0
 */

import type { Guardrail, GuardrailResult, RunContextWrapper } from '../core/agent';
import { generateObject as _generateObject } from 'ai';

// Wrap generateObject to bypass TS2589 deep type instantiation with Zod schemas
const generateObject = _generateObject as (opts: any) => Promise<any>;
import { z } from 'zod';
import { getCurrentSpan } from '../tracing/context';
import { extractModelName } from '../lifecycle/langfuse';
import { PII_PATTERNS, testPIIPattern } from './utils';

// ============================================
// CONTENT SAFETY GUARDRAILS
// ============================================

/**
 * Create a guardrail that blocks harmful or inappropriate content.
 * Uses an AI model to classify content safety.
 * 
 * @template TContext - Type of context object
 * 
 * @param {Object} config - Guardrail configuration
 * @param {string} [config.name] - Custom guardrail name
 * @param {'input' | 'output'} config.type - Whether to validate input or output
 * @param {LanguageModel} config.model - Model to use for content classification
 * @param {string[]} [config.categories] - Categories to check (default: hate speech, violence, sexual content, harassment, self-harm)
 * @param {number} [config.threshold] - Confidence threshold for blocking
 * @returns {Guardrail<TContext>} Guardrail instance
 * 
 * @example
 * ```typescript
 * const guardrail = contentSafetyGuardrail({
 *   type: 'input',
 *   model: openai('gpt-4o-mini'),
 *   categories: ['violence', 'hate-speech']
 * });
 * ```
 */
export function contentSafetyGuardrail<TContext = any>(config: {
  name?: string;
  type: 'input' | 'output';
  model: any; // LanguageModel
  categories?: string[];
  threshold?: number;
}): Guardrail<TContext> {
  return {
    name: config.name || 'content_safety',
    type: config.type,
    validate: async (content: string, _context: RunContextWrapper<TContext>) => {
      const categories = config.categories || [
        'hate speech',
        'violence',
        'sexual content',
        'harassment',
        'self-harm'
      ];

      const sanitizedCategories = categories.map(c => c.replace(/[^a-zA-Z0-9\s\-_]/g, '').trim()).filter(Boolean);

      // Get parent span for nesting (from guardrails span)
      const parentSpan = getCurrentSpan();

      // Create GENERATION trace for this LLM-based guardrail
      const generation = parentSpan?.generation({
        name: `Guardrail: ${config.name || 'content_safety'}`,
        model: extractModelName(config.model),
        input: {
          system: `You are a content moderation system. Analyze the following text and determine if it contains any of these categories: ${sanitizedCategories.join(', ')}. Respond with a JSON object.`,
          prompt: content
        },
        metadata: {
          guardrailName: config.name || 'content_safety',
          guardrailType: config.type,
          categories
        }
      });

      const classificationSchema = z.object({
        isSafe: z.boolean().describe('Whether the content is safe'),
        detectedCategories: z.array(z.string()).describe('List of detected unsafe categories'),
        confidence: z.number().describe('Confidence score from 0 to 1')
      });

      const result = await generateObject({
        model: config.model,
        schema: classificationSchema,
        schemaName: 'ContentSafetyClassification',
        system: `You are a content moderation system. Analyze the following text and determine if it contains any of these categories: ${sanitizedCategories.join(', ')}.`,
        prompt: content,
      });

      const classification = result.object;

      // End generation with usage tracking
      if (generation) {
        generation.end({
          output: {
            classification,
            passed: classification.isSafe
          },
          usage: {
            input: result.usage?.inputTokens || 0,
            output: result.usage?.outputTokens || 0,
            total: (result.usage?.inputTokens || 0) + (result.usage?.outputTokens || 0)
          }
        });
      }

      if (classification.isSafe) {
        return { passed: true };
      }

      return {
        passed: false,
        message: `Content contains: ${classification.detectedCategories?.join(', ') || 'unsafe content'}`,
        metadata: classification
      };
    }
  };
}

// ============================================
// PII DETECTION GUARDRAIL
// ============================================

/**
 * Create a guardrail that detects and optionally blocks PII (Personally Identifiable Information).
 * Uses regex patterns to detect emails, phone numbers, SSNs, credit cards, and IP addresses.
 * 
 * @template TContext - Type of context object
 * 
 * @param {Object} config - Guardrail configuration
 * @param {string} [config.name] - Custom guardrail name
 * @param {'input' | 'output'} config.type - Whether to validate input or output
 * @param {boolean} [config.block] - If true, block content with PII; if false, just warn (default: true)
 * @param {string[]} [config.categories] - PII categories to check (email, phone, ssn, creditCard, ipAddress)
 * @returns {Guardrail<TContext>} Guardrail instance
 * 
 * @example
 * ```typescript
 * const guardrail = piiDetectionGuardrail({
 *   type: 'output',
 *   block: true
 * });
 * ```
 */
export function piiDetectionGuardrail<TContext = any>(config: {
  name?: string;
  type: 'input' | 'output';
  block?: boolean; // If true, block content with PII. If false, just warn
  categories?: string[];
}): Guardrail<TContext> {
  return {
    name: config.name || 'pii_detection',
    type: config.type,
    validate: async (content: string) => {
      const detectedPII: string[] = [];

      // Check each PII category (with Luhn validation for credit cards)
      for (const [category, pattern] of Object.entries(PII_PATTERNS)) {
        if (!config.categories || config.categories.includes(category)) {
          if (testPIIPattern(category, pattern, content)) {
            detectedPII.push(category);
          }
        }
      }

      if (detectedPII.length > 0) {
        if (config.block !== false) {
          return {
            passed: false,
            message: `PII detected: ${detectedPII.join(', ')}`,
            metadata: { detectedCategories: detectedPII }
          };
        } else {
          // Just warn, don't block
          return {
            passed: true,
            message: `Warning: PII detected: ${detectedPII.join(', ')}`,
            metadata: { detectedCategories: detectedPII }
          };
        }
      }

      return { passed: true };
    }
  };
}

// ============================================
// LENGTH GUARDRAIL
// ============================================

/**
 * Create a guardrail that validates content length.
 * Supports validation by characters, words, or tokens.
 * 
 * When unit is 'tokens', the guardrail uses the agent's tokenizerFn
 * for accurate token counting.
 * 
 * @template TContext - Type of context object
 * 
 * @param {Object} config - Guardrail configuration
 * @param {string} [config.name] - Custom guardrail name
 * @param {'input' | 'output'} config.type - Whether to validate input or output
 * @param {number} [config.minLength] - Minimum length required
 * @param {number} [config.maxLength] - Maximum length allowed
 * @param {'characters' | 'words' | 'tokens'} [config.unit] - Unit for length measurement (default: 'characters')
 * @returns {Guardrail<TContext>} Guardrail instance
 * 
 * @example
 * ```typescript
 * const guardrail = lengthGuardrail({
 *   type: 'output',
 *   maxLength: 1000,
 *   unit: 'tokens'
 * });
 * ```
 */
export function lengthGuardrail<TContext = any>(config: {
  name?: string;
  type: 'input' | 'output';
  minLength?: number;
  maxLength?: number;
  unit?: 'characters' | 'words' | 'tokens';
}): Guardrail<TContext> {
  const unit = config.unit || 'characters';
  
  return {
    name: config.name || 'length_check',
    type: config.type,
    validate: async (content: string, contextWrapper: RunContextWrapper<TContext>) => {
      const characterLength = content.length;
      const tokenCount = await contextWrapper.agent._tokenizerFn(content);
      
      // Calculate length in configured unit
      let length: number;
      switch (unit) {
        case 'characters':
          length = characterLength;
          break;
        case 'words':
          length = content.split(/\s+/).length;
          break;
        case 'tokens':
          length = tokenCount;
          break;
      }

      const metadata = { 
        characterLength, 
        tokenCount,
        unit,
        maxLength: config.maxLength
      };

      if (config.minLength && length < config.minLength) {
        return {
          passed: false,
          message: `Content too short: ${length} ${unit} (min: ${config.minLength})`,
          metadata
        };
      }

      if (config.maxLength && length > config.maxLength) {
        return {
          passed: false,
          message: `Content too long: ${length} ${unit} (max: ${config.maxLength})`,
          metadata
        };
      }

      return { passed: true, metadata };
    }
  };
}

// ============================================
// TOPIC RELEVANCE GUARDRAIL
// ============================================

/**
 * Create a guardrail that ensures content is relevant to allowed topics.
 * Uses an AI model to analyze topic relevance.
 * 
 * @template TContext - Type of context object
 * 
 * @param {Object} config - Guardrail configuration
 * @param {string} [config.name] - Custom guardrail name
 * @param {'input' | 'output'} config.type - Whether to validate input or output
 * @param {LanguageModel} config.model - Model to use for topic analysis
 * @param {string[]} config.allowedTopics - List of allowed topics
 * @param {number} [config.threshold] - Minimum relevance score (0-10)
 * @returns {Guardrail<TContext>} Guardrail instance
 */
export function topicRelevanceGuardrail<TContext = any>(config: {
  name?: string;
  type: 'input' | 'output';
  model: any;
  allowedTopics: string[];
  threshold?: number;
}): Guardrail<TContext> {
  return {
    name: config.name || 'topic_relevance',
    type: config.type,
    validate: async (content: string) => {
      const sanitizedTopics = config.allowedTopics.map(t => t.replace(/[^a-zA-Z0-9\s\-_]/g, '').trim()).filter(Boolean);

      // Get parent span for nesting
      const parentSpan = getCurrentSpan();

      // Create GENERATION trace for this LLM-based guardrail
      const generation = parentSpan?.generation({
        name: `Guardrail: ${config.name || 'topic_relevance'}`,
        model: extractModelName(config.model),
        input: {
          system: `Analyze if the following text is relevant to these topics: ${sanitizedTopics.join(', ')}. Rate relevance from 0-10.`,
          prompt: content
        },
        metadata: {
          guardrailName: config.name || 'topic_relevance',
          guardrailType: config.type,
          allowedTopics: config.allowedTopics
        }
      });

      const relevanceSchema = z.object({
        isRelevant: z.boolean().describe('Whether the content is relevant to the allowed topics'),
        relevanceScore: z.number().describe('Relevance score from 0 to 10'),
        matchedTopics: z.array(z.string()).describe('Topics that matched'),
        reasoning: z.string().describe('Brief explanation of the relevance assessment')
      });

      const result = await generateObject({
        model: config.model,
        schema: relevanceSchema,
        schemaName: 'TopicRelevance',
        system: `Analyze if the following text is relevant to these topics: ${sanitizedTopics.join(', ')}. Rate relevance from 0-10.`,
        prompt: content,
      });

      const rating = result.object;
      const threshold = config.threshold || 5;

      // End generation with usage tracking
      if (generation) {
        generation.end({
          output: {
            rating,
            passed: rating.isRelevant && rating.relevanceScore >= threshold
          },
          usage: {
            input: result.usage?.inputTokens || 0,
            output: result.usage?.outputTokens || 0,
            total: (result.usage?.inputTokens || 0) + (result.usage?.outputTokens || 0)
          }
        });
      }

      if (!rating.isRelevant || rating.relevanceScore < threshold) {
        return {
          passed: false,
          message: `Content not relevant to allowed topics. Score: ${rating.relevanceScore}`,
          metadata: rating
        };
      }

      return { passed: true, metadata: rating };
    }
  };
}

// ============================================
// FORMAT VALIDATION GUARDRAIL
// ============================================

/**
 * Create a guardrail that validates content format (JSON, XML, YAML, Markdown).
 * Optionally validates against a Zod schema for structured data.
 * 
 * @template TContext - Type of context object
 * 
 * @param {Object} config - Guardrail configuration
 * @param {string} [config.name] - Custom guardrail name
 * @param {'input' | 'output'} config.type - Whether to validate input or output
 * @param {'json' | 'xml' | 'yaml' | 'markdown'} config.format - Expected format
 * @param {z.ZodSchema} [config.schema] - Optional Zod schema for validation
 * @returns {Guardrail<TContext>} Guardrail instance
 * 
 * @example
 * ```typescript
 * const guardrail = formatValidationGuardrail({
 *   type: 'output',
 *   format: 'json',
 *   schema: z.object({ name: z.string(), age: z.number() })
 * });
 * ```
 */
export function formatValidationGuardrail<TContext = any>(config: {
  name?: string;
  type: 'input' | 'output';
  format: 'json' | 'xml' | 'yaml' | 'markdown';
  schema?: z.ZodSchema;
}): Guardrail<TContext> {
  return {
    name: config.name || 'format_validation',
    type: config.type,
    validate: async (content: string) => {
      try {
        switch (config.format) {
          case 'json':
            const parsed = JSON.parse(content);
            if (config.schema) {
              config.schema.parse(parsed);
            }
            break;

          case 'xml':
            // Simple XML validation
            if (!content.trim().startsWith('<') || !content.trim().endsWith('>')) {
              throw new Error('Invalid XML format');
            }
            break;

          case 'yaml':
            // Would need yaml parser
            throw new Error('YAML validation not implemented');

          case 'markdown':
            // Check for common markdown syntax elements
            const mdPatterns = [
              /^#{1,6}\s/m,           // Headers
              /\*\*.+?\*\*/,           // Bold
              /\*.+?\*/,               // Italic
              /\[.+?\]\(.+?\)/,        // Links
              /^\s*[-*+]\s/m,          // Unordered lists
              /^\s*\d+\.\s/m,          // Ordered lists
              /^>\s/m,                 // Blockquotes
              /```[\s\S]*?```/,        // Code blocks
              /`[^`]+`/,              // Inline code
              /^\s*---\s*$/m,          // Horizontal rules
              /!\[.*?\]\(.*?\)/,       // Images
            ];
            if (!mdPatterns.some(p => p.test(content))) {
              throw new Error('Content does not contain recognizable markdown formatting');
            }
            break;
        }

        return { passed: true };
      } catch (error: any) {
        return {
          passed: false,
          message: `Format validation failed: ${error?.message || 'Unknown error'}`
        };
      }
    }
  };
}

// ============================================
// CUSTOM FUNCTION GUARDRAIL
// ============================================

/**
 * Create a custom guardrail with your own validation function.
 * Provides maximum flexibility for custom validation logic.
 * 
 * @template TContext - Type of context object
 * 
 * @param {Object} config - Guardrail configuration
 * @param {string} config.name - Unique name for the guardrail
 * @param {'input' | 'output'} config.type - Whether to validate input or output
 * @param {Function} config.validate - Validation function
 * @param {string} config.validate.content - Content to validate
 * @param {RunContextWrapper} config.validate.context - Execution context
 * @returns {Promise<GuardrailResult> | GuardrailResult} Validation result
 * @returns {Guardrail<TContext>} Guardrail instance
 * 
 * @example
 * ```typescript
 * const guardrail = customGuardrail({
 *   name: 'business-hours',
 *   type: 'input',
 *   validate: async (content, context) => {
 *     const hour = new Date().getHours();
 *     return {
 *       passed: hour >= 9 && hour <= 17,
 *       message: 'Service only available 9 AM - 5 PM'
 *     };
 *   }
 * });
 * ```
 */
export function customGuardrail<TContext = any>(config: {
  name: string;
  type: 'input' | 'output';
  validate: (content: string, context: RunContextWrapper<TContext>) => Promise<GuardrailResult> | GuardrailResult;
}): Guardrail<TContext> {
  return {
    name: config.name,
    type: config.type,
    validate: config.validate
  };
}

// ============================================
// RATE LIMITING GUARDRAIL
// ============================================

/**
 * Create a guardrail that enforces rate limiting based on a key extracted from context.
 * Uses an in-memory Map for tracking requests (consider Redis for distributed systems).
 * 
 * @template TContext - Type of context object
 * 
 * @param {Object} config - Guardrail configuration
 * @param {string} [config.name] - Custom guardrail name
 * @param {Map} config.storage - Map for storing rate limit counters (key -> { count, resetAt })
 * @param {number} config.maxRequests - Maximum requests allowed per window
 * @param {number} config.windowMs - Time window in milliseconds
 * @param {Function} config.keyExtractor - Function to extract rate limit key from context
 * @param {RunContextWrapper} config.keyExtractor.context - Execution context
 * @returns {string} Rate limit key (e.g., user ID, session ID)
 * @returns {Guardrail<TContext>} Guardrail instance
 * 
 * @example
 * ```typescript
 * const storage = new Map();
 * const guardrail = rateLimitGuardrail({
 *   storage,
 *   maxRequests: 10,
 *   windowMs: 60000, // 1 minute
 *   keyExtractor: (context) => context.context.userId
 * });
 * ```
 */
export function rateLimitGuardrail<TContext = any>(config: {
  name?: string;
  storage: Map<string, { count: number; resetAt: number }>;
  maxRequests: number;
  windowMs: number;
  keyExtractor: (context: RunContextWrapper<TContext>) => string;
}): Guardrail<TContext> {
  return {
    name: config.name || 'rate_limit',
    type: 'input',
    validate: async (content: string, context: RunContextWrapper<TContext>) => {
      const key = config.keyExtractor(context);
      const now = Date.now();

      let entry = config.storage.get(key);

      if (!entry || now > entry.resetAt) {
        entry = {
          count: 0,
          resetAt: now + config.windowMs
        };
      }

      entry.count++;
      config.storage.set(key, entry);

      // Probabilistic cleanup of expired entries to prevent memory leak.
      // Only run ~5% of the time when storage exceeds 100 entries to avoid O(n) cost on every call.
      if (config.storage.size > 100 && Math.random() < 0.05) {
        const cleanupNow = Date.now();
        for (const [k, v] of config.storage) {
          if (cleanupNow > v.resetAt) {
            config.storage.delete(k);
          }
        }
      }

      if (entry.count > config.maxRequests) {
        const resetIn = Math.ceil((entry.resetAt - now) / 1000);
        return {
          passed: false,
          message: `Rate limit exceeded. Try again in ${resetIn} seconds.`,
          metadata: {
            count: entry.count,
            limit: config.maxRequests,
            resetIn
          }
        };
      }

      return { passed: true };
    }
  };
}

// ============================================
// LANGUAGE DETECTION GUARDRAIL
// ============================================

/**
 * Create a guardrail that ensures content is in allowed language(s).
 * Uses an AI model to detect the language of the content.
 * 
 * @template TContext - Type of context object
 * 
 * @param {Object} config - Guardrail configuration
 * @param {string} [config.name] - Custom guardrail name
 * @param {'input' | 'output'} config.type - Whether to validate input or output
 * @param {LanguageModel} config.model - Model to use for language detection
 * @param {string[]} config.allowedLanguages - Array of ISO 639-1 language codes (e.g., ['en', 'es', 'fr'])
 * @returns {Guardrail<TContext>} Guardrail instance
 * 
 * @example
 * ```typescript
 * const guardrail = languageGuardrail({
 *   type: 'input',
 *   model: openai('gpt-4o-mini'),
 *   allowedLanguages: ['en', 'es']
 * });
 * ```
 */
export function languageGuardrail<TContext = any>(config: {
  name?: string;
  type: 'input' | 'output';
  model: any;
  allowedLanguages: string[];
}): Guardrail<TContext> {
  return {
    name: config.name || 'language_detection',
    type: config.type,
    validate: async (content: string) => {
      // Get parent span for nesting
      const parentSpan = getCurrentSpan();
      
      // Create GENERATION trace for this LLM-based guardrail
      const generation = parentSpan?.generation({
        name: `Guardrail: ${config.name || 'language_detection'}`,
        model: extractModelName(config.model),
        input: {
          system: 'Detect the language of the text. Respond with the ISO 639-1 language code.',
          prompt: content
        },
        metadata: {
          guardrailName: config.name || 'language_detection',
          guardrailType: config.type,
          allowedLanguages: config.allowedLanguages
        }
      });

      const languageSchema = z.object({
        language: z.string().describe('ISO 639-1 language code (e.g., en, es, fr)'),
        confidence: z.number().describe('Confidence score from 0 to 1')
      });

      const result = await generateObject({
        model: config.model,
        schema: languageSchema,
        schemaName: 'LanguageDetection',
        system: 'Detect the language of the text. Respond with the ISO 639-1 language code.',
        prompt: content,
      });

      const detection = result.object;

      // End generation with usage tracking
      if (generation) {
        generation.end({
          output: {
            detection,
            passed: config.allowedLanguages.includes(detection.language)
          },
          usage: {
            input: result.usage?.inputTokens || 0,
            output: result.usage?.outputTokens || 0,
            total: (result.usage?.inputTokens || 0) + (result.usage?.outputTokens || 0)
          }
        });
      }

      if (!config.allowedLanguages.includes(detection.language)) {
        return {
          passed: false,
          message: `Language not allowed: ${detection.language}. Allowed: ${config.allowedLanguages.join(', ')}`,
          metadata: detection
        };
      }

      return { passed: true, metadata: detection };
    }
  };
}

// ============================================
// SENTIMENT GUARDRAIL
// ============================================

/**
 * Create a guardrail that blocks or allows content based on sentiment.
 * Uses an AI model to analyze sentiment (positive, negative, neutral).
 * 
 * @template TContext - Type of context object
 * 
 * @param {Object} config - Guardrail configuration
 * @param {string} [config.name] - Custom guardrail name
 * @param {'input' | 'output'} config.type - Whether to validate input or output
 * @param {LanguageModel} config.model - Model to use for sentiment analysis
 * @param {Array<'positive' | 'negative' | 'neutral'>} [config.blockedSentiments] - Sentiments to block
 * @param {Array<'positive' | 'negative' | 'neutral'>} [config.allowedSentiments] - Sentiments to allow (whitelist)
 * @returns {Guardrail<TContext>} Guardrail instance
 * 
 * @example
 * ```typescript
 * const guardrail = sentimentGuardrail({
 *   type: 'output',
 *   model: openai('gpt-4o-mini'),
 *   blockedSentiments: ['negative']
 * });
 * ```
 */
export function sentimentGuardrail<TContext = any>(config: {
  name?: string;
  type: 'input' | 'output';
  model: any;
  blockedSentiments?: ('positive' | 'negative' | 'neutral')[];
  allowedSentiments?: ('positive' | 'negative' | 'neutral')[];
}): Guardrail<TContext> {
  return {
    name: config.name || 'sentiment_check',
    type: config.type,
    validate: async (content: string) => {
      // Get parent span for nesting
      const parentSpan = getCurrentSpan();
      
      // Create GENERATION trace for this LLM-based guardrail
      const generation = parentSpan?.generation({
        name: `Guardrail: ${config.name || 'sentiment_check'}`,
        model: extractModelName(config.model),
        input: {
          system: 'Analyze the sentiment of the text as positive, negative, or neutral.',
          prompt: content
        },
        metadata: {
          guardrailName: config.name || 'sentiment_check',
          guardrailType: config.type
        }
      });

      const sentimentSchema = z.object({
        sentiment: z.enum(['positive', 'negative', 'neutral']).describe('The detected sentiment'),
        confidence: z.number().describe('Confidence score from 0 to 1'),
        reasoning: z.string().describe('Brief explanation of the sentiment assessment')
      });

      const result = await generateObject({
        model: config.model,
        schema: sentimentSchema,
        schemaName: 'SentimentAnalysis',
        system: 'Analyze the sentiment of the text as positive, negative, or neutral.',
        prompt: content,
      });

      const sentiment = result.object;

      // End generation with usage tracking
      if (generation) {
        const passed = !(config.blockedSentiments?.includes(sentiment.sentiment) ||
          (config.allowedSentiments && !config.allowedSentiments.includes(sentiment.sentiment)));

        generation.end({
          output: {
            sentiment,
            passed
          },
          usage: {
            input: result.usage?.inputTokens || 0,
            output: result.usage?.outputTokens || 0,
            total: (result.usage?.inputTokens || 0) + (result.usage?.outputTokens || 0)
          }
        });
      }

      if (config.blockedSentiments?.includes(sentiment.sentiment)) {
        return {
          passed: false,
          message: `Sentiment not allowed: ${sentiment.sentiment}`,
          metadata: sentiment
        };
      }

      if (config.allowedSentiments && !config.allowedSentiments.includes(sentiment.sentiment)) {
        return {
          passed: false,
          message: `Sentiment not in allowed list: ${sentiment.sentiment}`,
          metadata: sentiment
        };
      }

      return { passed: true, metadata: sentiment };
    }
  };
}

// ============================================
// TOXICITY GUARDRAIL
// ============================================

/**
 * Create a guardrail that detects and blocks toxic content.
 * Uses an AI model to analyze content toxicity on a 0-10 scale.
 * 
 * @template TContext - Type of context object
 * 
 * @param {Object} config - Guardrail configuration
 * @param {string} [config.name] - Custom guardrail name
 * @param {'input' | 'output'} config.type - Whether to validate input or output
 * @param {LanguageModel} config.model - Model to use for toxicity detection
 * @param {number} [config.threshold] - Toxicity threshold (0-10 scale, default: 5)
 * @returns {Guardrail<TContext>} Guardrail instance
 * 
 * @example
 * ```typescript
 * const guardrail = toxicityGuardrail({
 *   type: 'input',
 *   model: openai('gpt-4o-mini'),
 *   threshold: 7
 * });
 * ```
 */
export function toxicityGuardrail<TContext = any>(config: {
  name?: string;
  type: 'input' | 'output';
  model: any;
  threshold?: number; // 0-10 scale
}): Guardrail<TContext> {
  return {
    name: config.name || 'toxicity_check',
    type: config.type,
    validate: async (content: string) => {
      // Get parent span for nesting
      const parentSpan = getCurrentSpan();
      
      // Create GENERATION trace for this LLM-based guardrail
      const generation = parentSpan?.generation({
        name: `Guardrail: ${config.name || 'toxicity_check'}`,
        model: extractModelName(config.model),
        input: {
          system: 'Rate the toxicity of the text on a scale from 0 (not toxic) to 10 (extremely toxic).',
          prompt: content
        },
        metadata: {
          guardrailName: config.name || 'toxicity_check',
          guardrailType: config.type,
          threshold: config.threshold || 5
        }
      });

      const toxicitySchema = z.object({
        toxicityScore: z.number().describe('Toxicity score from 0 (not toxic) to 10 (extremely toxic)'),
        categories: z.array(z.string()).describe('Categories of toxicity detected'),
        explanation: z.string().describe('Brief explanation of the toxicity assessment')
      });

      const result = await generateObject({
        model: config.model,
        schema: toxicitySchema,
        schemaName: 'ToxicityRating',
        system: 'Rate the toxicity of the text on a scale from 0 (not toxic) to 10 (extremely toxic).',
        prompt: content,
      });

      const rating = result.object;
      const threshold = config.threshold || 5;

      // End generation with usage tracking
      if (generation) {
        generation.end({
          output: {
            rating,
            passed: rating.toxicityScore <= threshold
          },
          usage: {
            input: result.usage?.inputTokens || 0,
            output: result.usage?.outputTokens || 0,
            total: (result.usage?.inputTokens || 0) + (result.usage?.outputTokens || 0)
          }
        });
      }

      if (rating.toxicityScore > threshold) {
        return {
          passed: false,
          message: `Content toxicity too high: ${rating.toxicityScore} (threshold: ${threshold})`,
          metadata: rating
        };
      }

      return { passed: true, metadata: rating };
    }
  };
}

// ============================================
// EXPORT ALL GUARDRAILS
// ============================================

export const guardrails = {
  contentSafety: contentSafetyGuardrail,
  piiDetection: piiDetectionGuardrail,
  length: lengthGuardrail,
  topicRelevance: topicRelevanceGuardrail,
  formatValidation: formatValidationGuardrail,
  custom: customGuardrail,
  rateLimit: rateLimitGuardrail,
  language: languageGuardrail,
  sentiment: sentimentGuardrail,
  toxicity: toxicityGuardrail
};
