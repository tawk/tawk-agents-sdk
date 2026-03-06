/**
 * Agent Module - Main Exports
 * 
 * @module core/agent
 * @description
 * Barrel export file that provides the complete Agent API.
 * Maintains 100% backward compatibility with the original agent.ts file.
 * 
 * **Exported Components**:
 * - Agent class and utilities
 * - Type definitions
 * - Tool creation function
 * - Model management functions
 * 
 * @author Tawk.to
 * @license MIT
 * @version 1.0.0
 */

// ============================================
// TYPE DEFINITIONS
// ============================================

export type {
  // Core tool type
  CoreTool,
  
  // Configuration interfaces
  AgentConfig,
  RunOptions,
  
  // Result interfaces
  RunResult,
  StreamResult,
  StreamChunk,
  StepResult,
  AgentMetric,
  
  // State interfaces
  RunState,
  RunContextWrapper,
  
  // Guardrail interfaces
  Guardrail,
  GuardrailResult,
} from './types';

// ============================================
// AGENT CLASS
// ============================================

export {
  Agent,
  setDefaultModel,
  getDefaultModel,
} from './agent-class';

// ============================================
// TOOL UTILITIES
// ============================================

export { tool } from './tools';

// ============================================
// EXECUTION FUNCTIONS
// ============================================

export { run, runStream } from './run';

// ============================================
// RE-EXPORTS FOR COMPATIBILITY
// ============================================

// Export everything that was in the original agent.ts
// to maintain 100% backward compatibility
export * from './types';
export * from './agent-class';
export * from './tools';
export * from './run';

