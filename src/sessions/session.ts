/**
 * Session Management System
 * 
 * @module sessions
 * @description
 * Production-ready conversation history and state management.
 * 
 * **Session Types**:
 * - **MemorySession**: In-memory storage for development/testing
 * - **RedisSession**: Persistent Redis storage for production
 * - **SessionManager**: Centralized session lifecycle management
 * 
 * **Features**:
 * - Automatic conversation history tracking
 * - Message windowing for token optimization
 * - Metadata storage for context persistence
 * - TTL support for automatic cleanup
 * - Thread-safe operations
 * - Comprehensive error handling
 * 
 * **Use Cases**:
 * - Multi-turn conversations
 * - User context preservation
 * - Distributed systems (via Redis)
 * - Long-running agent workflows
 * 
 * @author Tawk.to
 * @license MIT
 * @version 1.0.0
 */

import type {  ModelMessage } from 'ai';
import type { Session } from '../core/agent';
import { Redis } from 'ioredis';

// ============================================
// IN-MEMORY SESSION (for development/testing)
// ============================================

/**
 * In-memory session storage for development and testing.
 * Messages are stored in memory and lost when the process exits.
 * 
 * @template TContext - Type of context object
 * 
 * @example
 * ```typescript
 * const session = new MemorySession('user-123', 50);
 * await run(agent, 'Hello', { session });
 * ```
 */
export class MemorySession<TContext = any> implements Session<TContext> {
  public readonly id: string;
  private messages: ModelMessage[] = [];
  private metadata: Record<string, any> = {};
  private maxMessages?: number;
  private summarizationConfig?: SummarizationConfig;

  /**
   * Create a new in-memory session.
   * 
   * @param {string} id - Unique session identifier
   * @param {number} [maxMessages] - Maximum number of messages to keep (sliding window)
   * @param {SummarizationConfig} [summarizationConfig] - Optional auto-summarization config
   */
  /**
   * Default max messages to prevent unbounded memory growth.
   * Set explicitly via constructor to override.
   */
  private static readonly DEFAULT_MAX_MESSAGES = 200;

  constructor(id: string, maxMessages?: number, summarizationConfig?: SummarizationConfig) {
    this.id = id;
    this.maxMessages = maxMessages ?? MemorySession.DEFAULT_MAX_MESSAGES;
    this.summarizationConfig = summarizationConfig;
  }

  async getHistory(): Promise<ModelMessage[]> {
    // Return messages as-is - AI SDK provides correct ModelMessage[] format
    // No normalization needed - storage/retrieval happens naturally via JSON
    return this.messages;
  }

  async addMessages(messages: ModelMessage[]): Promise<void> {
    // Store messages as-is - AI SDK provides correct ModelMessage[] format
    // No normalization needed - trust the source
    this.messages.push(...messages);
    
    // Check if we should summarize
    if (this.summarizationConfig?.enabled) {
      this.messages = await this.checkAndSummarize(this.messages);
    }
    // Otherwise, use simple sliding window
    else if (this.maxMessages && this.messages.length > this.maxMessages) {
      this.messages = this.messages.slice(-this.maxMessages);
    }
  }

  private async checkAndSummarize(messages: ModelMessage[]): Promise<ModelMessage[]> {
    if (!this.summarizationConfig) return messages;
    
    const { messageThreshold, keepRecentMessages } = this.summarizationConfig;
    
    // Count non-system messages (exclude existing summaries)
    const nonSystemMessages = messages.filter(msg => 
      !(msg.role === 'system' && typeof msg.content === 'string' && msg.content.includes('Previous conversation summary'))
    );
    
    // Only summarize if we exceed threshold
    if (nonSystemMessages.length <= messageThreshold) {
      return messages;
    }
    
    try {
      // Find existing summary (if any)
      const existingSummaryIndex = messages.findIndex(msg =>
        msg.role === 'system' && typeof msg.content === 'string' && msg.content.includes('Previous conversation summary')
      );
      
      let existingSummary: string | undefined;
      if (existingSummaryIndex >= 0) {
        const summaryMsg = messages[existingSummaryIndex];
        existingSummary = typeof summaryMsg.content === 'string' 
          ? summaryMsg.content.replace('Previous conversation summary:\n', '')
          : undefined;
        // Remove old summary
        messages.splice(existingSummaryIndex, 1);
      }
      
      // Messages to summarize (all except recent ones)
      const toSummarize = messages.slice(0, -keepRecentMessages);
      const recentMessages = messages.slice(-keepRecentMessages);
      
      // Generate summary
      const newSummary = await this.generateSummary(toSummarize, existingSummary);
      
      // Create summary as system message
      const summaryMessage: ModelMessage = {
        role: 'system',
        content: `Previous conversation summary:\n${newSummary}`
      };
      
      // Return: [summary, recent messages]
      return [summaryMessage, ...recentMessages];
      
    } catch (_error: any) {
      if (process.env.NODE_ENV === 'development') {
        // Summarization failed, keep existing state
      }
      // Fallback to sliding window
      if (this.maxMessages && messages.length > this.maxMessages) {
        return messages.slice(-this.maxMessages);
      }
      return messages;
    }
  }

