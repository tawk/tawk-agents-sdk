/**
 * Video Generation Feature
 *
 * Provides video generation capabilities using AI SDK v6's `experimental_generateVideo`.
 *
 * @module tools/video
 */

import { experimental_generateVideo } from 'ai';
import { z } from 'zod';

/** Video model — a string model ID or a provider video model object */
type VideoModel = Parameters<typeof experimental_generateVideo>[0]['model'];

type CoreTool = {
  description?: string;
  inputSchema: z.ZodSchema<any>;
  execute: (args: any, context?: any) => Promise<any> | any;
};

/**
 * Video generation options
 */
export interface GenerateVideoOptions {
  /** The video model to use */
  model: VideoModel;
  /** Text prompt describing the video to generate */
  prompt: string;
  /** Number of videos to generate (default: 1) */
  n?: number;
  /** Aspect ratio (e.g. '16:9', '9:16', '1:1') */
  aspectRatio?: `${number}:${number}`;
  /** Resolution (e.g. '1920x1080') */
  resolution?: `${number}x${number}`;
  /** Duration in seconds */
  duration?: number;
  /** Frames per second */
  fps?: number;
  /** Seed for reproducible generation */
  seed?: number;
  /** Additional provider-specific options */
  providerOptions?: Record<string, any>;
}

/**
 * Video generation result
 */
export interface GenerateVideoResult {
  /** Generated video(s) as base64 strings */
  videos: string[];
  /** Additional metadata from the provider */
  metadata?: Record<string, any>;
}

/**
 * Generate a video using AI
 *
 * @example
 * ```typescript
 * import { generateVideoAI } from '@tawk-agents-sdk/core';
 *
 * const result = await generateVideoAI({
 *   model: 'luma/ray-2',
 *   prompt: 'A cat playing piano',
 *   aspectRatio: '16:9',
 * });
 *
 * console.log(result.videos[0]); // base64 video data
 * ```
 */
export async function generateVideoAI(
  options: GenerateVideoOptions
): Promise<GenerateVideoResult> {
  const {
    model,
    prompt,
    n = 1,
    aspectRatio,
    resolution,
    duration,
    fps,
    seed,
    providerOptions,
  } = options;

  const result = await experimental_generateVideo({
    model,
    prompt,
    n,
    aspectRatio,
    resolution,
    duration,
    fps,
    seed,
    providerOptions,
  });

  const videoArray = result.videos || (result.video ? [result.video] : []);

  return {
    videos: videoArray.map((vid: any) => {
      if (vid.base64) return vid.base64;
      if (vid.uint8Array) {
        if (typeof Buffer !== 'undefined') {
          return Buffer.from(vid.uint8Array).toString('base64');
        }
        return '';
      }
      return '';
    }),
    metadata: result,
  };
}

/**
 * Create a video generation tool for use in agents
 *
 * @param model - The video model to use
 * @param options - Tool configuration options
 *
 * @example
 * ```typescript
 * import { Agent, createVideoGenerationTool } from '@tawk-agents-sdk/core';
 *
 * const agent = new Agent({
 *   name: 'video-creator',
 *   instructions: 'You can generate videos based on user descriptions',
 *   tools: {
 *     generateVideo: createVideoGenerationTool('luma/ray-2')
 *   }
 * });
 * ```
 */
export function createVideoGenerationTool(
  model: VideoModel,
  options: {
    /** Default aspect ratio */
    defaultAspectRatio?: `${number}:${number}`;
    /** Default duration in seconds */
    defaultDuration?: number;
    /** Maximum number of videos per request */
    maxVideos?: number;
  } = {}
): CoreTool {
  const { defaultAspectRatio = '16:9', defaultDuration = 5, maxVideos = 2 } = options;

  return {
    description: 'Generate a video based on a text description.',
    inputSchema: z.object({
      prompt: z.string().describe('Detailed description of the video to generate'),
      aspectRatio: z.string().optional().describe(`Aspect ratio (default: ${defaultAspectRatio})`),
      duration: z.number().optional().describe(`Duration in seconds (default: ${defaultDuration})`),
      n: z.number().min(1).max(maxVideos).optional().describe(`Number of videos (1-${maxVideos}, default: 1)`),
    }),
    execute: async ({
      prompt,
      aspectRatio,
      duration,
      n,
    }: {
      prompt: string;
      aspectRatio?: string;
      duration?: number;
      n?: number;
    }) => {
      const result = await generateVideoAI({
        model,
        prompt,
        aspectRatio: (aspectRatio || defaultAspectRatio) as `${number}:${number}`,
        duration: duration || defaultDuration,
        n: n || 1,
      });

      return {
        success: true,
        videos: result.videos,
        count: result.videos.length,
        message: `Generated ${result.videos.length} video(s) successfully`,
      };
    },
  };
}
