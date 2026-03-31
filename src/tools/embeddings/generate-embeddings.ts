/**
 * Embeddings Generation Feature
 * 
 * Provides text embedding capabilities using AI SDK v6's `embed` and `embedMany`.
 * Generates vector representations of text for semantic search and RAG.
 * 
 * @module tools/embeddings
 */

import { embed, embedMany } from 'ai';
import type { EmbeddingModel } from 'ai';
import { z } from 'zod';

// Tool definition type (AI SDK v6 compatible)
type CoreTool = {
  description?: string;
  inputSchema: z.ZodSchema<any>;
  execute: (args: any, context?: any) => Promise<any> | any;
};

/**
 * Single embedding generation options
 */
export interface GenerateEmbeddingOptions {
  /**
   * The embedding model to use
   * Examples: 'text-embedding-3-small', 'text-embedding-3-large', 'text-embedding-ada-002'
   */
  model: EmbeddingModel;
  
  /**
   * Text to generate embedding for
   */
  value: string;
  
  /**
   * Additional provider-specific options
   */
  providerOptions?: Record<string, any>;
}

/**
 * Batch embedding generation options
 */
export interface GenerateEmbeddingsOptions {
  /**
   * The embedding model to use
   */
  model: EmbeddingModel;
  
  /**
   * Array of texts to generate embeddings for
   */
  values: string[];
  
  /**
   * Additional provider-specific options
   */
  providerOptions?: Record<string, any>;
}

/**
 * Embedding result
 */
export interface EmbeddingResult {
  /**
   * The embedding vector
   */
  embedding: number[];
  
  /**
   * Dimensions of the embedding vector
   */
  dimensions: number;
  
  /**
   * Token usage for generating this embedding
   */
  usage?: {
    tokens: number;
  };
}

/**
 * Batch embeddings result
 */
export interface EmbeddingsResult {
  /**
   * Array of embedding vectors
   */
  embeddings: number[][];
  
  /**
   * Dimensions of the embedding vectors
   */
  dimensions: number;
  
  /**
   * Total token usage
   */
  usage?: {
    tokens: number;
  };
}

/**
 * Generate an embedding for a single text
 * 
 * @example
 * ```typescript
 * import { generateEmbeddingAI } from '@tawk-agents-sdk/core';
 * import { openai } from '@ai-sdk/openai';
 * 
 * const result = await generateEmbeddingAI({
 *   model: openai.embedding('text-embedding-3-small'),
 *   value: 'Hello, world!'
 * });
 * 
 * console.log(result.embedding); // [0.1, -0.2, 0.3, ...]
 * console.log(result.dimensions); // 1536
 * ```
 */
export async function generateEmbeddingAI(
  options: GenerateEmbeddingOptions
): Promise<EmbeddingResult> {
  const { model, value, providerOptions } = options;
  
  const result = await embed({
    model,
    value,
    providerOptions,
  });
  
  return {
    embedding: result.embedding,
    dimensions: result.embedding.length,
    usage: result.usage ? { tokens: result.usage.tokens } : undefined,
  };
}

/**
 * Generate embeddings for multiple texts
 * 
 * @example
 * ```typescript
 * import { generateEmbeddingsAI } from '@tawk-agents-sdk/core';
 * import { openai } from '@ai-sdk/openai';
 * 
 * const result = await generateEmbeddingsAI({
 *   model: openai.embedding('text-embedding-3-small'),
 *   values: ['Hello', 'World', 'AI']
 * });
 * 
 * console.log(result.embeddings.length); // 3
 * console.log(result.dimensions); // 1536
 * ```
 */
export async function generateEmbeddingsAI(
  options: GenerateEmbeddingsOptions
): Promise<EmbeddingsResult> {
  const { model, values, providerOptions } = options;
  
  const result = await embedMany({
    model,
    values,
    providerOptions,
  });
  
  return {
    embeddings: result.embeddings,
    dimensions: result.embeddings[0]?.length || 0,
    usage: result.usage ? { tokens: result.usage.tokens } : undefined,
  };
}

/**
 * Calculate cosine similarity between two embedding vectors
 * 
 * @param embedding1 - First embedding vector
 * @param embedding2 - Second embedding vector
 * @returns Similarity score between -1 and 1 (higher is more similar)
 * 
 * @example
 * ```typescript
 * const similarity = cosineSimilarity(embedding1, embedding2);
 * console.log(similarity); // 0.85
 * ```
 */
export function cosineSimilarity(
  embedding1: number[],
  embedding2: number[]
): number {
  if (embedding1.length !== embedding2.length) {
    throw new Error('Embeddings must have the same dimensions');
  }
  
  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;
  
  for (let i = 0; i < embedding1.length; i++) {
    dotProduct += embedding1[i] * embedding2[i];
    norm1 += embedding1[i] ** 2;
    norm2 += embedding2[i] ** 2;
  }
  
  return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
}

/**
 * Create an embedding generation tool for use in agents
 * 
 * @param model - The embedding model to use
 * 
 * @example
 * ```typescript
 * import { Agent, createEmbeddingTool } from '@tawk-agents-sdk/core';
 * import { openai } from '@ai-sdk/openai';
 * 
 * const agent = new Agent({
 *   name: 'embedder',
 *   instructions: 'You can generate embeddings for semantic search',
 *   tools: {
 *     generateEmbedding: createEmbeddingTool(openai.embedding('text-embedding-3-small'))
 *   }
 * });
 * ```
 */
export function createEmbeddingTool(
  model: EmbeddingModel
): CoreTool {
  return {
    description: 'Generate embedding vectors for text. Used for semantic search and similarity comparison.',
    inputSchema: z.object({
      text: z.string().describe('Text to generate embedding for'),
    }),
    execute: async ({ text }: { text: string }) => {
      const result = await generateEmbeddingAI({
        model,
        value: text,
      });
      
      return {
        success: true,
        embedding: result.embedding,
        dimensions: result.dimensions,
        usage: result.usage,
      };
    },
  };
}