  private async generateSummary(messages: ModelMessage[], previousSummary?: string): Promise<string> {
    if (!this.summarizationConfig) {
      throw new Error('Summarization config not set');
    }
    
    // Build conversation text
    const conversationText = messages
      .map(msg => `${msg.role}: ${typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)}`)
      .join('\n\n');
    
    // Use custom prompt or default
    const summaryPrompt = this.summarizationConfig.summaryPrompt || 
      `Summarize the following conversation concisely, preserving all important facts, context, and information about the user. Focus on:
- User's identity (name, job, background)
- Key facts mentioned
- Topics discussed
- Important context

Conversation:
${conversationText}

Summary (2-3 paragraphs):`;

    // If previous summary exists, include it
    const fullPrompt = previousSummary 
      ? `Previous summary:\n${previousSummary}\n\n${summaryPrompt}`
      : summaryPrompt;
    
    // Use the provided model or create simple summary
    if (this.summarizationConfig.model) {
      const { generateText } = await import('ai');
      const result = await generateText({
        model: this.summarizationConfig.model,
        prompt: fullPrompt,
        maxOutputTokens: 500,
      } as any);
      return result.text;
    } else {
      // Simple fallback
      return this.createSimpleSummary(messages, previousSummary);
    }
  }

  private createSimpleSummary(messages: ModelMessage[], previousSummary?: string): string {
    const facts: string[] = [];
    
    messages.forEach(msg => {
      const content = typeof msg.content === 'string' ? msg.content : '';
      
      if (content.includes("I'm") || content.includes("I am") || 
          content.includes("My name") || content.includes("I work") ||
          content.includes("I live") || content.includes("I graduated")) {
        facts.push(content);
      }
    });
    
    if (previousSummary) {
      return `${previousSummary}\n\nAdditional context: ${facts.slice(0, 5).join('. ')}`;
    }
    
    return facts.slice(0, 10).join('. ');
  }

  async clear(): Promise<void> {
    this.messages = [];
    this.metadata = {};
  }

  async getMetadata(): Promise<Record<string, any>> {
    return { ...this.metadata };
  }

  async updateMetadata(metadata: Record<string, any>): Promise<void> {
    this.metadata = { ...this.metadata, ...metadata };
  }
}

// ============================================
// REDIS SESSION (for production)
// ============================================

/**
 * Configuration for Redis-backed session storage.
 * 
 * @property {Redis} redis - Redis client instance
 * @property {string} [keyPrefix] - Prefix for Redis keys (default: 'agent:session:')
 * @property {number} [ttl] - Time to live in seconds (default: 3600)
 * @property {number} [maxMessages] - Maximum number of messages to keep
 * @property {SummarizationConfig} [summarization] - Optional auto-summarization config
 */
export interface RedisSessionConfig {
  redis: Redis;
  keyPrefix?: string;
  ttl?: number; // Time to live in seconds
  maxMessages?: number; // Maximum number of messages to keep
  summarization?: SummarizationConfig;
}

/**
 * Redis-backed session storage for production use.
 * Provides fast access with automatic expiration.
 * 
 * @template TContext - Type of context object
 * 
 * @example
 * ```typescript
 * import Redis from 'ioredis';
 * const redis = new Redis();
 * const session = new RedisSession('user-123', {
 *   redis,
 *   ttl: 3600,
 *   maxMessages: 50
 * });
 * ```
 */
export class RedisSession<TContext = any> implements Session<TContext> {
  public readonly id: string;
  private redis: Redis;
  private keyPrefix: string;
  private ttl: number;
  private maxMessages?: number;
  private summarizationConfig?: SummarizationConfig;

  constructor(id: string, config: RedisSessionConfig) {
    this.id = id;
    this.redis = config.redis;
    this.keyPrefix = config.keyPrefix || 'agent:session:';
    this.ttl = config.ttl || 3600; // Default 1 hour
    this.maxMessages = config.maxMessages;
    this.summarizationConfig = config.summarization;
  }

