/**
 * Audio Transcription Feature
 * 
 * Provides audio transcription capabilities using AI SDK v6's `experimental_transcribe`.
 * Converts speech to text using models like Whisper.
 * 
 * @module tools/audio
 */

import { experimental_transcribe as transcribe } from 'ai';
import type { LanguageModel } from 'ai';
import { z } from 'zod';
import { safeFetch } from '../../helpers/safe-fetch';

// Tool definition type (AI SDK v6 compatible)
type CoreTool = {
  description?: string;
  inputSchema: z.ZodSchema<any>;
  execute: (args: any, context?: any) => Promise<any> | any;
};

/**
 * Audio transcription options
 */
export interface TranscribeAudioOptions {
  /**
   * The model to use for transcription
   * Examples: 'whisper-1'
   */
  model: LanguageModel;
  
  /**
   * Audio file data (as Uint8Array, File, or URL)
   */
  audio: Uint8Array | File | string;
  
  /**
   * Language of the audio (ISO-639-1 format, e.g., 'en', 'es')
   * Helps improve accuracy
   */
  language?: string;
  
  /**
   * Additional provider-specific options
   */
  providerOptions?: Record<string, any>;
}

/**
 * Audio transcription result
 */
export interface TranscribeAudioResult {
  /**
   * The transcribed text
   */
  text: string;
  
  /**
   * Detected language (if available)
   */
  language?: string;
  
  /**
   * Duration of the audio in seconds (if available)
   */
  duration?: number;
  
  /**
   * Additional metadata from the provider
   */
  metadata?: Record<string, any>;
}

/**
 * Transcribe audio to text using AI
 * 
 * @example
 * ```typescript
 * import { transcribeAudioAI } from '@tawk-agents-sdk/core';
 * import { openai } from '@ai-sdk/openai';
 * import { readFile } from 'fs/promises';
 * 
 * const audioData = await readFile('audio.mp3');
 * 
 * const result = await transcribeAudioAI({
 *   model: openai.transcription('whisper-1'),
 *   audio: audioData,
 *   language: 'en'
 * });
 * 
 * console.log(result.text);
 * ```
 */
export async function transcribeAudioAI(
  options: TranscribeAudioOptions
): Promise<TranscribeAudioResult> {
  const { model, audio, language, providerOptions } = options;
  
  const result = await transcribe({
    model: model as any, // AI SDK experimental_transcribe model type
    audio: audio as any, // AI SDK accepts various audio formats
    providerOptions: {
      ...providerOptions,
      language, // Include language in provider options
    } as any,
  });
  
  return {
    text: result.text,
    language: result.language,
    duration: (result as any).duration, // Optional field
    metadata: result,
  };
}

/**
 * Create an audio transcription tool for use in agents
 * 
 * @param model - The transcription model to use
 * 
 * @example
 * ```typescript
 * import { Agent, createTranscriptionTool } from '@tawk-agents-sdk/core';
 * import { openai } from '@ai-sdk/openai';
 * 
 * const agent = new Agent({
 *   name: 'transcriber',
 *   instructions: 'You can transcribe audio files to text',
 *   tools: {
 *     transcribe: createTranscriptionTool(openai.transcription('whisper-1'))
 *   }
 * });
 * ```
 */
export function createTranscriptionTool(
  model: LanguageModel
): CoreTool {
  return {
    description: 'Transcribe audio to text. Converts speech from audio files into written text.',
    inputSchema: z.object({
      audioUrl: z.string().url().describe('URL to the audio file to transcribe'),
      language: z.string().optional().describe('Language code (e.g., "en", "es") to improve accuracy'),
    }),
    execute: async ({ audioUrl, language }: { audioUrl: string; language?: string }) => {
      // Fetch audio from URL (SSRF-safe)
      const response = await safeFetch(audioUrl, { timeoutMs: 60000 });
      const audioBuffer = await response.arrayBuffer();
      const audioData = new Uint8Array(audioBuffer);
      
      const result = await transcribeAudioAI({
        model,
        audio: audioData,
        language,
      });
      
      return {
        success: true,
        text: result.text,
        language: result.language,
        duration: result.duration,
      };
    },
  };
}

