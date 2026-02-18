"use strict";
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
 * @version 1.0.0
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.guardrails = void 0;
exports.contentSafetyGuardrail = contentSafetyGuardrail;
exports.piiDetectionGuardrail = piiDetectionGuardrail;
exports.lengthGuardrail = lengthGuardrail;
exports.topicRelevanceGuardrail = topicRelevanceGuardrail;
exports.formatValidationGuardrail = formatValidationGuardrail;
exports.customGuardrail = customGuardrail;
exports.rateLimitGuardrail = rateLimitGuardrail;
exports.languageGuardrail = languageGuardrail;
exports.sentimentGuardrail = sentimentGuardrail;
exports.toxicityGuardrail = toxicityGuardrail;
const ai_1 = require("ai");
const zod_1 = require("zod");
const context_1 = require("../tracing/context");
const langfuse_1 = require("../lifecycle/langfuse");
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
function contentSafetyGuardrail(config) {
    return {
        name: config.name || 'content_safety',
        type: config.type,
        validate: async (content, _context) => {
            const categories = config.categories || [
                'hate speech',
                'violence',
                'sexual content',
                'harassment',
                'self-harm'
            ];
            // Get parent span for nesting (from guardrails span)
            const parentSpan = (0, context_1.getCurrentSpan)();
            // Create GENERATION trace for this LLM-based guardrail
            const generation = parentSpan?.generation({
                name: `Guardrail: ${config.name || 'content_safety'}`,
                model: (0, langfuse_1.extractModelName)(config.model),
                input: {
                    system: `You are a content moderation system. Analyze the following text and determine if it contains any of these categories: ${categories.join(', ')}. Respond with a JSON object.`,
                    prompt: content
                },
                metadata: {
                    guardrailName: config.name || 'content_safety',
                    guardrailType: config.type,
                    categories
                }
            });
            const result = await (0, ai_1.generateText)({
                model: config.model,
                system: `You are a content moderation system. Analyze the following text and determine if it contains any of these categories: ${categories.join(', ')}. Respond with a JSON object.`,
                prompt: content,
                tools: {
                    classify: {
                        description: 'Classify content safety',
                        inputSchema: zod_1.z.object({
                            isSafe: zod_1.z.boolean(),
                            detectedCategories: zod_1.z.array(zod_1.z.string()),
                            confidence: zod_1.z.number()
                        }),
                        execute: async (args) => args
                    }
                }
            });
            const classification = result.toolCalls?.[0]?.input;
            // End generation with usage tracking
            if (generation) {
                generation.end({
                    output: {
                        classification,
                        passed: !classification || classification.isSafe
                    },
                    usage: {
                        input: result.usage?.inputTokens || 0,
                        output: result.usage?.outputTokens || 0,
                        total: (result.usage?.inputTokens || 0) + (result.usage?.outputTokens || 0)
                    }
                });
            }
            if (!classification || classification.isSafe) {
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
function piiDetectionGuardrail(config) {
    const piiPatterns = {
        email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
        phone: /\b(\+\d{1,3}[-.]?)?\(?\d{3}\)?[-.]?\d{3}[-.]?\d{4}\b/g,
        ssn: /\b\d{3}-\d{2}-\d{4}\b/g,
        creditCard: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g,
        ipAddress: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g
    };
    return {
        name: config.name || 'pii_detection',
        type: config.type,
        validate: async (content) => {
            const detectedPII = [];
            // Check each PII category
            for (const [category, pattern] of Object.entries(piiPatterns)) {
                if (!config.categories || config.categories.includes(category)) {
                    const matches = content.match(pattern);
                    if (matches) {
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
                }
                else {
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
function lengthGuardrail(config) {
    const unit = config.unit || 'characters';
    return {
        name: config.name || 'length_check',
        type: config.type,
        validate: async (content, contextWrapper) => {
            const characterLength = content.length;
            const tokenCount = await contextWrapper.agent._tokenizerFn(content);
            // Calculate length in configured unit
            let length;
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
function topicRelevanceGuardrail(config) {
    return {
        name: config.name || 'topic_relevance',
        type: config.type,
        validate: async (content) => {
            // Get parent span for nesting
            const parentSpan = (0, context_1.getCurrentSpan)();
            // Create GENERATION trace for this LLM-based guardrail
            const generation = parentSpan?.generation({
                name: `Guardrail: ${config.name || 'topic_relevance'}`,
                model: (0, langfuse_1.extractModelName)(config.model),
                input: {
                    system: `Analyze if the following text is relevant to these topics: ${config.allowedTopics.join(', ')}. Rate relevance from 0-10.`,
                    prompt: content
                },
                metadata: {
                    guardrailName: config.name || 'topic_relevance',
                    guardrailType: config.type,
                    allowedTopics: config.allowedTopics
                }
            });
            const result = await (0, ai_1.generateText)({
                model: config.model,
                system: `Analyze if the following text is relevant to these topics: ${config.allowedTopics.join(', ')}. Rate relevance from 0-10.`,
                prompt: content,
                tools: {
                    rate_relevance: {
                        description: 'Rate topic relevance',
                        inputSchema: zod_1.z.object({
                            isRelevant: zod_1.z.boolean(),
                            relevanceScore: zod_1.z.number(),
                            matchedTopics: zod_1.z.array(zod_1.z.string()),
                            reasoning: zod_1.z.string()
                        }),
                        execute: async (args) => args
                    }
                }
            });
            const rating = result.toolCalls?.[0]?.input;
            const threshold = config.threshold || 5;
            // End generation with usage tracking
            if (generation) {
                generation.end({
                    output: {
                        rating,
                        passed: rating && rating.isRelevant && rating.relevanceScore >= threshold
                    },
                    usage: {
                        input: result.usage?.inputTokens || 0,
                        output: result.usage?.outputTokens || 0,
                        total: (result.usage?.inputTokens || 0) + (result.usage?.outputTokens || 0)
                    }
                });
            }
            if (!rating || !rating.isRelevant || rating.relevanceScore < threshold) {
                return {
                    passed: false,
                    message: `Content not relevant to allowed topics. Score: ${rating?.relevanceScore || 0}`,
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
function formatValidationGuardrail(config) {
    return {
        name: config.name || 'format_validation',
        type: config.type,
        validate: async (content) => {
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
                        // Basic markdown check
                        if (!content.includes('#') && !content.includes('*') && !content.includes('[')) {
                            throw new Error('Content does not appear to be markdown');
                        }
                        break;
                }
                return { passed: true };
            }
            catch (error) {
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
function customGuardrail(config) {
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
function rateLimitGuardrail(config) {
    return {
        name: config.name || 'rate_limit',
        type: 'input',
        validate: async (content, context) => {
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
function languageGuardrail(config) {
    return {
        name: config.name || 'language_detection',
        type: config.type,
        validate: async (content) => {
            // Get parent span for nesting
            const parentSpan = (0, context_1.getCurrentSpan)();
            // Create GENERATION trace for this LLM-based guardrail
            const generation = parentSpan?.generation({
                name: `Guardrail: ${config.name || 'language_detection'}`,
                model: (0, langfuse_1.extractModelName)(config.model),
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
            const result = await (0, ai_1.generateText)({
                model: config.model,
                system: 'Detect the language of the text. Respond with the ISO 639-1 language code.',
                prompt: content,
                tools: {
                    detect_language: {
                        description: 'Detect language',
                        inputSchema: zod_1.z.object({
                            language: zod_1.z.string(),
                            confidence: zod_1.z.number()
                        }),
                        execute: async (args) => args
                    }
                }
            });
            const detection = result.toolCalls?.[0]?.input;
            // End generation with usage tracking
            if (generation) {
                generation.end({
                    output: {
                        detection,
                        passed: detection && config.allowedLanguages.includes(detection.language)
                    },
                    usage: {
                        input: result.usage?.inputTokens || 0,
                        output: result.usage?.outputTokens || 0,
                        total: (result.usage?.inputTokens || 0) + (result.usage?.outputTokens || 0)
                    }
                });
            }
            if (!detection || !config.allowedLanguages.includes(detection.language)) {
                return {
                    passed: false,
                    message: `Language not allowed: ${detection?.language || 'unknown'}. Allowed: ${config.allowedLanguages.join(', ')}`,
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
function sentimentGuardrail(config) {
    return {
        name: config.name || 'sentiment_check',
        type: config.type,
        validate: async (content) => {
            // Get parent span for nesting
            const parentSpan = (0, context_1.getCurrentSpan)();
            // Create GENERATION trace for this LLM-based guardrail
            const generation = parentSpan?.generation({
                name: `Guardrail: ${config.name || 'sentiment_check'}`,
                model: (0, langfuse_1.extractModelName)(config.model),
                input: {
                    system: 'Analyze the sentiment of the text as positive, negative, or neutral.',
                    prompt: content
                },
                metadata: {
                    guardrailName: config.name || 'sentiment_check',
                    guardrailType: config.type
                }
            });
            const result = await (0, ai_1.generateText)({
                model: config.model,
                system: 'Analyze the sentiment of the text as positive, negative, or neutral.',
                prompt: content,
                tools: {
                    analyze_sentiment: {
                        description: 'Analyze sentiment',
                        inputSchema: zod_1.z.object({
                            sentiment: zod_1.z.enum(['positive', 'negative', 'neutral']),
                            confidence: zod_1.z.number(),
                            reasoning: zod_1.z.string()
                        }),
                        execute: async (args) => args
                    }
                }
            });
            const sentiment = result.toolCalls?.[0]?.input;
            // End generation with usage tracking
            if (generation) {
                const passed = !(config.blockedSentiments?.includes(sentiment?.sentiment) ||
                    (config.allowedSentiments && !config.allowedSentiments.includes(sentiment?.sentiment)));
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
            if (config.blockedSentiments?.includes(sentiment?.sentiment)) {
                return {
                    passed: false,
                    message: `Sentiment not allowed: ${sentiment?.sentiment || 'unknown'}`,
                    metadata: sentiment
                };
            }
            if (config.allowedSentiments && !config.allowedSentiments.includes(sentiment?.sentiment)) {
                return {
                    passed: false,
                    message: `Sentiment not in allowed list: ${sentiment?.sentiment || 'unknown'}`,
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
function toxicityGuardrail(config) {
    return {
        name: config.name || 'toxicity_check',
        type: config.type,
        validate: async (content) => {
            // Get parent span for nesting
            const parentSpan = (0, context_1.getCurrentSpan)();
            // Create GENERATION trace for this LLM-based guardrail
            const generation = parentSpan?.generation({
                name: `Guardrail: ${config.name || 'toxicity_check'}`,
                model: (0, langfuse_1.extractModelName)(config.model),
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
            const result = await (0, ai_1.generateText)({
                model: config.model,
                system: 'Rate the toxicity of the text on a scale from 0 (not toxic) to 10 (extremely toxic).',
                prompt: content,
                tools: {
                    rate_toxicity: {
                        description: 'Rate toxicity',
                        inputSchema: zod_1.z.object({
                            toxicityScore: zod_1.z.number(),
                            categories: zod_1.z.array(zod_1.z.string()),
                            explanation: zod_1.z.string()
                        }),
                        execute: async (args) => args
                    }
                }
            });
            const rating = result.toolCalls?.[0]?.input;
            const threshold = config.threshold || 5;
            // End generation with usage tracking
            if (generation) {
                generation.end({
                    output: {
                        rating,
                        passed: !rating || rating.toxicityScore <= threshold
                    },
                    usage: {
                        input: result.usage?.inputTokens || 0,
                        output: result.usage?.outputTokens || 0,
                        total: (result.usage?.inputTokens || 0) + (result.usage?.outputTokens || 0)
                    }
                });
            }
            if (rating && rating.toxicityScore > threshold) {
                return {
                    passed: false,
                    message: `Content toxicity too high: ${rating.toxicityScore || 0} (threshold: ${threshold})`,
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
exports.guardrails = {
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
//# sourceMappingURL=index.js.map