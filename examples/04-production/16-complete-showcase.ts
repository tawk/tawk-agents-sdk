/**
 * Tawk Agents SDK - COMPLETE SHOWCASE
 *
 * Production-ready example demonstrating all SDK features.
 *
 * Run: ts-node examples/complete-showcase.ts
 */

import 'dotenv/config';
import {
  Agent, run, runStream, tool,
  generateEmbeddingAI, generateEmbeddingsAI, cosineSimilarity,
  generateImageAI, generateSpeechAI,
  Usage, customGuardrail,
} from '../../src';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  console.log('🚀 Tawk Agents SDK - Complete Showcase\n');
  console.log('=' .repeat(80) + '\n');

  const usage = new Usage();

  // ============================================================================
  // STEP 1: Embeddings (RAG building blocks)
  // ============================================================================

  console.log('📚 STEP 1: Embeddings - Building Knowledge Base\n');

  const docs = [
    'The Eiffel Tower is in Paris, France. Built in 1889.',
    'Paris is the capital of France.',
    'The Louvre Museum is in Paris.',
  ];

  // Generate embeddings for documents
  const docEmbeddingsResult = await generateEmbeddingsAI({
    model: openai.embedding('text-embedding-3-small'),
    values: docs,
  });

  console.log(`✅ Generated embeddings for ${docs.length} documents\n`);

  // ============================================================================
  // STEP 2: Tools
  // ============================================================================

  console.log('🔧 STEP 2: Creating Tools\n');

  const weatherTool = tool({
    description: 'Get weather',
    inputSchema: z.object({ city: z.string() }),
    execute: async ({ city }) => ({ city, temp: 22, condition: 'Sunny' }),
  });

  const calcTool = tool({
    description: 'Calculate',
    inputSchema: z.object({ expression: z.string() }),
    execute: async ({ expression }) => {
      try {
        return { result: eval(expression) };
      } catch (e: any) {
        return { error: e.message };
      }
    },
  });

  // Create a simple retrieval tool using embeddings
  const retrievalTool = tool({
    description: 'Search knowledge base',
    inputSchema: z.object({ query: z.string() }),
    execute: async ({ query }) => {
      const queryEmbed = await generateEmbeddingAI({
        model: openai.embedding('text-embedding-3-small'),
        value: query,
      });

      // Find most similar documents
      const similarities = docEmbeddingsResult.embeddings.map((docEmbed, i) => ({
        doc: docs[i],
        score: cosineSimilarity(queryEmbed.embedding, docEmbed),
      }));

      similarities.sort((a, b) => b.score - a.score);
      return {
        results: similarities.slice(0, 3).map(r => r.doc),
      };
    },
  });

  console.log('✅ Tools created\n');

  // ============================================================================
  // STEP 3: Guardrails
  // ============================================================================

  console.log('🛡️ STEP 3: Guardrails\n');

  const piiGuardrail = customGuardrail({
    name: 'pii',
    type: 'input',
    validate: async (content) => {
      if (/\d{3}-\d{2}-\d{4}/.test(content)) {
        return { passed: false, message: 'PII detected: SSN pattern found' };
      }
      return { passed: true };
    },
  });

  console.log('✅ Guardrails configured\n');

  // ============================================================================
  // STEP 4: Agents
  // ============================================================================

  console.log('🤖 STEP 4: Creating Agents\n');

  const researchAgent = new Agent({
    name: 'ResearchAgent',
    model: openai('gpt-4o-mini'),
    instructions: 'Research assistant. Use retrieval tool.',
    tools: { search: retrievalTool },
    guardrails: [piiGuardrail],
  });

  const generalAgent = new Agent({
    name: 'GeneralAgent',
    model: openai('gpt-4o-mini'),
    instructions: 'General assistant.',
    tools: { weather: weatherTool, calc: calcTool },
    guardrails: [piiGuardrail],
  });

  console.log('✅ Agents created\n');

  // ============================================================================
  // STEP 5: Demonstrations
  // ============================================================================

  console.log('=' .repeat(80));
  console.log('🎬 DEMONSTRATIONS');
  console.log('=' .repeat(80) + '\n');

  // 1. Basic Agent
  console.log('📍 1. Agent with Tools\n');
  const r1 = await run(researchAgent, 'What is the Eiffel Tower?');
  console.log(`✅ ${r1.finalOutput.substring(0, 100)}...`);
  console.log(`📊 Tokens: ${r1.metadata.totalTokens}\n`);
  usage.add(new Usage({
    inputTokens: r1.metadata.promptTokens,
    outputTokens: r1.metadata.completionTokens,
    totalTokens: r1.metadata.totalTokens
  }));

  // 2. Streaming
  console.log('📍 2. Streaming\n');
  const stream = await runStream(generalAgent, 'Calculate 42 * 8');
  process.stdout.write('✅ ');
  for await (const chunk of stream.textStream) {
    process.stdout.write(chunk);
  }
  console.log('\n');
  const sr = await stream.completed;
  usage.add(new Usage({
    inputTokens: sr.metadata.promptTokens,
    outputTokens: sr.metadata.completionTokens,
    totalTokens: sr.metadata.totalTokens
  }));

  // 3. Multi-turn conversation (using message array instead of session)
  console.log('📍 3. Multi-turn Conversation\n');
  const turn1 = await run(researchAgent, 'Tell me about Paris');
  const turn2 = await run(researchAgent, [
    { role: 'user' as const, content: 'Tell me about Paris' },
    { role: 'assistant' as const, content: turn1.finalOutput },
    { role: 'user' as const, content: 'What else is there?' }
  ]);
  console.log(`✅ ${turn2.finalOutput.substring(0, 100)}...`);
  console.log(`📊 2 conversation turns completed\n`);
  usage.add(new Usage({
    inputTokens: turn2.metadata.promptTokens,
    outputTokens: turn2.metadata.completionTokens,
    totalTokens: turn2.metadata.totalTokens
  }));

  // 4. Structured Output (using Agent with instructions)
  console.log('📍 4. Structured Output\n');
  const structuredAgent = new Agent({
    name: 'Extractor',
    instructions: 'Extract structured data. Return JSON only.',
    model: openai('gpt-4o-mini'),
  });
  const structuredResult = await run(structuredAgent, 'Extract: Eiffel Tower, 330m, built 1889. Return JSON: {name, height, year}');
  console.log('✅', structuredResult.finalOutput, '\n');

  // 5. Embeddings
  console.log('📍 5. Embeddings\n');
  const e1 = await generateEmbeddingAI({ model: openai.embedding('text-embedding-3-small'), value: 'Paris' });
  const e2 = await generateEmbeddingAI({ model: openai.embedding('text-embedding-3-small'), value: 'Eiffel Tower' });
  const sim = cosineSimilarity(e1.embedding, e2.embedding);
  console.log(`✅ Similarity: ${sim.toFixed(4)}\n`);

  // 6. Image Generation
  console.log('📍 6. Image Generation\n');
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const imgModel = openai.image('dall-e-3') as any;
    const img = await generateImageAI({
      model: imgModel,
      prompt: 'Mountain landscape',
      size: '1024x1024',
    });
    const outDir = path.join(process.cwd(), 'output');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    const imgPath = path.join(outDir, 'generated.png');
    if (img.images && img.images.length > 0) {
      // Images are base64 strings
      const base64Data = img.images[0];
      fs.writeFileSync(imgPath, Buffer.from(base64Data, 'base64'));
    }
    console.log(`✅ Saved: ${imgPath}\n`);
  } catch (e: unknown) {
    const error = e instanceof Error ? e : new Error(String(e));
    console.log(`⚠️  Image generation error: ${error.message}\n`);
  }

  // 7. Vision (using Agent with image input)
  console.log('📍 7. Vision\n');
  const visionAgent = new Agent({
    name: 'Vision',
    model: openai('gpt-4o'),
    instructions: 'Describe images in detail',
  });
  const visionResult = await run(visionAgent, [
    { role: 'user', content: [
      { type: 'text', text: 'Describe this landmark' },
      { type: 'image', image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a8/Tour_Eiffel_Wikimedia_Commons.jpg/240px-Tour_Eiffel_Wikimedia_Commons.jpg' }
    ]}
  ]);
  console.log(`✅ ${visionResult.finalOutput.substring(0, 100)}...\n`);

  // 8. Audio (TTS)
  console.log('📍 8. Audio (TTS)\n');
  try {
    const outDir = path.join(process.cwd(), 'output');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const speechModel = openai.speech('tts-1') as any;
    const audio = await generateSpeechAI({
      model: speechModel,
      text: 'Welcome to Tawk Agents SDK!',
      voice: 'nova',
    });
    const audioPath = path.join(outDir, 'speech.mp3');
    if (audio.audio) {
      fs.writeFileSync(audioPath, Buffer.from(audio.audio));
    }
    console.log(`✅ Saved: ${audioPath}\n`);
  } catch (e: unknown) {
    const error = e instanceof Error ? e : new Error(String(e));
    console.log(`⚠️  Audio generation error: ${error.message}\n`);
  }

  // 9. Parallel Agent Execution
  console.log('📍 9. Parallel Execution\n');
  const [parallelResult1, parallelResult2] = await Promise.all([
    run(researchAgent, 'What is 10 + 20?'),
    run(generalAgent, 'What is 10 + 20?'),
  ]);
  console.log(`✅ Research: ${parallelResult1.finalOutput.substring(0, 60)}`);
  console.log(`✅ General:  ${parallelResult2.finalOutput.substring(0, 60)}\n`);

  // 10. Guardrails
  console.log('📍 10. Guardrails\n');
  try {
    await run(researchAgent, 'SSN 123-45-6789');
  } catch (e: any) {
    console.log(`✅ Blocked: ${e.message}\n`);
  }

  // ============================================================================
  // Summary
  // ============================================================================

  console.log('=' .repeat(80));
  console.log('📊 SUMMARY');
  console.log('=' .repeat(80) + '\n');
  console.log(`Tokens: ${usage.totalTokens} (${usage.inputTokens} input + ${usage.outputTokens} output)\n`);

  console.log('✅ ALL FEATURES DEMONSTRATED:\n');
  [
    '✅ Agents', '✅ Tools', '✅ Streaming', '✅ Multi-turn',
    '✅ Embeddings', '✅ Retrieval', '✅ Image Gen', '✅ Audio',
    '✅ Vision', '✅ Parallel', '✅ Guardrails', '✅ Usage Tracking',
  ].forEach(f => console.log(f));

  console.log('\n🎉 Showcase Complete! Ready for production! 🚀\n');
}

if (require.main === module) {
  main().catch(console.error);
}

export { main };
