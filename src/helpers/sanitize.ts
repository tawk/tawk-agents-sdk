/**
 * Error Sanitization Utilities
 *
 * Prevents accidental leakage of API keys, tokens, and credentials
 * in error messages, logs, and tracing output.
 *
 * @module helpers/sanitize
 */

/**
 * Combined regex matching all known secret formats in a single pass.
 * This is more performant than running 8+ separate replace() calls.
 */
const SECRET_PATTERN = new RegExp(
  [
    'Bearer\\s+\\S+',                       // Bearer tokens
    'Basic\\s+\\S+',                         // Basic auth
    'sk-[a-zA-Z0-9_-]{20,}',                // OpenAI-style API keys
    'AKIA[0-9A-Z]{16}',                      // AWS Access Key IDs
    'ghp_[A-Za-z0-9_]{36,}',                // GitHub personal access tokens
    'gho_[A-Za-z0-9_]{36,}',                // GitHub OAuth tokens
    'sk_(?:live|test)_[A-Za-z0-9]{24,}',    // Stripe keys
    'eyJ[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+', // JWT tokens
    'api[_-]?key[=:]\\s*\\S+',              // Generic api_key=...
    'key[=:]\\s*\\S+',                       // key=...
    'token[=:]\\s*\\S+',                     // token=...
    'password[=:]\\s*\\S+',                  // password=...
    'secret[=:]\\s*\\S+',                    // secret=...
  ].join('|'),
  'gi'
);

/**
 * Sanitize an error value for safe inclusion in logs/traces.
 * Strips API keys, tokens, and other credential patterns.
 * Handles nested Error objects with cause chains.
 *
 * @param error - The error to sanitize (Error, string, or unknown)
 * @returns A sanitized string representation
 */
export function sanitizeError(error: unknown): string {
  if (error instanceof Error) {
    // Sanitize message + stack + cause chain
    let result = redactSecrets(error.message);
    if (error.stack) {
      result = redactSecrets(error.stack);
    }
    // Handle Error.cause (ES2022+)
    if ('cause' in error && error.cause) {
      result += ` [cause: ${sanitizeError(error.cause)}]`;
    }
    return result;
  }

  // Handle plain objects (e.g., error.context = { apiKey: "..." })
  if (typeof error === 'object' && error !== null) {
    try {
      return redactSecrets(JSON.stringify(error));
    } catch {
      // Circular reference or other serialization failure
      return redactSecrets(String(error));
    }
  }

  return redactSecrets(String(error));
}

/**
 * Redact known secret patterns from a string.
 * Uses a single combined regex for performance.
 *
 * @param text - Input string that may contain secrets
 * @returns String with secrets replaced by [REDACTED]
 */
export function redactSecrets(text: string): string {
  return text.replace(SECRET_PATTERN, '[REDACTED]');
}
