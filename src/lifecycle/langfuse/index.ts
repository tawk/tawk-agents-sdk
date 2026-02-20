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

import { Langfuse } from 'langfuse';
import type { ModelMessage } from 'ai';

let langfuseInstance: Langfuse | null = null;
let isEnabled = false;
let initAttempted = false;

/**
 * Initialize Langfuse with credentials from environment variables.
 * Thread-safe: uses a flag to ensure initialization runs at most once.
 */
export function initializeLangfuse(): Langfuse | null {
  // Check if already initialized or already attempted
  if (langfuseInstance) {
    return langfuseInstance;
  }
  if (initAttempted) {
    return null;
  }
  initAttempted = true;

  // Check for required environment variables
  const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
  const secretKey = process.env.LANGFUSE_SECRET_KEY;
  const baseUrl = process.env.LANGFUSE_BASE_URL || 'https://cloud.langfuse.com';

  if (!publicKey || !secretKey) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('Langfuse not initialized: Missing LANGFUSE_PUBLIC_KEY or LANGFUSE_SECRET_KEY');
    }
    return null;
  }

  try {
    const flushAt = parseInt(process.env.LANGFUSE_FLUSH_AT || '15', 10);

    langfuseInstance = new Langfuse({
      publicKey,
      secretKey,
      baseUrl,
      flushAt, // Configurable via env; defaults to 15 for production batching
      flushInterval: 1000,
      requestTimeout: 10000,
    });

    isEnabled = true;
    if (process.env.NODE_ENV === 'development') {
      console.log('Langfuse tracing initialized:', baseUrl);
    }
    return langfuseInstance;
  } catch (error) {
    // Sanitize error — don't log credentials
    const safeMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Failed to initialize Langfuse:', safeMessage);
    return null;
  }
}

/**
 * Get the current Langfuse instance (initializes if needed)
 */
export function getLangfuse(): Langfuse | null {
  if (!langfuseInstance && !initAttempted) {
    return initializeLangfuse();
  }
  return langfuseInstance;
}

/**
 * Check if Langfuse tracing is enabled
 * Auto-initializes Langfuse if credentials are available
 */
export function isLangfuseEnabled(): boolean {
  if (!langfuseInstance && !initAttempted) {
    initializeLangfuse();
  }
  return isEnabled && langfuseInstance !== null;
}

/**
 * Create a trace for an agent run
 */
export function createTrace(options: {
  name: string;
  userId?: string;
  sessionId?: string;
  input?: any;
  output?: any;
  metadata?: Record<string, any>;
  tags?: string[];
}) {
  const langfuse = getLangfuse();
  if (!langfuse) return null;

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
  } catch (error) {
    console.error('Failed to create Langfuse trace:', error instanceof Error ? error.message : 'Unknown error');
    return null;
  }
}

/**
 * Create a generation span within a trace
 */
export function createGeneration(trace: any, options: {
  name: string;
  model?: string;
  modelParameters?: Record<string, any>;
  input?: any;
  metadata?: Record<string, any>;
}) {
  if (!trace) return null;

  try {
    const generation = trace.generation({
      name: options.name,
      model: options.model,
      modelParameters: options.modelParameters,
      input: options.input,
      metadata: options.metadata,
    });

    return generation;
  } catch (error) {
    console.error('Failed to create Langfuse generation:', error instanceof Error ? error.message : 'Unknown error');
    return null;
  }
}

/**
 * Update a generation with output and usage data
 */
export function updateGeneration(generation: any, options: {
  output?: any;
  usage?: {
    input?: number;
    output?: number;
    total?: number;
  };
  metadata?: Record<string, any>;
}) {
  if (!generation) return;

  try {
    generation.update({
      output: options.output,
      usage: options.usage,
      metadata: options.metadata,
    });
  } catch (error) {
    console.error('Failed to update Langfuse generation:', error instanceof Error ? error.message : 'Unknown error');
  }
}

/**
 * End a generation with completion status
 */
