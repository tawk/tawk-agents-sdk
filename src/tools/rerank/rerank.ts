/**
 * Reranking Feature
 *
 * Provides document reranking capabilities using AI SDK v6's native `rerank`.
 * Reranking improves search relevance by reordering documents based on their relationship to a query.
 *
 * @module tools/rerank
 */

import { rerank } from 'ai';
import { z } from 'zod';

// Tool definition type
type CoreTool = {
  description?: string;
  inputSchema: z.ZodSchema<any>;
  execute: (args: any, context?: any) => Promise<any> | any;
};

/**
 * Reranking options
 */
export interface RerankOptions {
  /**
   * The reranking model to use
   * Examples: cohere.reranking('rerank-v3.5'), bedrock.reranking('cohere.rerank-v3-5:0')
   */
  model: any;

  /**
   * The documents to rerank (can be strings or objects)
   */
  documents: Array<string | Record<string, any>>;

  /**
   * The search query to rank documents against
   */
  query: string;

  /**
   * Maximum number of top documents to return
   * If not specified, all documents are returned
   */
  topN?: number;

  /**
   * Maximum number of retries. Set to 0 to disable retries. Default: 2
   */
  maxRetries?: number;

  /**
   * Additional provider-specific options
   */
  providerOptions?: Record<string, any>;
}

/**
 * Reranking result
 */
export interface RerankResult {
  /**
   * Sorted array of ranking results with originalIndex, score, and document
   */
  ranking: Array<{
    originalIndex: number;
    score: number;
    document: string | Record<string, any>;
  }>;

  /**
   * Documents sorted by relevance (convenience property)
   */
  rerankedDocuments: Array<string | Record<string, any>>;

  /**
   * Original documents array
   */
  originalDocuments: Array<string | Record<string, any>>;

  /**
   * Usage information
   */
  usage?: {
    tokens?: number;
  };
}

/**
 * Rerank documents based on their relevance to a query
 *
 * @example
 * ```typescript
 * import { rerankDocuments } from '@tawk-agents-sdk/core';
 * import { cohere } from '@ai-sdk/cohere';
 *
 * const result = await rerankDocuments({
 *   model: cohere.reranking('rerank-v3.5'),
 *   documents: [
 *     'sunny day at the beach',
 *     'rainy afternoon in the city',
 *     'snowy night in the mountains',
 *   ],
 *   query: 'talk about rain',
 *   topN: 2
 * });
 *
 * console.log(result.ranking);
 * // [
 * //   { originalIndex: 1, score: 0.9, document: 'rainy afternoon in the city' },
 * //   { originalIndex: 0, score: 0.3, document: 'sunny day at the beach' }
 * // ]
 * ```
 *
 * @example
 * ```typescript
 * // With structured documents
 * const result = await rerankDocuments({
 *   model: cohere.reranking('rerank-v3.5'),
 *   documents: [
 *     { from: 'Paul Doe', subject: 'Follow-up', text: '...' },
 *     { from: 'John McGill', subject: 'Missing Info', text: '...' },
 *   ],
 *   query: 'Which pricing did we get from Oracle?',
 *   topN: 1
 * });
 *
 * console.log(result.rerankedDocuments[0]);
 * // { from: 'John McGill', subject: 'Missing Info', text: '...' }
 * ```
 */
export async function rerankDocuments(
  options: RerankOptions
): Promise<RerankResult> {
  const { model, documents, query, topN, maxRetries, providerOptions } = options;

  const result = await rerank({
    model,
    documents,
    query,
    topN,
    maxRetries,
    providerOptions,
  });

  return {
    ranking: result.ranking.map((item: any) => ({
      originalIndex: item.originalIndex,
      score: item.score,
      document: item.document,
    })),
    rerankedDocuments: result.rerankedDocuments,
    originalDocuments: result.originalDocuments,
    usage: (result as any).response?.usage ? { tokens: (result as any).response.usage.tokens } : undefined,
  };
}

/**
 * Create a reranking tool for use in agents
 *
 * @param model - The reranking model to use
 *
 * @example
 * ```typescript
 * import { Agent, createRerankTool } from '@tawk-agents-sdk/core';
 * import { cohere } from '@ai-sdk/cohere';
 *
 * const agent = new Agent({
 *   name: 'search-assistant',
 *   instructions: 'You can rerank search results to find the most relevant documents',
 *   tools: {
 *     rerank: createRerankTool(cohere.reranking('rerank-v3.5'))
 *   }
 * });
 *
 * // Agent can now use rerank tool to improve search results
 * const result = await run(agent, 'Find documents about pricing');
 * ```
 */
export function createRerankTool(
  model: any
): CoreTool {
  return {
    description: 'Rerank documents based on their relevance to a query. Returns documents sorted by relevance score. Ideal for improving search results by reordering documents based on semantic understanding.',
    inputSchema: z.object({
      documents: z.array(z.union([
        z.string(),
        z.record(z.any())
      ])).describe('Array of documents to rerank. Can be strings or objects.'),
      query: z.string().describe('The search query to rank documents against'),
      topN: z.number().optional().describe('Maximum number of top documents to return. If not specified, all documents are returned.'),
    }),
    execute: async ({ documents, query, topN }: {
      documents: Array<string | Record<string, any>>;
      query: string;
      topN?: number;
    }) => {
      const result = await rerankDocuments({
        model,
        documents,
        query,
        topN,
      });

      return {
        success: true,
        ranking: result.ranking,
        rerankedDocuments: result.rerankedDocuments,
        topN: topN || result.ranking.length,
        totalDocuments: result.originalDocuments.length,
        usage: result.usage,
      };
    },
  };
}
