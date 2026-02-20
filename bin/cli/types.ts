/**
 * Shared CLI types for tawk-cli
 */

import type { Agent, MemorySession } from '../../src';
import type { Usage } from '../../src/core/usage';

export interface CLIOptions {
  model: string;
  agent: string;
  session: string;
  noStream: boolean;
  verbose: boolean;
  maxTurns: number;
}

export interface CLIState {
  agent: Agent;
  agentName: string;
  session: MemorySession;
  cumulativeUsage: Usage;
  totalToolCalls: number;
  totalDuration: number;
  turnCount: number;
  verbose: boolean;
  modelId: string;
}

export interface AgentPreset {
  name: string;
  description: string;
  instructions: string;
  toolNames: string[];
  subagents?: AgentPreset[];
}
