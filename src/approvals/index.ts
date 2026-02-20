/**
 * Human-in-the-Loop Support
 * 
 * Allows agents to request approval before executing sensitive tools
 */

import type { ApprovalConfig, ApprovalResponse, PendingApproval } from '../types/types';
import { randomBytes } from 'crypto';
import { safeFetch, validateUrl } from '../helpers/safe-fetch';

// ============================================
// APPROVAL MANAGER
// ============================================

/**
 * Manager for human-in-the-loop approvals.
 * Handles approval requests, responses, and timeouts.
 * 
 * @example
 * ```typescript
 * const manager = new ApprovalManager();
 * 
 * const approved = await manager.requestApproval(
 *   'deleteFile',
 *   { path: '/important.txt' },
 *   {
 *     requiredForTools: ['deleteFile'],
 *     requestApproval: createCLIApprovalHandler()
 *   }
 * );
 * ```
 */
export class ApprovalManager {
  private pendingApprovals = new Map<string, PendingApproval>();
  private approvalResponses = new Map<string, ApprovalResponse>();

  /**
   * Check if a tool requires approval based on configuration.
   * 
   * @param {string} toolName - Name of the tool
   * @param {ApprovalConfig} [config] - Approval configuration
   * @returns {boolean} True if tool requires approval
   */
  requiresApproval(toolName: string, config?: ApprovalConfig): boolean {
    // Default-deny for known sensitive tool patterns (H-003)
    const sensitivePatterns = ['delete', 'remove', 'drop', 'exec', 'execute', 'admin', 'destroy'];
    const matchesSensitivePattern = sensitivePatterns.some(p => toolName.toLowerCase().includes(p));

    if (!config) {
      if (matchesSensitivePattern) {
        console.warn(
          `[ApprovalManager] Tool "${toolName}" matches a sensitive pattern — requiring approval by default.`
        );
        return true;
      }
      return false;
    }

    // Explicit config takes priority, but sensitive patterns still require approval
    // unless the config explicitly exempts them via exemptTools
    if (config.requiredForTools?.includes(toolName)) {
      return true;
    }

    if (matchesSensitivePattern && !config.exemptTools?.includes(toolName)) {
      return true;
    }

    return false;
  }

  /**
   * Request approval for a tool execution.
   * Creates a pending approval and waits for response from the handler.
   * 
   * @param {string} toolName - Name of the tool requesting approval
   * @param {any} args - Arguments for the tool call
   * @param {ApprovalConfig} config - Approval configuration with handler
   * @returns {Promise<ApprovalResponse>} Approval response (approved/rejected)
   * @throws {Error} If approval times out
   */
  async requestApproval(
    toolName: string,
    args: any,
    config: ApprovalConfig
  ): Promise<ApprovalResponse> {
    const approvalToken = this.generateToken();

    // Store pending approval
    const pending: PendingApproval = {
      toolName,
      args,
      approvalToken,
      requestedAt: Date.now(),
      status: 'pending',
    };
    this.pendingApprovals.set(approvalToken, pending);

    try {
      // Request approval from the configured handler
      const response = await Promise.race([
        config.requestApproval(toolName, args),
        this.timeout(config.timeout || 300000), // Default 5 minutes
      ]);

      // Update status
      pending.status = response.approved ? 'approved' : 'rejected';
      this.approvalResponses.set(approvalToken, response);

      return response;
    } catch {
      pending.status = 'timeout';
      throw new Error(`Approval timeout for tool: ${toolName}`);
    }
  }

  /**
   * Get a pending approval by its token.
   * 
   * @param {string} token - Approval token
   * @returns {PendingApproval | undefined} Pending approval or undefined if not found
   */
  getPendingApproval(token: string): PendingApproval | undefined {
    return this.pendingApprovals.get(token);
  }

  /**
   * Submit an approval response for a pending approval.
   * 
   * @param {string} token - Approval token
   * @param {ApprovalResponse} response - Approval response
   * @returns {void}
   */
  submitApproval(token: string, response: ApprovalResponse): void {
    const pending = this.pendingApprovals.get(token);
    if (pending) {
      pending.status = response.approved ? 'approved' : 'rejected';
      this.approvalResponses.set(token, response);
    }
  }

