/**
 * Model provider resolution for tawk-cli
 *
 * Parses --model flags like "openai:gpt-4o-mini" and dynamically
 * imports the corresponding @ai-sdk provider.
 */

import type { LanguageModel } from 'ai';

interface ProviderSpec {
  provider: string;
  modelId: string;
}

const PROVIDER_INFERENCES: [RegExp, string][] = [
  [/^gpt-/, 'openai'],
  [/^o[1-9]/, 'openai'],
  [/^claude-/, 'anthropic'],
  [/^gemini-/, 'google'],
  [/^llama-/, 'groq'],
  [/^mixtral-/, 'groq'],
  [/^deepseek-/, 'groq'],
];

const ENV_KEYS: Record<string, string> = {
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  google: 'GOOGLE_GENERATIVE_AI_API_KEY',
  groq: 'GROQ_API_KEY',
};

/**
 * Parse a model string like "openai:gpt-4o-mini" or "gpt-4o-mini"
 */
export function parseModelString(input: string): ProviderSpec {
  const colonIndex = input.indexOf(':');

  if (colonIndex > 0) {
    return {
      provider: input.slice(0, colonIndex),
      modelId: input.slice(colonIndex + 1),
    };
  }

  // Auto-infer provider from model name
  for (const [pattern, provider] of PROVIDER_INFERENCES) {
    if (pattern.test(input)) {
      return { provider, modelId: input };
    }
  }

  // Default to openai
  return { provider: 'openai', modelId: input };
}

/**
 * Dynamically import a provider and create a LanguageModel
 */
export async function resolveModel(modelString: string): Promise<{ model: LanguageModel; displayId: string }> {
  const { provider, modelId } = parseModelString(modelString);
  const displayId = `${provider}:${modelId}`;

  // Check API key
  const envKey = ENV_KEYS[provider];
  if (envKey && !process.env[envKey]) {
    throw new Error(
      `Missing ${envKey} environment variable for provider "${provider}".\n` +
      `Set it in your .env file or export it: export ${envKey}=your-key`
    );
  }

  let model: LanguageModel;

  switch (provider) {
    case 'openai': {
      const { openai } = await import('@ai-sdk/openai');
      model = openai(modelId);
      break;
    }
    case 'anthropic': {
      const { anthropic } = await import('@ai-sdk/anthropic');
      model = anthropic(modelId);
      break;
    }
    case 'google': {
      const { google } = await import('@ai-sdk/google');
      model = google(modelId);
      break;
    }
    case 'groq': {
      const { groq } = await import('@ai-sdk/groq');
      model = groq(modelId);
      break;
    }
    default:
      throw new Error(
        `Unknown provider: "${provider}". Supported: openai, anthropic, google, groq`
      );
  }

  return { model, displayId };
}
