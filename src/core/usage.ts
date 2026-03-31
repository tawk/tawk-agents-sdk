/**
 * Token Usage Tracking
 * 
 * @module core/usage
 * @description
 * Comprehensive token usage and cost tracking for agent runs.
 * 
 * **Tracked Metrics**:
 * - Input tokens consumed
 * - Output tokens generated
 * - Total tokens used
 * - Number of API requests
 * - Estimated costs
 * 
 * **Features**:
 * - Automatic accumulation across runs
 * - Per-agent metrics
 * - Cost estimation support
 * - Zero-overhead tracking
 * - Thread-safe operations
 * 
 * @author Tawk.to
 * @license MIT
 * @version 3.0.0
 */

/**
 * Tracks token usage and request counts for an agent run.
 */
export class Usage {
  /**
   * The number of requests made to the LLM API.
   */
  public requests: number;

  /**
   * The number of input tokens used across all requests.
   */
  public inputTokens: number;

  /**
   * The number of output tokens used across all requests.
   */
  public outputTokens: number;

  /**
   * The total number of tokens sent and received, across all requests.
   */
  public totalTokens: number;

  constructor(input?: {
    requests?: number;
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    // AI SDK format
    promptTokens?: number;
    completionTokens?: number;
  }) {
    if (typeof input === 'undefined') {
      this.requests = 0;
      this.inputTokens = 0;
      this.outputTokens = 0;
      this.totalTokens = 0;
    } else {
      this.requests = input?.requests ?? 1;
      // Support both formats
      this.inputTokens = input?.inputTokens ?? input?.promptTokens ?? 0;
      this.outputTokens = input?.outputTokens ?? input?.completionTokens ?? 0;
      this.totalTokens = input?.totalTokens ?? 
        (this.inputTokens + this.outputTokens);
    }
  }

  /**
   * Add usage from another Usage instance
   */
  add(newUsage: Usage): void {
    this.requests += newUsage.requests;
    this.inputTokens += newUsage.inputTokens;
    this.outputTokens += newUsage.outputTokens;
    this.totalTokens += newUsage.totalTokens;
  }

  /**
   * Convert to JSON for serialization
   */
  toJSON() {
    return {
      requests: this.requests,
      inputTokens: this.inputTokens,
      outputTokens: this.outputTokens,
      totalTokens: this.totalTokens,
    };
  }

  /**
   * Estimate cost based on model pricing
   * 
   * @param options - Options for cost estimation
   * @param options.model - Model name (e.g., 'gpt-4o', 'gpt-3.5-turbo')
   * @param options.inputPricePerMillion - Custom input price per million tokens
   * @param options.outputPricePerMillion - Custom output price per million tokens
   * @returns Estimated cost in USD
   * 
   * @example
   * ```typescript
   * const cost = usage.estimateCost({ model: 'gpt-4o' });
   * console.log(`Estimated cost: $${cost.toFixed(4)}`);
   * ```
   */
  estimateCost(options: {
    model?: string;
    inputPricePerMillion?: number;
    outputPricePerMillion?: number;
  } = {}): number {
    let inputPrice = options.inputPricePerMillion;
    let outputPrice = options.outputPricePerMillion;

    // Default pricing (as of 2024) - per million tokens
    if (!inputPrice || !outputPrice) {
      const model = options.model?.toLowerCase() || '';
      
      // OpenAI pricing
      if (model.includes('gpt-4o')) {
        inputPrice = inputPrice ?? 2.50;   // $2.50 per 1M input tokens
        outputPrice = outputPrice ?? 10.00; // $10.00 per 1M output tokens
      } else if (model.includes('gpt-4-turbo') || model.includes('gpt-4-1106') || model.includes('gpt-4-0125')) {
        inputPrice = inputPrice ?? 10.00;
        outputPrice = outputPrice ?? 30.00;
      } else if (model.includes('gpt-4')) {
        inputPrice = inputPrice ?? 30.00;
        outputPrice = outputPrice ?? 60.00;
      } else if (model.includes('gpt-3.5-turbo')) {
        inputPrice = inputPrice ?? 0.50;
        outputPrice = outputPrice ?? 1.50;
      } else if (model.includes('claude-3-opus')) {
        inputPrice = inputPrice ?? 15.00;
        outputPrice = outputPrice ?? 75.00;
      } else if (model.includes('claude-3-sonnet')) {
        inputPrice = inputPrice ?? 3.00;
        outputPrice = outputPrice ?? 15.00;
      } else if (model.includes('claude-3-haiku')) {
        inputPrice = inputPrice ?? 0.25;
        outputPrice = outputPrice ?? 1.25;
      } else if (model.includes('gemini-1.5-pro')) {
        inputPrice = inputPrice ?? 1.25;
        outputPrice = outputPrice ?? 5.00;
      } else if (model.includes('gemini-1.5-flash')) {
        inputPrice = inputPrice ?? 0.075;
        outputPrice = outputPrice ?? 0.30;
      } else {
        // Default fallback pricing (similar to GPT-3.5)
        inputPrice = inputPrice ?? 0.50;
        outputPrice = outputPrice ?? 1.50;
      }
    }

    // Calculate cost
    const inputCost = (this.inputTokens / 1_000_000) * inputPrice;
    const outputCost = (this.outputTokens / 1_000_000) * outputPrice;
    
    return inputCost + outputCost;
  }
}

