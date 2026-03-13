"use strict";
/**
 * Langfuse Tracing Integration
 *
 * @module lifecycle/langfuse
 * @description
 * Enterprise-grade observability and tracing for AI agents.
 *
 * **Features**:
 * - End-to-end trace visualization
 * - Agent execution tracking
 * - Tool call monitoring
 * - LLM generation tracing
 * - Guardrail execution tracking
 * - Token usage analytics
 * - Cost tracking
 * - Performance metrics
 *
 * **Trace Hierarchy**:
 * ```
 * Trace (Agent Run)
 * ├── Agent Span (Coordinator)
 * │   ├── Generation (LLM Call)
 * │   └── Tool Span (Tool Execution)
 * └── Agent Span (Specialist)
 *     ├── Guardrail Span (Input Validation)
 *     ├── Generation (LLM Call)
 *     └── Guardrail Span (Output Validation)
 * ```
 *
 * @see {@link https://langfuse.com Langfuse Documentation}
 * @author Tawk.to
 * @license MIT
 * @version 1.0.0
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.initializeLangfuse = initializeLangfuse;
exports.getLangfuse = getLangfuse;
exports.isLangfuseEnabled = isLangfuseEnabled;
exports.createTrace = createTrace;
exports.createGeneration = createGeneration;
exports.updateGeneration = updateGeneration;
exports.endGeneration = endGeneration;
exports.createSpan = createSpan;
exports.endSpan = endSpan;
exports.score = score;
exports.flushLangfuse = flushLangfuse;
exports.shutdownLangfuse = shutdownLangfuse;
exports.formatMessagesForLangfuse = formatMessagesForLangfuse;
exports.extractModelName = extractModelName;
const langfuse_1 = require("langfuse");
let langfuseInstance = null;
let isEnabled = false;
/**
 * Initialize Langfuse with credentials from environment variables
 */
function initializeLangfuse() {
    // Check if already initialized
    if (langfuseInstance) {
        return langfuseInstance;
    }
    // Check for required environment variables
    const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
    const secretKey = process.env.LANGFUSE_SECRET_KEY;
    const baseUrl = process.env.LANGFUSE_BASE_URL || 'https://cloud.langfuse.com';
    if (!publicKey || !secretKey) {
        if (process.env.NODE_ENV === 'development') {
            console.warn('⚠️  Langfuse not initialized: Missing LANGFUSE_PUBLIC_KEY or LANGFUSE_SECRET_KEY');
        }
        return null;
    }
    try {
        langfuseInstance = new langfuse_1.Langfuse({
            publicKey,
            secretKey,
            baseUrl,
            flushAt: 1, // Flush immediately for testing
            flushInterval: 1000, // Flush every 1 second
            requestTimeout: 10000,
        });
        isEnabled = true;
        return langfuseInstance;
    }
    catch (error) {
        console.error('❌ Failed to initialize Langfuse:', error);
        return null;
    }
}
/**
 * Get the current Langfuse instance (initializes if needed)
 */
function getLangfuse() {
    if (!langfuseInstance) {
        return initializeLangfuse();
    }
    return langfuseInstance;
}
/**
 * Check if Langfuse tracing is enabled
 * Auto-initializes Langfuse if credentials are available
 */
function isLangfuseEnabled() {
    // Auto-initialize if not already done (lazy initialization)
    if (!langfuseInstance) {
        initializeLangfuse();
    }
    return isEnabled && langfuseInstance !== null;
}
/**
 * Create a trace for an agent run
 */
function createTrace(options) {
    const langfuse = getLangfuse();
    if (!langfuse)
        return null;
    try {
        const trace = langfuse.trace({
            name: options.name,
            userId: options.userId,
            sessionId: options.sessionId,
            input: options.input,
            output: options.output,
            metadata: options.metadata,
            tags: options.tags,
        });
        return trace;
    }
    catch (error) {
        console.error('Failed to create Langfuse trace:', error);
        return null;
    }
}
/**
 * Create a generation span within a trace
 */
function createGeneration(trace, options) {
    if (!trace)
        return null;
    try {
        const generation = trace.generation({
            name: options.name,
            model: options.model,
            modelParameters: options.modelParameters,
            input: options.input,
            metadata: options.metadata,
        });
        return generation;
    }
    catch (error) {
        console.error('Failed to create Langfuse generation:', error);
        return null;
    }
}
/**
 * Update a generation with output and usage data
 */
function updateGeneration(generation, options) {
    if (!generation)
        return;
    try {
        generation.update({
            output: options.output,
            usage: options.usage,
            metadata: options.metadata,
        });
    }
    catch (error) {
        console.error('Failed to update Langfuse generation:', error);
    }
}
/**
 * End a generation with completion status
 */
function endGeneration(generation, options) {
    if (!generation)
        return;
    try {
        // Langfuse generation.end() accepts output, level, and statusMessage
        // Make sure we always call end() even if output is null
        generation.end({
            output: options?.output !== undefined ? options.output : null,
            level: options?.level || 'DEFAULT',
            statusMessage: options?.statusMessage,
        });
    }
    catch (error) {
        console.error('Failed to end Langfuse generation:', error);
        // Try alternative: update then end
        try {
            if (generation.update) {
                generation.update({
                    output: options?.output !== undefined ? options.output : null,
                });
            }
            if (generation.end) {
                generation.end();
            }
        }
        catch (fallbackError) {
            console.error('Failed to end generation with fallback:', fallbackError);
        }
    }
}
/**
 * Create a span for tool execution
 */
function createSpan(trace, options) {
    if (!trace)
        return null;
    try {
        const span = trace.span({
            name: options.name,
            input: options.input,
            metadata: options.metadata,
        });
        return span;
    }
    catch (error) {
        console.error('Failed to create Langfuse span:', error);
        return null;
    }
}
/**
 * End a span with output data
 */
function endSpan(span, options) {
    if (!span)
        return;
    try {
        span.end({
            output: options?.output,
            level: options?.level,
            statusMessage: options?.statusMessage,
        });
    }
    catch (error) {
        console.error('Failed to end Langfuse span:', error);
    }
}
/**
 * Score a trace or generation
 */
function score(options) {
    const langfuse = getLangfuse();
    if (!langfuse)
        return;
    try {
        langfuse.score({
            traceId: options.traceId,
            observationId: options.observationId,
            name: options.name,
            value: options.value,
            comment: options.comment,
        });
    }
    catch (error) {
        console.error('Failed to score Langfuse trace:', error);
    }
}
/**
 * Flush all pending traces to Langfuse
 */
async function flushLangfuse() {
    const langfuse = getLangfuse();
    if (!langfuse)
        return;
    try {
        await langfuse.flushAsync();
    }
    catch (error) {
        console.error('Failed to flush Langfuse:', error);
    }
}
/**
 * Shutdown Langfuse and flush all pending traces
 */
async function shutdownLangfuse() {
    const langfuse = getLangfuse();
    if (!langfuse)
        return;
    try {
        await langfuse.shutdownAsync();
        langfuseInstance = null;
        isEnabled = false;
    }
    catch (error) {
        console.error('Failed to shutdown Langfuse:', error);
    }
}
/**
 * Helper to format messages for Langfuse
 */
function formatMessagesForLangfuse(messages) {
    return messages.map(msg => ({
        role: msg.role,
        content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
    }));
}
/**
 * Helper to extract model name from model config
 */
function extractModelName(model) {
    if (typeof model === 'string')
        return model;
    if (model?.modelId)
        return model.modelId;
    if (model?.provider && model?.model)
        return `${model.provider}/${model.model}`;
    return 'unknown';
}
//# sourceMappingURL=index.js.map