/**
 * Text-to-Speech (TTS) Feature
 * 
 * Provides speech generation capabilities using AI SDK v6's `experimental_generateSpeech`.
 * Converts text to natural-sounding speech.
 * 
 * @module tools/audio
 */

import { experimental_generateSpeech as generateSpeech } from 'ai';
import type { LanguageModel } from 'ai';
import { z } from 'zod';

// Tool definition type (AI SDK v6 compatible)
type CoreTool = {
  description?: string;
  inputSchema: z.ZodSchema<any>;
  execute: (args: any, context?: any) => Promise<any> | any;
};

/**
 * Speech generation options
 */
export interface GenerateSpeechOptions {
  /**
   * The model to use for speech generation
   * Examples: 'tts-1', 'tts-1-hd'
   */
  model: LanguageModel;
  
  /**
   * Text to convert to speech
   */
  text: string;
  
  /**
   * Voice to use for speech
   * Examples: 'alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'
   */
  voice?: string;
  
  /**
   * Speed of speech (0.25 to 4.0, default: 1.0)
   */
  speed?: number;
  
  /**
   * Additional provider-specific options
   */
  providerOptions?: Record<string, any>;
}

/**
 * Speech generation result
 */
export interface GenerateSpeechResult {
  /**
   * Generated audio as Uint8Array
   */
  audio: Uint8Array;
  
  /**
   * Audio format (e.g., 'mp3', 'opus', 'aac', 'flac')
   */
  format?: string;
  
  /**
   * Duration in seconds (if available)
   */
  duration?: number;
  
  /**
   * Additional metadata from the provider
   */
  metadata?: Record<string, any>;
}

/**
 * Generate speech from text using AI
 * 
 * @example
 * ```typescript
 * import { generateSpeechAI } from '@tawk-agents-sdk/core';
 * import { openai } from '@ai-sdk/openai';
 * import { writeFile } from 'fs/promises';
 * 
 * const result = await generateSpeechAI({
 *   model: openai.speech('tts-1'),
 *   text: 'Hello, world!',
 *   voice: 'alloy'
 * });
 * 
 * await writeFile('output.mp3', result.audio);
 * ```
 */
export async function generateSpeechAI(
  options: GenerateSpeechOptions
): Promise<GenerateSpeechResult> {
  const { model, text, voice, speed, providerOptions } = options;
  
  const result = await generateSpeech({
    model: model as any, // AI SDK experimental_generateSpeech model type
    text,
    voice,
    speed,
    providerOptions,
  });
  
  // Extract audio data from result
  const audioData = (result as any).audio || new Uint8Array();
  
  return {
    audio: audioData,
    format: (result as any).format,
    duration: (result as any).duration,
    metadata: result,
  };
}

/**
 * Create a text-to-speech tool for use in agents
 * 
 * @param model - The TTS model to use
 * @param options - Tool configuration options
 * 
 * @example
 * ```typescript
 * import { Agent, createTextToSpeechTool } from '@tawk-agents-sdk/core';
 * import { openai } from '@ai-sdk/openai';
 * 
 * const agent = new Agent({
 *   name: 'speaker',
 *   instructions: 'You can convert text to speech',
 *   tools: {
 *     textToSpeech: createTextToSpeechTool(openai.speech('tts-1'))
 *   }
 * });
 * ```
 */
export function createTextToSpeechTool(
  model: LanguageModel,
  options: {
    /**
     * Default voice to use
     */
    defaultVoice?: string;
    
    /**
     * Available voices
     */
    availableVoices?: string[];
  } = {}
): CoreTool {
  const { 
    defaultVoice = 'alloy', 
    availableVoices = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'] 
  } = options;
  
  return {
    description: 'Convert text to speech. Generate natural-sounding audio from written text.',
    inputSchema: z.object({
      text: z.string().max(4096).describe('Text to convert to speech (max 4096 characters)'),
      voice: z.enum(availableVoices as [string, ...string[]]).optional()
        .describe(`Voice to use (${availableVoices.join(', ')}). Default: ${defaultVoice}`),
      speed: z.number().min(0.25).max(4.0).optional()
        .describe('Speed of speech (0.25 to 4.0, default: 1.0)'),
    }),
    execute: async ({ text, voice, speed }: { text: string; voice?: string; speed?: number }) => {
      const result = await generateSpeechAI({
        model,
        text,
        voice: voice || defaultVoice,
        speed,
      });
      
      // Convert Uint8Array to base64 for transport
      const base64Audio = Buffer.from(result.audio).toString('base64');
      
      return {
        success: true,
        audio: base64Audio,
        format: result.format || 'mp3',
        duration: result.duration,
        message: 'Speech generated successfully',
      };
    },
  };
}

