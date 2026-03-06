/**
 * Shared CLI types for tawk-cli
 */

import type { ModelMessage } from 'ai';
import type { Agent } from '../../src';
import type { Usage } from '../../src/core/usage';

/** Simple in-memory message store for the CLI REPL */
export class CLISession {
  readonly id: string;
  private messages: ModelMessage[] = [];

  constructor(id: string) {
    this.id = id;
  }

  async getHistory(): Promise<ModelMessage[]> {
    return [...this.messages];
  }

  async addMessages(msgs: ModelMessage[]): Promise<void> {
    this.messages.push(...msgs);
  }

  async clear(): Promise<void> {
    this.messages = [];
  }
}

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
  session: CLISession;
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
