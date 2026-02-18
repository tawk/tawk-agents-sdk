"use strict";
/**
 * Guardrails Shared Utilities
 *
 * @module guardrails/utils
 * @description Helper functions for guardrail validation
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PII_PATTERNS = void 0;
exports.createGuardrailGeneration = createGuardrailGeneration;
exports.endGuardrailGeneration = endGuardrailGeneration;
exports.calculateLength = calculateLength;
const context_1 = require("../tracing/context");
const langfuse_1 = require("../lifecycle/langfuse");
/**
 * Create a traced generation for LLM-based guardrails
 * Wraps the guardrail execution in proper Langfuse tracing
 */
function createGuardrailGeneration(config) {
    const parentSpan = (0, context_1.getCurrentSpan)();
    return parentSpan?.generation({
        name: `Guardrail: ${config.name}`,
        model: (0, langfuse_1.extractModelName)(config.model),
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
function endGuardrailGeneration(generation, result, passed) {
    if (!generation)
        return;
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
 * PII detection patterns
 */
exports.PII_PATTERNS = {
    email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    phone: /\b(\+\d{1,3}[-.]?)?\(?\d{3}\)?[-.]?\d{3}[-.]?\d{4}\b/g,
    ssn: /\b\d{3}-\d{2}-\d{4}\b/g,
    creditCard: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g,
    ipAddress: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g
};
/**
 * Calculate content length based on unit
 * @param content - The content to measure
 * @param unit - Unit of measurement (characters or words)
 * @returns The length of the content in the specified unit
 */
function calculateLength(content, unit = 'characters') {
    switch (unit) {
        case 'characters':
            return content.length;
        case 'words':
            return content.split(/\s+/).length;
    }
}
//# sourceMappingURL=utils.js.map