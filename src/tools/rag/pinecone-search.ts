/**
 * Pinecone RAG Search Tool
 * 
 * Optimized, reusable tool for semantic search across Pinecone vector database.
 * Supports query embedding caching and TOON encoding for token efficiency.
 * 
 * @module tools/rag/pinecone-search
 */

import { tool } from '../../core';
import { generateEmbeddingAI } from '../embeddings';
import { encodeTOON } from '../../helpers/toon';
import { z } from 'zod';
import type { EmbeddingModel } from 'ai';

/**
 * Pinecone query response type
 */
interface PineconeQueryResponse {
  matches: Array<{
    id: string;
    score: number;
    metadata?: {
      text?: string;
      [key: string]: unknown;
    };
  }>;
}

/**
 * Document structure returned by search
 */
export interface SearchDocument {
  id: string;
  text: string;
  score: number;
  metadata?: Record<string, unknown>;
}

/**
 * Search result structure
 */
export interface PineconeSearchResult {
  documents: SearchDocument[];
  context: string;
  documentIds: string[];
  totalResults: number;
}

/**
 * Query embedding cache to avoid redundant API calls
 */
class QueryEmbeddingCache {
  private cache = new Map<string, number[]>();
  private cacheKeyGenerator?: (query: string) => string;
  private enabled: boolean;

  constructor(enabled: boolean = true, cacheKeyGenerator?: (query: string) => string) {
    this.enabled = enabled;
    this.cacheKeyGenerator = cacheKeyGenerator;
  }

