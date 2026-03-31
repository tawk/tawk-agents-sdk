/**
 * Example: Embeddings and RAG (Retrieval-Augmented Generation)
 * 
 * This example demonstrates:
 * - Generating embeddings using the SDK
 * - Vector similarity search
 * - Building a simple RAG system with agents
 */

import {
  Agent,
  run,
  tool,
  generateEmbeddingAI,
  generateEmbeddingsAI,
  cosineSimilarity,
  createEmbeddingTool,
} from '../../src';
import { logger, handleError, isAPIKeyError } from '../utils';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';
import 'dotenv/config';

// =====================================================
// 1. Basic Embedding Generation
// =====================================================

async function basicEmbeddings() {
  logger.step(1, 'Basic Embeddings');
  
  try {
    const model = openai.embedding('text-embedding-3-small');
    
    // Single embedding
    const singleEmbed = await generateEmbeddingAI({ model, value: 'AI agents are powerful' });
    logger.info(`Embedding dimensions: ${singleEmbed.embedding.length}`);
    
    // Batch embeddings
    const texts = [
      'Machine learning is transforming industries',
      'Deep learning models are neural networks',
      'AI agents can automate complex tasks',
    ];
    
    const batchResult = await generateEmbeddingsAI({ model, values: texts });
    logger.success(`Generated ${batchResult.embeddings.length} embeddings`);
  } catch (error: unknown) {
    if (isAPIKeyError(error)) {
      logger.warn('OpenAI API key is missing. Set OPENAI_API_KEY in your .env file.');
    } else {
      handleError(error, 'Basic Embeddings');
    }
  }
}

// =====================================================
// 2. Similarity Search
// =====================================================

async function similaritySearch() {
  logger.step(2, 'Similarity Search');
  
  try {
    const model = openai.embedding('text-embedding-3-small');
    
    const documents = [
      'Python is a programming language',
      'JavaScript runs in browsers',
      'TypeScript adds types to JavaScript',
      'Machine learning uses Python',
      'React is a JavaScript library',
    ];
    
    // Embed all documents
    const docResult = await generateEmbeddingsAI({ model, values: documents });
    const docEmbeds = docResult.embeddings;
    
    // Search query
    const query = 'TypeScript programming';
    const queryEmbedResult = await generateEmbeddingAI({ model, value: query });
    
    // Find most similar
    const similarities = docEmbeds.map((docEmbed, i) => ({
      doc: documents[i],
      score: cosineSimilarity(queryEmbedResult.embedding, docEmbed),
    }));
    
    similarities.sort((a, b) => b.score - a.score);
    
    logger.info(`Top 3 results for "${query}":`);
    similarities.slice(0, 3).forEach((result, i) => {
      logger.info(`${i + 1}. ${result.doc} (score: ${result.score.toFixed(4)})`);
    });
  } catch (error: unknown) {
    if (isAPIKeyError(error)) {
      logger.warn('OpenAI API key is missing. Set OPENAI_API_KEY in your .env file.');
    } else {
      handleError(error, 'Similarity Search');
    }
  }
}

// =====================================================
// 3. Simple RAG System
// =====================================================

async function simpleRAG() {
  logger.step(3, 'Simple RAG System');
  
  try {
    const embeddingModel = openai.embedding('text-embedding-3-small');
    const llmModel = openai('gpt-4o-mini');
    
    // Knowledge base
    const knowledgeBase = [
      'Tawk Agents SDK provides AI agent capabilities built on AI SDK v6',
      'The SDK supports tool calling, guardrails, and multi-agent handoffs',
      'Embeddings enable semantic search and RAG patterns',
      'Structured output ensures type-safe data extraction',
      'Vision support allows analyzing images with GPT-4o',
    ];
    
    // Generate embeddings for knowledge base
    const kbResult = await generateEmbeddingsAI({ model: embeddingModel, values: knowledgeBase });
    const kbEmbeddings = kbResult.embeddings;
    
    // Create retrieval tool
    const retrievalTool = tool({
      description: 'Search knowledge base for relevant information',
      inputSchema: z.object({ query: z.string() }),
      execute: async ({ query }) => {
        const queryEmbedResult = await generateEmbeddingAI({ model: embeddingModel, value: query });
        
        // Find most similar documents
        const similarities = kbEmbeddings.map((kbEmbed, i) => ({
          doc: knowledgeBase[i],
          score: cosineSimilarity(queryEmbedResult.embedding, kbEmbed),
        }));
        
        similarities.sort((a, b) => b.score - a.score);
        const topDocs = similarities.slice(0, 3).map(s => s.doc);
        
        return {
          results: topDocs,
          context: topDocs.join('\n'),
        };
      },
    });
    
    // Create RAG agent
    const ragAgent = new Agent({
      name: 'RAG Agent',
      instructions: 'Answer questions based on the retrieved context. Use the search tool to find relevant information.',
      model: llmModel,
      tools: {
        search: retrievalTool,
      },
    });
    
    // Query
    const query = 'What does the Tawk Agents SDK support?';
    const result = await run(ragAgent, query);
    
    logger.info(`Question: ${query}`);
    logger.info(`Answer: ${result.finalOutput}`);
  } catch (error: unknown) {
    if (isAPIKeyError(error)) {
      logger.warn('OpenAI API key is missing. Set OPENAI_API_KEY in your .env file.');
    } else {
      handleError(error, 'Simple RAG');
    }
  }
}

// =====================================================
// 4. Embedding Tool for Agents
// =====================================================

async function embeddingToolExample() {
  logger.step(4, 'Embedding Tool for Agents');
  
  try {
    const embeddingModel = openai.embedding('text-embedding-3-small');
    
    // Create embedding tool
    const embeddingTool = createEmbeddingTool(embeddingModel);
    
    // Create agent with embedding tool
    const agent = new Agent({
      name: 'EmbeddingAgent',
      instructions: 'Use the embedding tool to generate embeddings and calculate similarities',
      model: openai('gpt-4o-mini'),
      tools: {
        generate_embedding: embeddingTool,
      },
    });
    
    const result = await run(agent, 'Generate embeddings for "machine learning" and "artificial intelligence" and compare them');
    logger.info(`Result: ${result.finalOutput}`);
  } catch (error: unknown) {
    if (isAPIKeyError(error)) {
      logger.warn('OpenAI API key is missing. Set OPENAI_API_KEY in your .env file.');
    } else {
      handleError(error, 'Embedding Tool');
    }
  }
}


// =====================================================
// Run All Examples
// =====================================================

async function main() {
  logger.section('Embeddings & RAG Examples');

  try {
    await basicEmbeddings();
    await similaritySearch();
    await simpleRAG();
    await embeddingToolExample();
    
    logger.success('All examples completed successfully!');
  } catch (error) {
    if (isAPIKeyError(error)) {
      logger.warn('API key is missing. Examples require OPENAI_API_KEY to execute.');
    } else {
      handleError(error, 'Main');
    }
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}
