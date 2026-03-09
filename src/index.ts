/**
 * Tawk Agents SDK
 * 
 * Production-ready AI agent framework built on Vercel AI SDK.
 * Enterprise-grade multi-agent orchestration with comprehensive observability.
 * 
 * @packageDocumentation
 * @module tawk-agents-sdk
 * @author Tawk.to
 * @license MIT
 * @version 1.0.0
 * 
 * @example Basic Agent
 * ```typescript
 * import { Agent, run } from 'tawk-agents-sdk';
 * import { openai } from '@ai-sdk/openai';
 * 
 * const agent = new Agent({
 *   name: 'Assistant',
 *   model: openai('gpt-4o'),
 *   instructions: 'You are a helpful assistant.'
 * });
 * 
 * const result = await run(agent, 'Hello!');
 * console.log(result.finalOutput);
 * ```
 * 
 * @example Multi-Agent System
 * ```typescript
 * const specialist = new Agent({ name: 'Specialist', ... });
 * const coordinator = new Agent({
 *   name: 'Coordinator',
 *   subagents: [specialist]
 * });
 * 
 * const result = await run(coordinator, 'Complex task');
 * ```
 * 
 * @see {@link https://github.com/Manoj-tawk/tawk-agents-sdk Documentation}
 */

// ============================================
// CORE AGENT & EXECUTION
// ============================================

export {
  // Agent class
  Agent,

  // Run functions
  run,
  runStream,

  // Tool function
  tool,

  // Types
  type AgentConfig,
  type CoreTool,
  type RunContextWrapper,
  type RunOptions,
  type RunResult,
  type StreamResult,
  type AgentOutputConfig,
  type ModelSettings,
  type ExecutionConfig,
  type AgentHooksConfig,
} from './core/agent';

// Runner with streaming
export { AgenticRunner, TokenLimitExceededError, TokenBudgetTracker, type StreamEvent } from './core/runner';

// Usage tracking
export { Usage } from './core/usage';

// Tokenizer
export { defaultTokenizerFn } from './core/agent/agent-class';
export type { TokenizerFn } from './core/agent/types';

// Transfers system
export { 
  createTransferTools, 
  detectTransfer, 
  createTransferContext,
} from './core/transfers';
export type { TransferResult } from './core/transfers';

// MCP (Model Context Protocol)
// ============================================

export {
  MCPServer,
  MCPServerManager,
} from './mcp/enhanced';

export type {
  MCPServerConfig,
  MCPTool,
  MCPResource,
  MCPPrompt,
} from './mcp/enhanced';

// Run state management
export { RunState } from './core/runstate';
export type {
  RunItem,
  RunItemType,
  RunMessageItem,
  RunToolCallItem,
  RunToolResultItem,
  ModelResponse,
} from './core/runstate';

// ============================================
// TRACING & OBSERVABILITY
// ============================================

// Tracing context
export {
  withTrace,
  getCurrentTrace,
  getCurrentSpan,
  setCurrentSpan,
  createContextualSpan,
  createContextualGeneration,
  runWithTraceContext,
} from './tracing/context';

// Langfuse initialization
export {
  initializeLangfuse as initLangfuse,
  getLangfuse,
  isLangfuseEnabled,
  flushLangfuse,
  shutdownLangfuse,
} from './lifecycle/langfuse';

export type { LangfuseConfig } from './lifecycle/langfuse';

// ============================================
// GUARDRAILS
// ============================================

export {
  // Core guardrails
  lengthGuardrail,
  piiDetectionGuardrail,
  customGuardrail,
  
  // Advanced guardrails (optional)
  contentSafetyGuardrail,
  topicRelevanceGuardrail,
  sentimentGuardrail,
  toxicityGuardrail,
  languageGuardrail,
  rateLimitGuardrail,
} from './guardrails';

export type {
  Guardrail,
  GuardrailResult,
} from './core/agent';

// ============================================
// HELPERS & UTILITIES
// ============================================

// Message helpers
export { 
  user, 
  assistant, 
  system, 
  toolMessage, 
  getLastTextContent, 
  filterMessagesByRole, 
  extractAllText 
} from './helpers/message';

// Safe execution
export {
  safeExecute
} from './helpers/safe-execute';

export type {
  SafeExecuteResult
} from './helpers/safe-execute';

// Error sanitization
export { sanitizeError, redactSecrets } from './helpers/sanitize';

// SSRF-safe fetch
export { safeFetch, safeFetchText, validateUrl } from './helpers/safe-fetch';
export type { SafeFetchOptions } from './helpers/safe-fetch';

// ============================================
// LIFECYCLE HOOKS
// ============================================

export { 
  AgentHooks, 
  RunHooks 
} from './lifecycle';

export type { 
  AgentHookEvents, 
  RunHookEvents 
} from './lifecycle';

// ============================================
// TYPE UTILITIES
// ============================================

export type {
  Expand,
  DeepPartial,
  Prettify,
  UnwrapPromise,
} from './types/helpers';

// ============================================
// TOOLS & AI UTILITIES
// ============================================

// Embeddings
export {
  generateEmbeddingAI,
  generateEmbeddingsAI,
  cosineSimilarity,
  createEmbeddingTool,
} from './tools/embeddings';

export type {
  GenerateEmbeddingOptions,
  GenerateEmbeddingsOptions,
  EmbeddingResult,
  EmbeddingsResult,
} from './tools/embeddings';

// Image generation
export {
  generateImageAI,
  createImageGenerationTool,
} from './tools/image';

export type {
  GenerateImageOptions,
  GenerateImageResult,
} from './tools/image';

// Audio (speech + transcription)
export {
  transcribeAudioAI,
  createTranscriptionTool,
  generateSpeechAI,
  createTextToSpeechTool,
} from './tools/audio';

export type {
  TranscribeAudioOptions,
  TranscribeAudioResult,
  GenerateSpeechOptions,
  GenerateSpeechResult,
} from './tools/audio';

// Reranking
export {
  rerankDocuments,
  createRerankTool,
} from './tools/rerank';

export type {
  RerankOptions,
  RerankResult,
} from './tools/rerank';

// Video generation
export {
  generateVideoAI,
  createVideoGenerationTool,
} from './tools/video';

export type {
  GenerateVideoOptions,
  GenerateVideoResult,
} from './tools/video';

// Default tools convenience function
export { createDefaultTools } from './tools/defaults';

// ============================================
// TOON ENCODING (Token-Optimized Object Notation)
// ============================================

export {
  encodeTOON,
  decodeTOON,
  formatToolResultTOON,
  isTOONFormat,
  smartDecode,
  calculateTokenSavings,
} from './helpers/toon';

// ============================================
// AI SDK v6 MIDDLEWARE & UTILITIES (Re-exports)
// ============================================

export {
  wrapLanguageModel,
  extractReasoningMiddleware,
  defaultSettingsMiddleware,
  simulateStreamingMiddleware,
  createProviderRegistry,
  customProvider,
  smoothStream,
  pruneMessages,
  Output,
  stepCountIs,
} from 'ai';

// ============================================
// AI SDK v6 ERROR CLASSES (Re-exports)
// ============================================

export {
  APICallError,
  RetryError,
  NoSuchToolError,
  InvalidToolInputError,
  ToolCallRepairError,
} from 'ai';