  /**
   * Get all currently pending approvals.
   * 
   * @returns {PendingApproval[]} Array of pending approvals
   */
  getPendingApprovals(): PendingApproval[] {
    return Array.from(this.pendingApprovals.values()).filter(
      (p) => p.status === 'pending'
    );
  }

  /**
   * Clear expired pending approvals older than the specified age.
   * 
   * @param {number} [maxAge] - Maximum age in milliseconds (default: 600000 = 10 minutes)
   * @returns {void}
   */
  clearExpired(maxAge: number = 600000): void {
    const now = Date.now();
    for (const [token, pending] of this.pendingApprovals) {
      if (now - pending.requestedAt > maxAge) {
        pending.status = 'timeout';
        this.pendingApprovals.delete(token);
      }
    }
  }

  private generateToken(): string {
    return randomBytes(16).toString('hex');
  }

  private timeout(ms: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Timeout')), ms);
    });
  }
}

// ============================================
// GLOBAL APPROVAL MANAGER
// ============================================

let globalApprovalManager: ApprovalManager | null = null;

/**
 * Get or create the global approval manager instance.
 * 
 * @returns {ApprovalManager} Global approval manager
 */
export function getGlobalApprovalManager(): ApprovalManager {
  if (!globalApprovalManager) {
    globalApprovalManager = new ApprovalManager();
  }
  return globalApprovalManager;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Create a CLI-based approval handler that prompts the user in the terminal.
 * 
 * @returns {Function} Approval handler function
 * 
 * @example
 * ```typescript
 * const handler = createCLIApprovalHandler();
 * const approved = await handler('deleteFile', { path: '/tmp/file.txt' });
 * ```
 */
export function createCLIApprovalHandler(): ApprovalConfig['requestApproval'] {
  return async (toolName: string, args: any): Promise<ApprovalResponse> => {
    // In a real implementation, this would prompt the user in the CLI
    // For now, return a promise that can be resolved externally
    console.log(`\n⚠️  Approval required for tool: ${toolName}`);
    console.log('Arguments:', JSON.stringify(args, null, 2));
    console.log('Approve? (y/n)');

    // This is a placeholder - in real use, implement proper CLI prompts
    return new Promise((resolve) => {
      if (process.stdin.isTTY) {
        process.stdin.once('data', (data) => {
          const input = data.toString().trim().toLowerCase();
          resolve({
            approved: input === 'y' || input === 'yes',
            reason: input === 'y' ? undefined : 'User rejected',
          });
        });
      } else {
        // Non-interactive - auto-reject
        resolve({
          approved: false,
          reason: 'Non-interactive environment',
        });
      }
    });
  };
}

/**
 * Create a webhook-based approval handler that sends requests to an external API.
 * 
 * @param {string} webhookUrl - URL to send approval requests to
 * @param {string} [apiKey] - Optional API key for authentication
 * @returns {Function} Approval handler function
 * 
 * @example
 * ```typescript
 * const handler = createWebhookApprovalHandler(
 *   'https://api.example.com/approve',
 *   'secret-key'
 * );
 * ```
 */
export function createWebhookApprovalHandler(
  webhookUrl: string,
  apiKey?: string
): ApprovalConfig['requestApproval'] {
  // Validate webhook URL at creation time
  validateUrl(webhookUrl);

  return async (toolName: string, args: any): Promise<ApprovalResponse> => {
    const response = await safeFetch(webhookUrl, {
      timeoutMs: 10000,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey && { 'Authorization': `Bearer ${apiKey}` }),
      },
      body: JSON.stringify({
        toolName,
        args,
        timestamp: Date.now(),
      }),
    });

    if (!response.ok) {
      throw new Error(`Webhook approval request failed: ${response.statusText}`);
    }

    return await response.json() as ApprovalResponse;
  };
}

/**
 * Create an approval handler that always approves (for testing)
 */
export function createAutoApproveHandler(): ApprovalConfig['requestApproval'] {
  return async (toolName: string, _args: any): Promise<ApprovalResponse> => {
    console.log(`✅ Auto-approved: ${toolName}`);
    return { approved: true };
  };
}

/**
 * Create an approval handler that always rejects (for testing)
 */
export function createAutoRejectHandler(): ApprovalConfig['requestApproval'] {
  return async (toolName: string, _args: any): Promise<ApprovalResponse> => {
    console.log(`❌ Auto-rejected: ${toolName}`);
    return { approved: false, reason: 'Auto-rejected for testing' };
  };
}