export function endGeneration(generation: any, options?: {
  output?: any;
  level?: 'DEBUG' | 'DEFAULT' | 'WARNING' | 'ERROR';
  statusMessage?: string;
}) {
  if (!generation) return;

  try {
    // Langfuse generation.end() accepts output, level, and statusMessage
    // Make sure we always call end() even if output is null
    generation.end({
      output: options?.output !== undefined ? options.output : null,
      level: options?.level || 'DEFAULT',
      statusMessage: options?.statusMessage,
    });
  } catch (error) {
    console.error('Failed to end Langfuse generation:', error instanceof Error ? error.message : 'Unknown error');
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
    } catch (fallbackError) {
      console.error('Failed to end generation with fallback:', fallbackError instanceof Error ? fallbackError.message : 'Unknown error');
    }
  }
}

/**
 * Create a span for tool execution
 */
export function createSpan(trace: any, options: {
  name: string;
  input?: any;
  metadata?: Record<string, any>;
}) {
  if (!trace) return null;

  try {
    const span = trace.span({
      name: options.name,
      input: options.input,
      metadata: options.metadata,
    });

    return span;
  } catch (error) {
    console.error('Failed to create Langfuse span:', error instanceof Error ? error.message : 'Unknown error');
    return null;
  }
}

/**
 * End a span with output data
 */
export function endSpan(span: any, options?: {
  output?: any;
  level?: 'DEBUG' | 'DEFAULT' | 'WARNING' | 'ERROR';
  statusMessage?: string;
}) {
  if (!span) return;

  try {
    span.end({
      output: options?.output,
      level: options?.level,
      statusMessage: options?.statusMessage,
    });
  } catch (error) {
    console.error('Failed to end Langfuse span:', error instanceof Error ? error.message : 'Unknown error');
  }
}

/**
 * Score a trace or generation
 */
export function score(options: {
  traceId?: string;
  observationId?: string;
  name: string;
  value: number;
  comment?: string;
}) {
  const langfuse = getLangfuse();
  if (!langfuse) return;

  try {
    langfuse.score({
      traceId: options.traceId,
      observationId: options.observationId,
      name: options.name,
      value: options.value,
      comment: options.comment,
    });
  } catch (error) {
    console.error('Failed to score Langfuse trace:', error instanceof Error ? error.message : 'Unknown error');
  }
}

/**
 * Flush all pending traces to Langfuse
 */
export async function flushLangfuse(): Promise<void> {
  const langfuse = getLangfuse();
  if (!langfuse) return;

  try {
    await langfuse.flushAsync();
  } catch (error) {
    console.error('Failed to flush Langfuse:', error instanceof Error ? error.message : 'Unknown error');
  }
}

/**
 * Shutdown Langfuse and flush all pending traces
 */
export async function shutdownLangfuse(): Promise<void> {
  const langfuse = getLangfuse();
  if (!langfuse) return;

  try {
    await langfuse.shutdownAsync();
  } catch (error) {
    const safeMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Failed to shutdown Langfuse:', safeMessage);
  } finally {
    langfuseInstance = null;
    isEnabled = false;
    initAttempted = false;
  }
}

/**
 * Helper to format messages for Langfuse
 */
export function formatMessagesForLangfuse(messages: ModelMessage[]): any[] {
  return messages.map(msg => ({
    role: msg.role,
    content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
  }));
}

/**
 * Helper to extract model name from model config
 */
export function extractModelName(model: any): string {
  if (typeof model === 'string') return model;
  if (model?.modelId) return model.modelId;
  if (model?.provider && model?.model) return `${model.provider}/${model.model}`;
  return 'unknown';
}

// Graceful shutdown handlers
if (typeof process !== 'undefined') {
  const gracefulShutdown = async () => {
    await shutdownLangfuse();
  };

  process.on('SIGTERM', gracefulShutdown);
  process.on('SIGINT', gracefulShutdown);
  process.on('beforeExit', gracefulShutdown);
}