  private getMessagesKey(): string {
    return `${this.keyPrefix}${this.id}:messages`;
  }

  private getMetadataKey(): string {
    return `${this.keyPrefix}${this.id}:metadata`;
  }

  async getHistory(): Promise<ModelMessage[]> {
    const key = this.getMessagesKey();
    
    // Use list operations for efficient message retrieval
    if (!this.summarizationConfig?.enabled) {
      const range = this.maxMessages ? -this.maxMessages : 0;
      const messagesJson = await this.redis.lrange(key, range, -1);
      
      if (!messagesJson || messagesJson.length === 0) {
        return [];
      }
      
      // Parse and return as-is - AI SDK provides correct ModelMessage[] format
      return messagesJson.map(json => JSON.parse(json));
    }
    
    // Legacy path for summarization (uses single JSON blob)
    const messagesJson = await this.redis.get(key);
    if (!messagesJson) {
      return [];
    }
    const messages = JSON.parse(messagesJson);
    return Array.isArray(messages) ? messages : [];
  }

  async addMessages(messages: ModelMessage[]): Promise<void> {
    if (messages.length === 0) return;
    
    const key = this.getMessagesKey();
    
    // Store messages as-is - AI SDK provides correct ModelMessage[] format
    
    // Check if we should summarize
    if (this.summarizationConfig?.enabled) {
      // Get existing messages for summarization
      let existingMessages = await this.getHistory();
      existingMessages.push(...messages);
      existingMessages = await this.checkAndSummarize(existingMessages);
      
      // Save back to Redis with TTL
      await this.redis.setex(
        key,
        this.ttl,
        JSON.stringify(existingMessages)
      );
    } else {
      // Use Redis pipeline for atomic batch operations
      const pipeline = this.redis.pipeline();
      
      // Serialize messages once (no normalization needed)
      const serialized = messages.map(m => JSON.stringify(m));
      
      // Append all messages at once
      if (serialized.length > 0) {
        pipeline.rpush(key, ...serialized);
      }
      
      // Trim to max length
      if (this.maxMessages) {
        pipeline.ltrim(key, -this.maxMessages, -1);
      }
      
      // Set TTL
      pipeline.expire(key, this.ttl);
      
      // Execute all commands in one round-trip and check for errors
      const pipelineResults = await pipeline.exec();
      if (pipelineResults) {
        const firstError = pipelineResults.find(r => r[0] !== null);
        if (firstError && firstError[0]) {
          throw firstError[0] instanceof Error
            ? firstError[0]
            : new Error(String(firstError[0]));
        }
      }
    }
  }

  private async checkAndSummarize(messages: ModelMessage[]): Promise<ModelMessage[]> {
    if (!this.summarizationConfig) return messages;
    
    const { messageThreshold, keepRecentMessages } = this.summarizationConfig;
    
    // Count non-system messages (exclude existing summaries)
    const nonSystemMessages = messages.filter(msg => 
      !(msg.role === 'system' && typeof msg.content === 'string' && msg.content.includes('Previous conversation summary'))
    );
    
    // Only summarize if we exceed threshold
    if (nonSystemMessages.length <= messageThreshold) {
      return messages;
    }
    
    try {
      // Find existing summary (if any)
      const existingSummaryIndex = messages.findIndex(msg =>
        msg.role === 'system' && typeof msg.content === 'string' && msg.content.includes('Previous conversation summary')
      );
      
      let existingSummary: string | undefined;
      if (existingSummaryIndex >= 0) {
        const summaryMsg = messages[existingSummaryIndex];
        existingSummary = typeof summaryMsg.content === 'string' 
          ? summaryMsg.content.replace('Previous conversation summary:\n', '')
          : undefined;
        // Remove old summary
        messages.splice(existingSummaryIndex, 1);
      }
      
      // Messages to summarize (all except recent ones)
      const toSummarize = messages.slice(0, -keepRecentMessages);
      const recentMessages = messages.slice(-keepRecentMessages);
      
      // Generate summary
      const newSummary = await this.generateSummary(toSummarize, existingSummary);
      
      // Create summary as system message
      const summaryMessage: ModelMessage = {
        role: 'system',
        content: `Previous conversation summary:\n${newSummary}`
      };
      
      // Return: [summary, recent messages]
      return [summaryMessage, ...recentMessages];
      
    } catch (_error: any) {
      if (process.env.NODE_ENV === 'development') {
        // Summarization failed, keep existing state
      }
      // Fallback to sliding window
      if (this.maxMessages && messages.length > this.maxMessages) {
        return messages.slice(-this.maxMessages);
      }
      return messages;
    }
  }

