/**
 * Image Generation Feature
 * 
 * Provides image generation capabilities using AI SDK v6's `generateImage`.
 * Supports multiple providers (OpenAI DALL-E, Stability AI, etc.)
 * 
 * @module tools/image
 */

import { generateImage } from 'ai';
import type { LanguageModel } from 'ai';
import { z } from 'zod';

// Tool definition type (AI SDK v6 compatible)
type CoreTool = {
  description?: string;
  inputSchema: z.ZodSchema<any>;
  execute: (args: any, context?: any) => Promise<any> | any;
};

/**
 * Image generation options
 */
export interface GenerateImageOptions {
  /**
   * The model to use for image generation
   * Examples: 'dall-e-3', 'dall-e-2', 'stable-diffusion-xl'
   */
  model: LanguageModel;
  
  /**
   * Text prompt describing the image to generate
   */
  prompt: string;
  
  /**
   * Number of images to generate (default: 1)
   */
  n?: number;
  
  /**
   * Size of the generated image
   * Examples: '1024x1024', '1792x1024', '1024x1792'
   */
  size?: string;
  
  /**
   * Additional provider-specific options
   */
  providerOptions?: Record<string, any>;
}

/**
 * Image generation result
 */
export interface GenerateImageResult {
  /**
   * Generated image(s) as base64 strings
   */
  images: string[];
  
  /**
   * Revised prompt (if provider supports it)
   */
  revisedPrompt?: string;
  
  /**
   * Additional metadata from the provider
   */
  metadata?: Record<string, any>;
}

/**
 * Generate an image using AI
 * 
 * @example
 * ```typescript
 * import { generateImageAI } from '@tawk-agents-sdk/core';
 * import { openai } from '@ai-sdk/openai';
 * 
 * const result = await generateImageAI({
 *   model: openai.image('dall-e-3'),
 *   prompt: 'A serene landscape with mountains',
 *   size: '1024x1024'
 * });
 * 
 * console.log(result.images[0]); // base64 image data
 * ```
 */
export async function generateImageAI(
  options: GenerateImageOptions
): Promise<GenerateImageResult> {
  const { model, prompt, n = 1, size, providerOptions } = options;
  
  const result = await generateImage({
    model: model as any, // AI SDK experimental_generateImage model type
    prompt,
    n,
    size: size as any, // AI SDK accepts string size
    providerOptions,
  });
  
  // Handle both singular (n=1) and plural (n>1) responses
  const imageArray = result.images || (result.image ? [result.image] : []);
  
  return {
    images: imageArray.map((img: any) => {
      if (img.base64) return img.base64;
      if (img.uint8Array) {
        // Convert Uint8Array to base64
        if (typeof Buffer !== 'undefined') {
          return Buffer.from(img.uint8Array).toString('base64');
        }
        return '';
      }
      return '';
    }),
    metadata: result,
  };
}

/**
 * Create an image generation tool for use in agents
 * 
 * @param model - The image model to use
 * @param options - Tool configuration options
 * 
 * @example
 * ```typescript
 * import { Agent, createImageGenerationTool } from '@tawk-agents-sdk/core';
 * import { openai } from '@ai-sdk/openai';
 * 
 * const agent = new Agent({
 *   name: 'artist',
 *   instructions: 'You can generate images based on user descriptions',
 *   tools: {
 *     generateImage: createImageGenerationTool(openai.image('dall-e-3'))
 *   }
 * });
 * ```
 */
export function createImageGenerationTool(
  model: LanguageModel,
  options: {
    /**
     * Default size for generated images
     */
    defaultSize?: string;
    
    /**
     * Maximum number of images to generate at once
     */
    maxImages?: number;
  } = {}
): CoreTool {
  const { defaultSize = '1024x1024', maxImages = 4 } = options;
  
  return {
    description: 'Generate an image based on a text description. Use DALL-E to create visual content.',
    inputSchema: z.object({
      prompt: z.string().describe('Detailed description of the image to generate'),
      size: z.string().optional().describe(`Image size (default: ${defaultSize})`),
      n: z.number().min(1).max(maxImages).optional().describe(`Number of images (1-${maxImages}, default: 1)`),
    }),
    execute: async ({ prompt, size, n }: { prompt: string; size?: string; n?: number }) => {
      const result = await generateImageAI({
        model,
        prompt,
        size: size || defaultSize,
        n: n || 1,
      });
      
      return {
        success: true,
        images: result.images,
        count: result.images.length,
        message: `Generated ${result.images.length} image(s) successfully`,
      };
    },
  };
}