  async getEmbedding(query: string, embeddingModel: EmbeddingModel, providerOptions?: Record<string, any>): Promise<number[]> {
    if (!this.enabled) {
      // Cache disabled, generate embedding directly
      const result = await generateEmbeddingAI({
        model: embeddingModel,
        value: query,
        providerOptions,
      });
      return result.embedding;
    }

    // Generate cache key
    const cacheKey = this.cacheKeyGenerator
      ? this.cacheKeyGenerator(query)
      : query.toLowerCase().trim();

    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    const result = await generateEmbeddingAI({
      model: embeddingModel,
      value: query,
      providerOptions,
    });

    this.cache.set(cacheKey, result.embedding);
    return result.embedding;
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}

/**
 * Pinecone search function
 */
async function searchPinecone(
  queryEmbedding: number[],
  topK: number,
  config: PineconeSearchConfig
): Promise<Array<{ doc: SearchDocument; score: number }>> {
  if (!config.indexUrl || !config.apiKey) {
    throw new Error('Pinecone configuration missing. Please set indexUrl and apiKey');
  }

  const requestBody: any = {
    vector: queryEmbedding,
    namespace: config.namespace || 'default',
    topK,
    includeMetadata: true,
    includeValues: false,
  };

  // Add optional metadata filter if provided
  if (config.metadataFilter) {
    requestBody.filter = config.metadataFilter;
  }

  const response = await fetch(`${config.indexUrl}/query`, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'Api-Key': config.apiKey,
      'X-Pinecone-Api-Version': config.apiVersion || '2025-10',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Pinecone query failed: ${response.status} ${response.statusText} - ${errorText}`);
  }

  const data = await response.json() as PineconeQueryResponse;
  const { matches } = data;

  return matches.map((match) => ({
    doc: {
      id: match.id,
      text: match.metadata?.text || '',
      score: match.score || 0,
      metadata: match.metadata,
    } as SearchDocument,
    score: match.score || 0,
  }));
}

/**
 * Configuration for Pinecone search tool
 */
export interface PineconeSearchConfig {
  /** Pinecone index URL */
  indexUrl: string;
  /** Pinecone API key */
  apiKey: string;
  /** Namespace (default: 'default') */
  namespace?: string;
  /** API version (default: '2025-10') */
  apiVersion?: string;
  /** Embedding model for query encoding (supports OpenAI, Anthropic, Google, Mistral, etc.) */
  embeddingModel: EmbeddingModel;
  /** Provider-specific options for embedding generation (e.g., { openai: { dimensions: 1024 } }) */
  embeddingProviderOptions?: Record<string, any>;
  /** Optional default metadata filter for Pinecone queries (e.g., { category: { $eq: 'technical' } }) */
  metadataFilter?: Record<string, any>;
  /** Enable TOON encoding for results (default: true) */
  useTOON?: boolean;
  /** Minimum document count or size threshold for TOON encoding (default: 3 documents or 500 chars) */
  toonThreshold?: {
    minDocuments?: number;
    minSizeChars?: number;
  };
  /** Custom logger function (optional) */
  logger?: (message: string, ...args: any[]) => void;
  /** Enable embedding cache (default: true) */
  enableCache?: boolean;
  /** Custom cache key generator (optional) */
  cacheKeyGenerator?: (query: string) => string;
}

/**
 * Create an optimized Pinecone search tool
 * 
 * Features:
 * - Multi-provider embedding support (OpenAI, Anthropic, Google, Mistral, etc.)
 * - Query embedding caching (configurable)
 * - TOON encoding for token efficiency (configurable thresholds)
 * - Generic metadata filtering support
 * - Fully configurable for any use case
 * 
 * @param config - Pinecone search configuration
 * @returns Tool definition ready for use in agents
 * 
 * @example
 * ```typescript
 * // Using OpenAI embeddings
 * import { openai } from '@ai-sdk/openai';
 * import { createPineconeSearchTool } from '@tawk-agents-sdk/tools';
 * 
 * const searchTool = createPineconeSearchTool({
 *   indexUrl: process.env.PINECONE_INDEX_URL!,
 *   apiKey: process.env.PINECONE_API_KEY!,
 *   embeddingModel: openai.embedding('text-embedding-3-large'),
 *   namespace: 'my-namespace',
 *   useTOON: true,
 * });
 * 
 * @example
 * ```typescript
 * // Using Anthropic embeddings
 * import { anthropic } from '@ai-sdk/anthropic';
 * 
 * const searchTool = createPineconeSearchTool({
 *   indexUrl: process.env.PINECONE_INDEX_URL!,
 *   apiKey: process.env.PINECONE_API_KEY!,
 *   embeddingModel: anthropic.embedding('text-embedding-3'),
 *   useTOON: true,
 * });
 * 
 * @example
 * ```typescript
 * // Using Google embeddings
 * import { google } from '@ai-sdk/google';
 * 
 * const searchTool = createPineconeSearchTool({
 *   indexUrl: process.env.PINECONE_INDEX_URL!,
 *   apiKey: process.env.PINECONE_API_KEY!,
 *   embeddingModel: google.embedding('text-embedding-004'),
 *   useTOON: true,
 *   enableCache: true,
 *   toonThreshold: { minDocuments: 5, minSizeChars: 1000 },
 * });
 * 
 * @example
 * ```typescript
 * // Custom configuration with metadata filtering
 * const searchTool = createPineconeSearchTool({
 *   indexUrl: process.env.PINECONE_INDEX_URL!,
 *   apiKey: process.env.PINECONE_API_KEY!,
 *   embeddingModel: openai.embedding('text-embedding-3-small'),
 *   namespace: 'production',
 *   metadataFilter: { status: { $eq: 'published' } },
 *   useTOON: true,
 *   enableCache: true,
 *   cacheKeyGenerator: (query) => `embed_${query.toLowerCase().trim()}`,
 *   logger: (msg, ...args) => console.log(`[Pinecone] ${msg}`, ...args),
 * });
 * ```
 */
export function createPineconeSearchTool(config: PineconeSearchConfig) {
  const useTOON = config.useTOON !== false; // Default to true
  const enableCache = config.enableCache !== false; // Default to true
  const logger = config.logger || console.log;
  const toonThreshold = config.toonThreshold || { minDocuments: 3, minSizeChars: 500 };
  
  const embeddingCache = new QueryEmbeddingCache(
    enableCache,
    config.cacheKeyGenerator
  );

  return tool({
    description: 'Search knowledge base using Pinecone semantic similarity. Returns top results ranked by relevance score. Supports any embedding model provider (OpenAI, Anthropic, Google, Mistral, etc.).',
    inputSchema: z.object({
      query: z.string().describe('Search query'),
      topK: z.number().default(5).describe('Number of results to return'),
      metadataFilter: z.record(z.any()).optional().describe('Optional metadata filter for Pinecone queries (e.g., { category: { $eq: "technical" } })'),
    }),
    execute: async ({ query, topK, metadataFilter }) => {
      // ✅ OPTIMIZED: Use cached query embedding (if enabled)
      // Pass provider options if specified (e.g., { openai: { dimensions: 1024 } })
      const queryEmbedding = await embeddingCache.getEmbedding(query, config.embeddingModel, config.embeddingProviderOptions);

      // Use query-specific metadata filter if provided, otherwise use config default
      const searchConfig = {
        ...config,
        metadataFilter: metadataFilter || config.metadataFilter,
      };

      // Search Pinecone
      const results = await searchPinecone(queryEmbedding, topK, searchConfig);

      logger(`   🔍 Found ${results.length} documents`);
      results.forEach((r, i) => {
        logger(`      ${i + 1}. [${r.doc.id}] Score: ${r.score.toFixed(4)}`);
      });

      const result: PineconeSearchResult = {
        documents: results.map(r => r.doc),
        context: results.map(r => r.doc.text).join('\n\n'),
        documentIds: results.map(r => r.doc.id),
        totalResults: results.length,
      };

      // ✅ OPTIMIZED: Encode to TOON if enabled and result meets threshold
      const shouldEncodeTOON = useTOON && (
        result.documents.length >= (toonThreshold.minDocuments || 3) ||
        JSON.stringify(result.documents).length > (toonThreshold.minSizeChars || 500)
      );

      if (shouldEncodeTOON) {
        try {
          // Encode documents array to TOON for token efficiency
          const toonDocuments = encodeTOON(result.documents);
          return {
            ...result,
            documentsTOON: toonDocuments, // Provide both formats for flexibility
            _toonEncoded: true,
          };
        } catch (error) {
          // Fallback to JSON if TOON encoding fails
          logger(`   ⚠️  TOON encoding failed, using JSON: ${error}`);
          return result;
        }
      }

      return result;
    },
  });
}

/**
 * Cache management utilities
 * 
 * Note: Each tool instance has its own cache. To clear a specific tool's cache,
 * you would need access to the tool instance. For testing, create a new tool instance.
 */
export interface PineconeSearchToolInstance {
  clearCache: () => void;
  getCacheSize: () => number;
}

/**
 * Create a Pinecone search tool with cache management
 * 
 * Returns both the tool and cache management utilities.
 * 
 * @example
 * ```typescript
 * const { tool, clearCache, getCacheSize } = createPineconeSearchToolWithCache({
 *   indexUrl: process.env.PINECONE_INDEX_URL!,
 *   apiKey: process.env.PINECONE_API_KEY!,
 *   embeddingModel: openai.embedding('text-embedding-3-large'),
 * });
 * 
 * // Use the tool
 * const agent = new Agent({
 *   name: 'RAG Agent',
 *   tools: { search: tool },
 * });
 * 
 * // Manage cache
 * console.log(`Cache size: ${getCacheSize()}`);
 * clearCache();
 * ```
 */
export function createPineconeSearchToolWithCache(
  config: PineconeSearchConfig
): { tool: ReturnType<typeof createPineconeSearchTool>; clearCache: () => void; getCacheSize: () => number } {
  const useTOON = config.useTOON !== false;
  const enableCache = config.enableCache !== false;
  const logger = config.logger || console.log;
  const toonThreshold = config.toonThreshold || { minDocuments: 3, minSizeChars: 500 };
  
  const embeddingCache = new QueryEmbeddingCache(
    enableCache,
    config.cacheKeyGenerator
  );

  const toolInstance = tool({
    description: 'Search knowledge base using Pinecone semantic similarity. Returns top results ranked by relevance score. Supports any embedding model provider (OpenAI, Anthropic, Google, Mistral, etc.).',
    inputSchema: z.object({
      query: z.string().describe('Search query'),
      topK: z.number().default(5).describe('Number of results to return'),
      metadataFilter: z.record(z.any()).optional().describe('Optional metadata filter for Pinecone queries (e.g., { category: { $eq: "technical" } })'),
    }),
    execute: async ({ query, topK, metadataFilter }) => {
      // Pass provider options if specified (e.g., { openai: { dimensions: 1024 } })
      const queryEmbedding = await embeddingCache.getEmbedding(query, config.embeddingModel, config.embeddingProviderOptions);
      const searchConfig = {
        ...config,
        metadataFilter: metadataFilter || config.metadataFilter,
      };

      const results = await searchPinecone(queryEmbedding, topK, searchConfig);

      logger(`   🔍 Found ${results.length} documents`);
      results.forEach((r, i) => {
        logger(`      ${i + 1}. [${r.doc.id}] Score: ${r.score.toFixed(4)}`);
      });

      const result: PineconeSearchResult = {
        documents: results.map(r => r.doc),
        context: results.map(r => r.doc.text).join('\n\n'),
        documentIds: results.map(r => r.doc.id),
        totalResults: results.length,
      };

      const shouldEncodeTOON = useTOON && (
        result.documents.length >= (toonThreshold.minDocuments || 3) ||
        JSON.stringify(result.documents).length > (toonThreshold.minSizeChars || 500)
      );

      if (shouldEncodeTOON) {
        try {
          const toonDocuments = encodeTOON(result.documents);
          return {
            ...result,
            documentsTOON: toonDocuments,
            _toonEncoded: true,
          };
        } catch (error) {
          logger(`   ⚠️  TOON encoding failed, using JSON: ${error}`);
          return result;
        }
      }

      return result;
    },
  });

  return {
    tool: toolInstance,
    clearCache: () => embeddingCache.clear(),
    getCacheSize: () => embeddingCache.size,
  };
}

