/**
 * SSRF-safe fetch wrapper
 * Validates URLs against private IP ranges, enforces timeouts,
 * limits redirect following, and enforces response body size limits.
 */

const BLOCKED_HOSTNAME_PATTERNS = [
  // Loopback
  /^127\./, /^localhost$/i, /^::1$/, /^0\.0\.0\.0$/,
  // Private ranges
  /^10\./, /^172\.(1[6-9]|2[0-9]|3[01])\./, /^192\.168\./,
  // Link-local
  /^169\.254\./,
  // IPv6 private/link-local
  /^fc00:/i, /^fd[0-9a-f]{2}:/i, /^fe80:/i,
  // Multicast
  /^224\./, /^225\./, /^226\./, /^227\./, /^228\./, /^229\./, /^23[0-9]\./, /^ff[0-9a-f]{2}:/i,
  // Reserved/broadcast
  /^240\./, /^255\.255\.255\.255$/,
  // Metadata endpoints (cloud providers)
  /^metadata\.google\.internal$/i,
];

/** Maximum number of redirects to follow (prevents redirect loops) */
const MAX_REDIRECTS = 5;

/** Default max response body size: 10 MB */
const DEFAULT_MAX_RESPONSE_BYTES = 10 * 1024 * 1024;

export interface SafeFetchOptions extends RequestInit {
  timeoutMs?: number;
  maxResponseBytes?: number;
  maxRedirects?: number;
  allowHttp?: boolean;
  allowedHosts?: string[];
}

export function validateUrl(url: string, options: Pick<SafeFetchOptions, 'allowHttp' | 'allowedHosts'> = {}): void {
  const parsed = new URL(url);

  if (!options.allowHttp && parsed.protocol !== 'https:') {
    throw new Error(`Only HTTPS URLs allowed, got: ${parsed.protocol}`);
  }

  // Strip brackets from IPv6 addresses (URL parser keeps them)
  const hostname = parsed.hostname.replace(/^\[|\]$/g, '');

  if (BLOCKED_HOSTNAME_PATTERNS.some(p => p.test(hostname))) {
    throw new Error(`Request to private/reserved address blocked: ${hostname}`);
  }

  if (options.allowedHosts && !options.allowedHosts.includes(hostname)) {
    throw new Error(`Host not in allowlist: ${hostname}`);
  }
}

/**
 * Read a Response body with a streaming size limit.
 * Returns the body text, throwing if size exceeds maxBytes.
 */
async function readBodyWithLimit(response: Response, maxBytes: number): Promise<string> {
  // If body is a ReadableStream, enforce limit while streaming
  if (response.body) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let totalBytes = 0;
    const chunks: string[] = [];

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        totalBytes += value.byteLength;
        if (totalBytes > maxBytes) {
          reader.cancel();
          throw new Error(
            `Response body exceeds size limit: ${totalBytes}+ bytes > ${maxBytes} bytes`
          );
        }

        chunks.push(decoder.decode(value, { stream: true }));
      }
      // Flush decoder
      chunks.push(decoder.decode());
      return chunks.join('');
    } catch (error) {
      reader.cancel();
      throw error;
    }
  }

  // Fallback: read entire body at once
  const text = await response.text();
  if (text.length > maxBytes) {
    throw new Error(
      `Response body exceeds size limit: ${text.length} bytes > ${maxBytes} bytes`
    );
  }
  return text;
}

export async function safeFetch(url: string, options: SafeFetchOptions = {}): Promise<Response> {
  const {
    timeoutMs = 30000,
    maxResponseBytes = DEFAULT_MAX_RESPONSE_BYTES,
    maxRedirects = MAX_REDIRECTS,
    allowHttp,
    allowedHosts,
    ...fetchOptions
  } = options;

  // Validate initial URL
  validateUrl(url, { allowHttp, allowedHosts });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // Disable automatic redirect following so we can validate each hop
    let currentUrl = url;
    let redirectCount = 0;

    while (true) {
      const response = await fetch(currentUrl, {
        ...fetchOptions,
        signal: controller.signal,
        redirect: 'manual',
      });

      // Handle redirects manually to validate each destination
      const status = response.status;
      if (status >= 300 && status < 400) {
        // Check redirect count BEFORE incrementing (fix off-by-one)
        if (redirectCount >= maxRedirects) {
          throw new Error(`Too many redirects (max ${maxRedirects})`);
        }
        redirectCount++;

        const location = response.headers.get('location');
        if (!location) {
          throw new Error(`Redirect response ${status} missing Location header`);
        }

        // Resolve relative URLs against the current URL
        const resolvedUrl = new URL(location, currentUrl).href;

        // Validate the redirect target against SSRF rules
        validateUrl(resolvedUrl, { allowHttp, allowedHosts });

        currentUrl = resolvedUrl;
        continue;
      }

      // Enforce response body size limit via Content-Length header (early check)
      const contentLength = response.headers.get('content-length');
      if (contentLength && parseInt(contentLength, 10) > maxResponseBytes) {
        throw new Error(
          `Response too large: ${contentLength} bytes exceeds limit of ${maxResponseBytes} bytes`
        );
      }

      return response;
    }
  } finally {
    clearTimeout(timeout);
  }
}

/** safeFetch variant that reads body with streaming size enforcement */
export async function safeFetchText(url: string, options: SafeFetchOptions = {}): Promise<string> {
  const maxResponseBytes = options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
  const response = await safeFetch(url, options);
  return readBodyWithLimit(response, maxResponseBytes);
}
