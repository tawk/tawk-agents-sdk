/**
 * AI Tools Module
 *
 * Advanced AI capabilities built on top of AI SDK v6:
 * - Image generation (DALL-E, Stable Diffusion, etc.)
 * - Video generation (Luma, Runway, etc.)
 * - Audio transcription (Whisper, etc.)
 * - Text-to-speech (TTS)
 * - Embeddings (for semantic search and RAG)
 * - Reranking (for improving search relevance)
 *
 * All tools are available both as:
 * 1. Standalone functions (for direct use)
 * 2. Tool creators (for use in agents)
 *
 * @module tools
 */

// ============================================
// IMAGE GENERATION
// ============================================

export {
  generateImageAI,
  createImageGenerationTool,
  type GenerateImageOptions,
  type GenerateImageResult,
} from './image';

// ============================================
// VIDEO GENERATION
// ============================================

export {
  generateVideoAI,
  createVideoGenerationTool,
  type GenerateVideoOptions,
  type GenerateVideoResult,
} from './video';

// ============================================
// AUDIO FEATURES
// ============================================

export {
  // Transcription
  transcribeAudioAI,
  createTranscriptionTool,
  type TranscribeAudioOptions,
  type TranscribeAudioResult,

  // Text-to-Speech
  generateSpeechAI,
  createTextToSpeechTool,
  type GenerateSpeechOptions,
  type GenerateSpeechResult,
} from './audio';

// ============================================
// EMBEDDINGS
// ============================================

export {
  generateEmbeddingAI,
  generateEmbeddingsAI,
  cosineSimilarity,
  createEmbeddingTool,
  type GenerateEmbeddingOptions,
  type GenerateEmbeddingsOptions,
  type EmbeddingResult,
  type EmbeddingsResult,
} from './embeddings';

// ============================================
// RERANKING
// ============================================

export {
  rerankDocuments,
  createRerankTool,
  type RerankOptions,
  type RerankResult,
} from './rerank';

// ============================================
// RAG (RETRIEVAL-AUGMENTED GENERATION)
// ============================================

export {
  createPineconeSearchTool,
  createPineconeSearchToolWithCache,
  type PineconeSearchConfig,
  type SearchDocument,
  type PineconeSearchResult,
} from './rag';

// ============================================
// DEFAULT TOOLS
// ============================================

export { createDefaultTools } from './defaults';