  private async generateSummary(messages: ModelMessage[], previousSummary?: string): Promise<string> {
    if (!this.summarizationConfig) {
      throw new Error('Summarization config not set');
    }
    
    // Build conversation text
    const conversationText = messages
      .map(msg => `${msg.role}: ${typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)}`)
      .join('\n\n');
    
    // Use custom prompt or default
    const summaryPrompt = this.summarizationConfig.summaryPrompt || 
      `Summarize the following conversation concisely, preserving all important facts, context, and information about the user. Focus on:
- User's identity (name, job, background)
- Key facts mentioned
- Topics discussed
- Important context

Conversation:
${conversationText}

Summary (2-3 paragraphs):`;

    // If previous summary exists, include it
    const fullPrompt = previousSummary 
      ? `Previous summary:\n${previousSummary}\n\n${summaryPrompt}`
      : summaryPrompt;
    
    // Use the provided model or create simple summary
    if (this.summarizationConfig.model) {
      const { generateText } = await import('ai');
      const result = await generateText({
        model: this.summarizationConfig.model,
        prompt: fullPrompt,
        maxOutputTokens: 500,
      } as any);
      return result.text;
    } else {
      // Simple fallback
      return this.createSimpleSummary(messages, previousSummary);
    }
  }

  private createSimpleSummary(messages: ModelMessage[], previousSummary?: string): string {
    const facts: string[] = [];
    
    messages.forEach(msg => {
      const content = typeof msg.content === 'string' ? msg.content : '';
      
      if (content.includes("I'm") || content.includes("I am") || 
          content.includes("My name") || content.includes("I work") ||
          content.includes("I live") || content.includes("I graduated")) {
        facts.push(content);
      }
    });
    
    if (previousSummary) {
      return `${previousSummary}\n\nAdditional context: ${facts.slice(0, 5).join('. ')}`;
    }
    
    return facts.slice(0, 10).join('. ');
  }

  async clear(): Promise<void> {
    await Promise.all([
      this.redis.del(this.getMessagesKey()),
      this.redis.del(this.getMetadataKey())
    ]);
  }

  async getMetadata(): Promise<Record<string, any>> {
    const metadataJson = await this.redis.get(this.getMetadataKey());
    if (!metadataJson) {
      return {};
    }
    return JSON.parse(metadataJson);
  }

  async updateMetadata(metadata: Record<string, any>): Promise<void> {
    const key = this.getMetadataKey();

    // Atomic read-modify-write using Lua script
    const luaScript = `
      local key = KEYS[1]
      local ttl = tonumber(ARGV[1])
      local newData = cjson.decode(ARGV[2])
      local existing = redis.call('GET', key)
      local merged = {}
      if existing then
        merged = cjson.decode(existing)
      end
      for k, v in pairs(newData) do
        merged[k] = v
      end
      redis.call('SETEX', key, ttl, cjson.encode(merged))
      return 'OK'
    `;

    await this.redis.eval(luaScript, 1, key, this.ttl.toString(), JSON.stringify(metadata));
    await this.refreshTTL();
  }

  /**
   * Refresh the time-to-live (TTL) for this session in Redis.
   * Useful for keeping active sessions alive.
   * 
   * @returns {Promise<void>}
   */
  async refreshTTL(): Promise<void> {
    await Promise.all([
      this.redis.expire(this.getMessagesKey(), this.ttl),
      this.redis.expire(this.getMetadataKey(), this.ttl)
    ]);
  }
}

// ============================================
// DATABASE SESSION (MongoDB example)
// ============================================

/**
 * Configuration for MongoDB-backed session storage.
 * 
 * @property {any} db - MongoDB Database instance
 * @property {string} [collectionName] - Collection name for sessions (default: 'agent_sessions')
 * @property {number} [maxMessages] - Maximum number of messages to keep
 * @property {SummarizationConfig} [summarization] - Optional auto-summarization config
 */
export interface DatabaseSessionConfig {
  db: any; // MongoDB Database instance
  collectionName?: string;
  maxMessages?: number;
  summarization?: SummarizationConfig;
}

/**
 * MongoDB-backed session storage for production use.
 * Provides durable storage with automatic message management.
 * 
 * @template TContext - Type of context object
 * 
 * @example
 * ```typescript
 * import { MongoClient } from 'mongodb';
 * const client = new MongoClient(mongoUrl);
 * const db = client.db('myapp');
 * const session = new DatabaseSession('user-123', {
 *   db,
 *   collectionName: 'sessions',
 *   maxMessages: 100
 * });
 * ```
 */
