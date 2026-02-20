/**
 * Agent Transfer System
 * 
 * @module core/transfers
 * @description
 * Multi-agent coordination with context isolation for true agentic architecture.
 * 
 * **Key Features**:
 * - Agent-to-agent transfers with isolated contexts
 * - Automatic transfer tool generation
 * - Clean message filtering (no history carryover)
 * - Query extraction for targeted delegation
 * - Performance-optimized for minimal overhead
 * 
 * **Design Philosophy**:
 * Each transfer starts fresh with only the necessary context,
 * ensuring agents remain focused and performant. This approach
 * mimics human delegation patterns where you provide just enough
 * context for the specialist to complete their task.
 * 
 * @author Tawk.to
 * @license MIT
 * @version 1.0.0
 */

import { Agent, CoreTool } from './agent';
import { z } from 'zod';

/**
 * Transfer result structure
 */
export interface TransferResult {
  agent: Agent<any, any>;
  reason: string;
  query?: string;  // Isolated query for the new agent
}

/**
 * Create transfer tools for an agent based on its subagents
 * 
 * @param agent - The agent to create transfer tools for
 * @param subagents - Array of sub-agents this agent can transfer to
 * @returns Record of tool definitions
 */
export function createTransferTools(
  agent: Agent<any, any>,
  subagents: Agent<any, any>[]
): Record<string, CoreTool> {
  const tools: Record<string, CoreTool> = {};
  
  for (const subagent of subagents) {
    const toolName = `transfer_to_${subagent.name.toLowerCase().replace(/\s+/g, '_')}`;
    
    const description = subagent.transferDescription || subagent.handoffDescription 
      ? `Transfer to ${subagent.name}: ${subagent.transferDescription || subagent.handoffDescription}`
      : `Transfer to ${subagent.name} agent to handle the request`;
    
    tools[toolName] = {
      description,
      inputSchema: z.object({
        reason: z.string().describe('Reason for transferring to this agent'),
        query: z.string().optional().describe('Specific query for the agent (if different from original)')
      }),
      execute: async ({ reason, query }: { reason: string; query?: string }) => {
        // Return transfer marker with isolated context
        return {
          __transfer: true,
          agentName: subagent.name,
          reason,
          query: query || null  // Isolated query (or null to use original)
        };
      }
    };
  }
  
  return tools;
}

/**
 * Detect transfer from tool results - O(1) lookup for performance
 * 
 * @param toolResults - Array of tool execution results
 * @param currentAgent - The current agent
 * @returns Transfer result if detected, null otherwise
 */
export function detectTransfer(
  toolResults: Array<{ toolName: string; args: any; result: any }>,
  currentAgent: Agent<any, any>
): TransferResult | null {
  // Early exit if no tool results
  if (toolResults.length === 0) return null;
  
  // Create agent lookup map for O(1) resolution
  const subagents = currentAgent.subagents || currentAgent.handoffs || [];
  const subagentMap = new Map<string, Agent<any, any>>();
  for (const agent of subagents) {
    subagentMap.set(agent.name, agent);
  }
  
  // Check all tool results for transfer marker
  for (const tr of toolResults) {
    if (tr.result?.__transfer) {
      const agentName = tr.result.agentName;
      const targetAgent = subagentMap.get(agentName);
      
      if (!targetAgent) {
        // Transfer target not found — log warning so this isn't silently swallowed
        console.warn(
          `[tawk-agents-sdk] Transfer target "${agentName}" not found in subagents of "${currentAgent.name}". ` +
          `Available: [${Array.from(subagentMap.keys()).join(', ')}]`
        );
        return null;
      }
      
      return {
        agent: targetAgent,
        reason: tr.result.reason,
        query: tr.result.query  // Isolated query for fresh start
      };
    }
  }
  
  return null;
}

/**
 * Extract user query from input for isolated transfer
 * 
 * @param input - Original input (string or messages)
 * @returns Clean user query string
 */
export function extractUserQuery(input: string | any[]): string {
  if (typeof input === 'string') {
    return input;
  }
  
  // Find the last user message
  const userMessages = input.filter((m: any) => m.role === 'user');
  if (userMessages.length > 0) {
    const lastUser = userMessages[userMessages.length - 1];
    return typeof lastUser.content === 'string' 
      ? lastUser.content 
      : lastUser.content[0]?.text || '';
  }
  
  return '';
}

/**
 * Create transfer context string for system message
 * 
 * @param fromAgent - Agent transferring from
 * @param toAgent - Agent transferring to  
 * @param reason - Reason for transfer
 * @returns Formatted transfer context
 */
export function createTransferContext(fromAgent: string, toAgent: string, reason?: string): string {
  return `[Transfer from ${fromAgent}] You are now ${toAgent}. ${reason ? `Reason: ${reason}` : ''}`;
}

