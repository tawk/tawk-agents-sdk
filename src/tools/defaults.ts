/**
 * Default Tools Convenience Function
 *
 * Bundles all built-in AI tool creators into a single function call.
 *
 * @module tools/defaults
 */

import type {
  ImageModel,
  SpeechModel,
  TranscriptionModel,
  EmbeddingModel,
  RerankingModel,
} from 'ai';
import { experimental_generateVideo } from 'ai';

/** Video model type extracted from AI SDK */
type VideoModel = Parameters<typeof experimental_generateVideo>[0]['model'];
import type { CoreTool } from '../core/agent/types';
import { createImageGenerationTool } from './image';
import { createVideoGenerationTool } from './video';
import { createTextToSpeechTool } from './audio';
import { createTranscriptionTool } from './audio';
import { createEmbeddingTool } from './embeddings';
import { createRerankTool } from './rerank';

/**
 * Create a record of all available AI tools based on the models provided.
 * Only tools whose models are specified will be included.
 *
 * @param models - Model instances for each tool category
 * @returns A record of CoreTool instances ready to pass to an Agent's `tools` config
 *
 * @example
 * ```typescript
 * import { Agent, createDefaultTools } from 'tawk-agents-sdk';
 * import { openai } from '@ai-sdk/openai';
 *
 * const agent = new Agent({
 *   name: 'multimodal-assistant',
 *   instructions: 'You can generate images, speech, and more.',
 *   tools: createDefaultTools({
 *     imageModel: openai.image('dall-e-3'),
 *     speechModel: openai.speech('tts-1'),
 *     transcriptionModel: openai.transcription('whisper-1'),
 *     embeddingModel: openai.embedding('text-embedding-3-small'),
 *   }),
 * });
 * ```
 */
export function createDefaultTools(models: {
  imageModel?: ImageModel;
  speechModel?: SpeechModel;
  transcriptionModel?: TranscriptionModel;
  embeddingModel?: EmbeddingModel;
  videoModel?: VideoModel;
  rerankingModel?: RerankingModel;
}): Record<string, CoreTool> {
  const tools: Record<string, CoreTool> = {};

  if (models.imageModel) {
    tools.generate_image = createImageGenerationTool(models.imageModel as any);
  }

  if (models.videoModel) {
    tools.generate_video = createVideoGenerationTool(models.videoModel);
  }

  if (models.speechModel) {
    tools.text_to_speech = createTextToSpeechTool(models.speechModel as any);
  }

  if (models.transcriptionModel) {
    tools.transcribe_audio = createTranscriptionTool(models.transcriptionModel as any);
  }

  if (models.embeddingModel) {
    tools.generate_embedding = createEmbeddingTool(models.embeddingModel as any);
  }

  if (models.rerankingModel) {
    tools.rerank = createRerankTool(models.rerankingModel as any);
  }

  return tools;
}