export class DatabaseSession<TContext = any> implements Session<TContext> {
  public readonly id: string;
  private db: any;
  private collectionName: string;
  private maxMessages?: number;
  private summarizationConfig?: SummarizationConfig;

  constructor(id: string, config: DatabaseSessionConfig) {
    this.id = id;
    this.db = config.db;
    this.collectionName = config.collectionName || 'agent_sessions';
    this.maxMessages = config.maxMessages;
    this.summarizationConfig = config.summarization;
  }

  private getCollection() {
    return this.db.collection(this.collectionName);
  }

  async getHistory(): Promise<ModelMessage[]> {
    const session = await this.getCollection().findOne({ sessionId: this.id });
    const messages = session?.messages || [];
    // Return as-is - AI SDK provides correct ModelMessage[] format
    return Array.isArray(messages) ? messages : [];
  }

  async addMessages(messages: ModelMessage[]): Promise<void> {
    if (messages.length === 0) return;
    
    // Store messages as-is - AI SDK provides correct ModelMessage[] format
    
    const collection = this.getCollection();
    
    // Check if we should summarize
    if (this.summarizationConfig?.enabled) {
      // Get current count first to check threshold
      const session = await collection.findOne(
        { sessionId: this.id }, 
        { projection: { messages: 1 } }
      );
      
      if (session?.messages) {
        const totalMessages = session.messages.length + messages.length;
        
        if (totalMessages > this.summarizationConfig.messageThreshold) {
          // Fetch, summarize, then update
          const allMessages = [...session.messages, ...messages];
          const summarized = await this.checkAndSummarize(allMessages);
          
          await collection.updateOne(
            { sessionId: this.id },
            { 
              $set: { 
                messages: summarized, 
                updatedAt: new Date() 
              } 
            },
            { upsert: true }
          );
          return;
        }
      }
    }
    
    // Atomic operation using MongoDB's $push, $each, and $slice operators
    // Note: $each without $position appends at end (default behavior)
    const updateDoc: any = {
      $push: {
        messages: {
          $each: messages,
        }
      },
      $set: { updatedAt: new Date() },
      $setOnInsert: {
        sessionId: this.id,
        metadata: {},
        createdAt: new Date()
      }
    };
    
    // Apply max messages limit atomically
    if (this.maxMessages) {
      updateDoc.$push.messages.$slice = -this.maxMessages;
    }
    
    // Single atomic operation (no read required)
    await collection.updateOne(
      { sessionId: this.id },
      updateDoc,
      { upsert: true }
    );
  }

  private async checkAndSummarize(messages: ModelMessage[]): Promise<ModelMessage[]> {
    if (!this.summarizationConfig) return messages;
    
    const { messageThreshold, keepRecentMessages } = this.summarizationConfig;
    
    // Count non-system messages (exclude existing summaries)
    const nonSystemMessages = messages.filter(msg => 
      !(msg.role === 'system' && typeof msg.content === 'string' && msg.content.includes('Previous conversation summary'))
    );
    
    // Only summarize if we exceed threshold
    if (nonSystemMessages.length <= messageThreshold) {
      return messages;
    }
    
    try {
      // Find existing summary (if any)
      const existingSummaryIndex = messages.findIndex(msg =>
        msg.role === 'system' && typeof msg.content === 'string' && msg.content.includes('Previous conversation summary')
      );
      
      let existingSummary: string | undefined;
      if (existingSummaryIndex >= 0) {
        const summaryMsg = messages[existingSummaryIndex];
        existingSummary = typeof summaryMsg.content === 'string' 
          ? summaryMsg.content.replace('Previous conversation summary:\n', '')
          : undefined;
        // Remove old summary
        messages.splice(existingSummaryIndex, 1);
      }
      
      // Messages to summarize (all except recent ones)
      const toSummarize = messages.slice(0, -keepRecentMessages);
      const recentMessages = messages.slice(-keepRecentMessages);
      
      // Generate summary
      const newSummary = await this.generateSummary(toSummarize, existingSummary);
      
      // Create summary as system message
      const summaryMessage: ModelMessage = {
        role: 'system',
        content: `Previous conversation summary:\n${newSummary}`
      };
      
      // Return: [summary, recent messages]
      return [summaryMessage, ...recentMessages];
      
    } catch (_error: any) {
      if (process.env.NODE_ENV === 'development') {
        // Summarization failed, keep existing state
      }
      // Fallback to sliding window
      if (this.maxMessages && messages.length > this.maxMessages) {
        return messages.slice(-this.maxMessages);
      }
      return messages;
    }
  }

