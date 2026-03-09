/**
 * Tool Helper Functions
 * 
 * @module core/agent/tools
 * @description
 * Utility functions for creating and managing tools.
 * 
 * **Features**:
 * - Simple tool() function for creating tools
 * - Type-safe tool definitions
 * - AI SDK v5 compatibility
 * - Zod schema and JSON Schema validation support
 * 
 * @author Tawk.to
 * @license MIT
 * @version 1.0.0
 */

import type { CoreTool, FlexibleInputSchema } from './types';

/**
 * Create a tool that agents can use.
 * Provides a simple, type-safe way to define agent capabilities.
 * 
 * Supports multiple schema formats:
 * - Zod schemas (recommended for TypeScript type inference)
 * - JSON Schema (for dynamic or external schema definitions)
 * - AI SDK Schema objects (created via jsonSchema())
 * 
 * @template TParams - Schema type for tool input parameters
 * @template TOutput - Type of the tool output
 * @param {Object} config - Tool configuration
 * @param {string} config.description - Human-readable description of what the tool does
 * @param {FlexibleInputSchema} config.inputSchema - Schema for validating tool inputs
 * @param {Function} config.execute - Function that executes the tool logic
 * @param {boolean | Function} [config.enabled] - Whether the tool is enabled (can be dynamic)
 * @returns {CoreTool} Tool definition compatible with AI SDK v5
 * 
 * @example Basic Tool with Zod Schema
 * ```typescript
 * import { tool } from 'tawk-agents-sdk';
 * import { z } from 'zod';
 * 
 * const calculator = tool({
 *   description: 'Perform mathematical calculations',
 *   inputSchema: z.object({
 *     expression: z.string().describe('Math expression to evaluate')
 *   }),
 *   execute: async ({ expression }) => {
 *     return eval(expression);
 *   }
 * });
 * ```
 * 
 * @example Tool with JSON Schema
 * ```typescript
 * import { tool } from 'tawk-agents-sdk';
 * import { jsonSchema } from 'ai';
 * 
 * const weatherTool = tool({
 *   description: 'Get weather for a location',
 *   inputSchema: jsonSchema({
 *     type: 'object',
 *     properties: {
 *       location: { type: 'string', description: 'City name' },
 *       units: { type: 'string', enum: ['celsius', 'fahrenheit'] }
 *     },
 *     required: ['location']
 *   }),
 *   execute: async ({ location, units }) => {
 *     return { temp: 72, location, units };
 *   }
 * });
 * ```
 * 
 * @example Tool with Context
 * ```typescript
 * const getUserData = tool({
 *   description: 'Get user data from database',
 *   inputSchema: z.object({
 *     userId: z.string()
 *   }),
 *   execute: async ({ userId }, context) => {
 *     return await context.database.getUser(userId);
 *   }
 * });
 * ```
 * 
 * @example Conditional Tool
 * ```typescript
 * const adminTool = tool({
 *   description: 'Admin-only operation',
 *   inputSchema: z.object({
 *     action: z.string()
 *   }),
 *   enabled: (context) => context.user.isAdmin,
 *   execute: async ({ action }) => {
 *     // Admin operation
 *   }
 * });
 * ```
 */
export function tool(config: {
  description: string;
  inputSchema: FlexibleInputSchema;
  execute: (args: any, context?: any) => Promise<any> | any;
  enabled?: boolean | ((context: any) => boolean | Promise<boolean>);
  useTOON?: boolean;
}): CoreTool {
  return {
    description: config.description,
    inputSchema: config.inputSchema,
    execute: config.execute,
    enabled: config.enabled,
    useTOON: config.useTOON,
  };
}

