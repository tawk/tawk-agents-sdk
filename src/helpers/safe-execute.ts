/**
 * Safe Execution Utilities
 * 
 * Provides safe execution wrappers for tools and async operations.
 * 
 * @module utils/safe-execute
 */

/**
 * Result of safe execution: [error, result]
 * If error is null, result contains the value.
 * If error is not null, result is null.
 */
export type SafeExecuteResult<T> = [Error | unknown | null, T | null];

/**
 * Safely execute an async function, catching any errors
 * 
 * @param fn - The function to execute
 * @returns Tuple of [error, result]
 * 
 * @example
 * ```typescript
 * const [error, result] = await safeExecute(() => tool.execute(args));
 * if (error) {
 *   console.error('Tool failed:', error);
 *   return handleError(error);
 * }
 * return result;
 * ```
 */
export async function safeExecute<T>(
  fn: () => T | Promise<T>
): Promise<SafeExecuteResult<T>> {
  try {
    const result = await fn();
    return [null, result];
  } catch (error) {
    return [error, null];
  }
}

/**
 * Safe execute with timeout
 * 
 * @param fn - The function to execute
 * @param timeoutMs - Timeout in milliseconds
 * @returns Tuple of [error, result]
 */
export async function safeExecuteWithTimeout<T>(
  fn: () => T | Promise<T>,
  timeoutMs: number
): Promise<SafeExecuteResult<T>> {
  let resolved = false;
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        resolve([new Error(`Execution timeout after ${timeoutMs}ms`), null]);
      }
    }, timeoutMs);

    safeExecute(fn).then((result) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        resolve(result);
      }
    });
  });
}