  private async generateSummary(messages: ModelMessage[], previousSummary?: string): Promise<string> {
    if (!this.summarizationConfig) {
      throw new Error('Summarization config not set');
    }
    
    // Build conversation text
    const conversationText = messages
      .map(msg => `${msg.role}: ${typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)}`)
      .join('\n\n');
    
    // Use custom prompt or default
    const summaryPrompt = this.summarizationConfig.summaryPrompt || 
      `Summarize the following conversation concisely, preserving all important facts, context, and information about the user. Focus on:
- User's identity (name, job, background)
- Key facts mentioned
- Topics discussed
- Important context

Conversation:
${conversationText}

Summary (2-3 paragraphs):`;

    // If previous summary exists, include it
    const fullPrompt = previousSummary 
      ? `Previous summary:\n${previousSummary}\n\n${summaryPrompt}`
      : summaryPrompt;
    
    // Use the provided model or create simple summary
    if (this.summarizationConfig.model) {
      const { generateText } = await import('ai');
      const result = await generateText({
        model: this.summarizationConfig.model,
        prompt: fullPrompt,
        maxOutputTokens: 500,
      } as any);
      return result.text;
    } else {
      // Simple fallback
      return this.createSimpleSummary(messages, previousSummary);
    }
  }

  private createSimpleSummary(messages: ModelMessage[], previousSummary?: string): string {
    const facts: string[] = [];
    
    messages.forEach(msg => {
      const content = typeof msg.content === 'string' ? msg.content : '';
      
      if (content.includes("I'm") || content.includes("I am") || 
          content.includes("My name") || content.includes("I work") ||
          content.includes("I live") || content.includes("I graduated")) {
        facts.push(content);
      }
    });
    
    if (previousSummary) {
      return `${previousSummary}\n\nAdditional context: ${facts.slice(0, 5).join('. ')}`;
    }
    
    return facts.slice(0, 10).join('. ');
  }

  async clear(): Promise<void> {
    await this.getCollection().updateOne(
      { sessionId: this.id },
      {
        $set: {
          messages: [],
          metadata: {},
          updatedAt: new Date()
        }
      }
    );
  }

  async getMetadata(): Promise<Record<string, any>> {
    const session = await this.getCollection().findOne({ sessionId: this.id });
    return session?.metadata || {};
  }

  async updateMetadata(metadata: Record<string, any>): Promise<void> {
    const existingMetadata = await this.getMetadata();
    const updatedMetadata = { ...existingMetadata, ...metadata };
    
    await this.getCollection().updateOne(
      { sessionId: this.id },
      {
        $set: {
          metadata: updatedMetadata,
          updatedAt: new Date()
        }
      },
      { upsert: true }
    );
  }
}

// ============================================
// HYBRID SESSION (Redis + Database)
// ============================================

/**
 * Configuration for hybrid (Redis + MongoDB) session storage.
 * 
 * @property {Redis} redis - Redis client for fast caching
 * @property {any} db - MongoDB Database instance for durable storage
 * @property {string} [redisKeyPrefix] - Prefix for Redis keys
 * @property {number} [redisTTL] - Redis TTL in seconds
 * @property {string} [dbCollectionName] - MongoDB collection name
 * @property {number} [maxMessages] - Maximum number of messages to keep
 * @property {number} [syncToDBInterval] - Sync to DB every N messages (default: 5)
 * @property {SummarizationConfig} [summarization] - Optional auto-summarization config
 */
export interface HybridSessionConfig {
  redis: Redis;
  db: any;
  redisKeyPrefix?: string;
  redisTTL?: number;
  dbCollectionName?: string;
  maxMessages?: number;
  syncToDBInterval?: number; // Sync to DB every N messages
  summarization?: SummarizationConfig;
}

/**
 * Hybrid session storage combining Redis (fast) and MongoDB (durable).
 * Reads from Redis first, falls back to MongoDB, and syncs periodically.
 * 
 * @template TContext - Type of context object
 * 
 * @example
 * ```typescript
 * const session = new HybridSession('user-123', {
 *   redis,
 *   db,
 *   redisTTL: 3600,
 *   dbCollectionName: 'sessions',
 *   syncToDBInterval: 5
 * });
 * ```
 */
export class HybridSession<TContext = any> implements Session<TContext> {
  public readonly id: string;
  private redisSession: RedisSession<TContext>;
  private dbSession: DatabaseSession<TContext>;
  private syncToDBInterval: number;
  private messagesSinceSync: number = 0;

  constructor(id: string, config: HybridSessionConfig) {
    this.id = id;
    
    this.redisSession = new RedisSession(id, {
      redis: config.redis,
      keyPrefix: config.redisKeyPrefix,
      ttl: config.redisTTL,
      maxMessages: config.maxMessages,
      summarization: config.summarization
    });
    
    this.dbSession = new DatabaseSession(id, {
      db: config.db,
      collectionName: config.dbCollectionName,
      maxMessages: config.maxMessages,
      summarization: config.summarization
    });
    
    this.syncToDBInterval = config.syncToDBInterval || 5;
  }

  async getHistory(): Promise<ModelMessage[]> {
    // Try Redis first (fast)
    let messages = await this.redisSession.getHistory();
    
    if (messages.length === 0) {
      // Fallback to DB
      messages = await this.dbSession.getHistory();
      
      // Warm Redis cache
      if (messages.length > 0) {
        await this.redisSession.addMessages(messages);
      }
    }
    
    return messages;
  }

  async addMessages(messages: ModelMessage[]): Promise<void> {
    // Always add to Redis (fast)
    await this.redisSession.addMessages(messages);
    
    this.messagesSinceSync += messages.length;
    
    // Sync to DB periodically or if threshold reached
    if (this.messagesSinceSync >= this.syncToDBInterval) {
      await this.syncToDatabase();
    }
  }

  async clear(): Promise<void> {
    await Promise.all([
      this.redisSession.clear(),
      this.dbSession.clear()
    ]);
    this.messagesSinceSync = 0;
  }

  async getMetadata(): Promise<Record<string, any>> {
    // Try Redis first
    let metadata = await this.redisSession.getMetadata();
    
    if (Object.keys(metadata).length === 0) {
      // Fallback to DB
      metadata = await this.dbSession.getMetadata();
      
      // Warm Redis cache
      if (Object.keys(metadata).length > 0) {
        await this.redisSession.updateMetadata(metadata);
      }
    }
    
    return metadata;
  }

  async updateMetadata(metadata: Record<string, any>): Promise<void> {
    await Promise.all([
      this.redisSession.updateMetadata(metadata),
      this.dbSession.updateMetadata(metadata)
    ]);
  }

  /**
   * Manually synchronize Redis cache to MongoDB database.
   * Useful for ensuring data persistence before shutdown or for backup.
   * 
   * @returns {Promise<void>}
   */
  async syncToDatabase(): Promise<void> {
    const messages = await this.redisSession.getHistory();
    const metadata = await this.redisSession.getMetadata();

    // Use atomic $set instead of clear+add to prevent data loss if process crashes mid-sync
    const collection = (this.dbSession as any).getCollection();
    await collection.updateOne(
      { sessionId: this.id },
      {
        $set: {
          messages,
          metadata,
          updatedAt: new Date(),
        },
        $setOnInsert: {
          sessionId: this.id,
          createdAt: new Date(),
        },
      },
      { upsert: true }
    );

    this.messagesSinceSync = 0;
  }
}

// ============================================
// SESSION MANAGER (for easy session creation)
// ============================================

/**
 * Configuration for automatic conversation summarization.
 * 
 * @property {boolean} enabled - Enable auto-summarization
 * @property {number} messageThreshold - Trigger summarization when message count exceeds this
 * @property {number} keepRecentMessages - Number of recent messages to keep verbatim (default: 3)
 * @property {any} [model] - Model to use for summarization (optional)
 * @property {string} [summaryPrompt] - Custom system prompt for summarization
 */
export interface SummarizationConfig {
  /** Enable auto-summarization */
  enabled: boolean;
  
  /** Trigger summarization when message count exceeds this */
  messageThreshold: number; // Default: 10
  
  /** Number of recent messages to keep verbatim */
  keepRecentMessages: number; // Default: 3
  
  /** Model to use for summarization (optional, uses default if not set) */
  model?: any; // LanguageModelV1
  
  /** System prompt for summarization */
  summaryPrompt?: string;
}

/**
 * Configuration for SessionManager.
 * 
 * @property {'memory' | 'redis' | 'database' | 'hybrid'} type - Session storage type
 * @property {Redis} [redis] - Redis client (required for redis/hybrid types)
 * @property {any} [db] - MongoDB Database instance (required for database/hybrid types)
 * @property {string} [redisKeyPrefix] - Prefix for Redis keys
 * @property {number} [redisTTL] - Redis TTL in seconds
 * @property {string} [dbCollectionName] - MongoDB collection name
 * @property {number} [maxMessages] - Maximum messages per session
 * @property {number} [syncToDBInterval] - Sync interval for hybrid sessions
 * @property {SummarizationConfig} [summarization] - Auto-summarization config
 */
export interface SessionManagerConfig {
  type: 'memory' | 'redis' | 'database' | 'hybrid';
  redis?: Redis;
  db?: any;
  redisKeyPrefix?: string;
  redisTTL?: number;
  dbCollectionName?: string;
  maxMessages?: number;
  syncToDBInterval?: number;
  
  /** Auto-summarization configuration */
  summarization?: SummarizationConfig;
}

/**
 * Session manager for creating and managing sessions of different types.
 * Provides a unified interface for session creation.
 * 
 * @example
 * ```typescript
 * const manager = new SessionManager({
 *   type: 'redis',
 *   redis,
 *   maxMessages: 50
 * });
 * 
 * const session = manager.getSession('user-123');
 * ```
 */
export class SessionManager {
  private config: SessionManagerConfig;
  private sessions: Map<string, Session<any>> = new Map();
  private sessionTimestamps: Map<string, number> = new Map();
  private maxCachedSessions: number;

  constructor(config: SessionManagerConfig & { maxCachedSessions?: number }) {
    this.config = config;
    this.maxCachedSessions = config.maxCachedSessions ?? 1000;
  }

  /**
   * Get or create a session for the given session ID.
   * Sessions are cached in memory for reuse.
   * 
   * @template TContext - Type of context object
   * @param {string} sessionId - Unique session identifier
   * @returns {Session<TContext>} Session instance
   * @throws {Error} If required dependencies are missing for the session type
   */
  getSession<TContext = any>(sessionId: string): Session<TContext> {
    // Check if session already exists
    if (this.sessions.has(sessionId)) {
      return this.sessions.get(sessionId)!;
    }

    // Create new session based on type
    let session: Session<TContext>;

    switch (this.config.type) {
      case 'memory':
        session = new MemorySession<TContext>(
          sessionId, 
          this.config.maxMessages,
          this.config.summarization
        );
        break;

      case 'redis':
        if (!this.config.redis) {
          throw new Error('Redis instance required for redis session type');
        }
        session = new RedisSession<TContext>(sessionId, {
          redis: this.config.redis,
          keyPrefix: this.config.redisKeyPrefix,
          ttl: this.config.redisTTL,
          maxMessages: this.config.maxMessages,
          summarization: this.config.summarization
        });
        break;

      case 'database':
        if (!this.config.db) {
          throw new Error('Database instance required for database session type');
        }
        session = new DatabaseSession<TContext>(sessionId, {
          db: this.config.db,
          collectionName: this.config.dbCollectionName,
          maxMessages: this.config.maxMessages,
          summarization: this.config.summarization
        });
        break;

      case 'hybrid':
        if (!this.config.redis || !this.config.db) {
          throw new Error('Both Redis and Database required for hybrid session type');
        }
        session = new HybridSession<TContext>(sessionId, {
          redis: this.config.redis,
          db: this.config.db,
          redisKeyPrefix: this.config.redisKeyPrefix,
          redisTTL: this.config.redisTTL,
          dbCollectionName: this.config.dbCollectionName,
          maxMessages: this.config.maxMessages,
          syncToDBInterval: this.config.syncToDBInterval,
          summarization: this.config.summarization
        });
        break;

      default:
        throw new Error(`Unknown session type: ${this.config.type}`);
    }

    this.sessions.set(sessionId, session);
    this.sessionTimestamps.set(sessionId, Date.now());

    // Evict oldest sessions if cache exceeds limit
    if (this.sessions.size > this.maxCachedSessions) {
      this.evictOldest();
    }

    return session;
  }

  /**
   * Evict the oldest 20% of cached sessions when the cache exceeds maxCachedSessions.
   */
  private evictOldest(): void {
    const entries = [...this.sessionTimestamps.entries()].sort((a, b) => a[1] - b[1]);
    const toRemove = entries.slice(0, Math.floor(this.sessions.size * 0.2));
    for (const [id] of toRemove) {
      this.sessions.delete(id);
      this.sessionTimestamps.delete(id);
    }
  }

  /**
   * Delete a session and clear its data from storage.
   * 
   * @param {string} sessionId - Session ID to delete
   * @returns {Promise<void>}
   */
  async deleteSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      await session.clear();
      this.sessions.delete(sessionId);
      this.sessionTimestamps.delete(sessionId);
    }
  }

  /**
   * Clear all cached session instances from memory.
   * Does not clear session data from storage (Redis/MongoDB).
   * 
   * @returns {void}
   */
  clearCache(): void {
    this.sessions.clear();
    this.sessionTimestamps.clear();
  }
}
