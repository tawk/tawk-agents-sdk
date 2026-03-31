/**
 * Example: Vision with Agents
 * 
 * This example demonstrates:
 * - Image analysis with vision models using agents
 * - Multimodal understanding with GPT-4o
 * 
 * Note: Vision capabilities are accessed through agents with image content in messages.
 */

import {
  Agent,
  run,
} from '../../src';
import { openai } from '@ai-sdk/openai';

// =====================================================
// 1. Basic Vision - Image Analysis
// =====================================================

async function basicVision() {
  console.log('=== Basic Vision - Image Analysis ===\n');
  
  const visionAgent = new Agent({
    name: 'VisionAnalyzer',
    model: openai('gpt-4o'),
    instructions: 'Analyze images and provide detailed descriptions',
  });
  
  // Note: Replace with actual image URL for real testing
  const imageUrl = 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/dd/Gfp-wisconsin-madison-the-nature-boardwalk.jpg/2560px-Gfp-wisconsin-madison-the-nature-boardwalk.jpg';
  
  const result = await run(visionAgent, [
    { 
      role: 'user', 
      content: [
        { type: 'text', text: 'What is in this image? Describe it in detail.' },
        { type: 'image', image: imageUrl }
      ]
    }
  ]);
  
  console.log('Image description:', result.finalOutput);
  console.log();
}

// =====================================================
// 2. Vision with Multiple Images
// =====================================================

async function visionMultiple() {
  console.log('=== Vision - Multiple Images ===\n');
  
  const visionAgent = new Agent({
    name: 'VisionComparer',
    model: openai('gpt-4o'),
    instructions: 'Compare images and identify differences',
  });
  
  const images = [
    'https://example.com/image1.jpg',
    'https://example.com/image2.jpg',
  ];
  
  const result = await run(visionAgent, [
    { 
      role: 'user', 
      content: [
        { type: 'text', text: 'Compare these two images. What are the differences?' },
        ...images.map(img => ({ type: 'image', image: img }))
      ]
    }
  ]);
  
  console.log('Comparison:', result.finalOutput);
  console.log();
}

// =====================================================
// 3. Vision with Structured Instructions
// =====================================================

async function visionStructured() {
  console.log('=== Vision - Structured Extraction ===\n');
  
  const extractorAgent = new Agent({
    name: 'DataExtractor',
    model: openai('gpt-4o'),
    instructions: 'Extract structured information from images. Return JSON format with specific fields.',
  });
  
  const receiptImageUrl = 'https://example.com/receipt.jpg';
  
  const result = await run(extractorAgent, [
    { 
      role: 'user', 
      content: [
        { type: 'text', text: 'Extract receipt information: store name, date, items with prices, and total. Return as JSON.' },
        { type: 'image', image: receiptImageUrl }
      ]
    }
  ]);
  
  console.log('Extracted data:', result.finalOutput);
  console.log();
}

// =====================================================
// Run All Examples
// =====================================================

async function main() {
  console.log('🚀 Vision Examples\n');
  console.log('='.repeat(50) + '\n');

  try {
    console.log('Note: Vision examples require actual image URLs\n');
    // Uncomment when you have real image URLs:
    // await basicVision();
    // await visionMultiple();
    // await visionStructured();
    
    console.log('✅ Vision examples ready (uncomment to test with real images)');
  } catch (error) {
    console.error('Error:', error);
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch(console.error);
}

export { main };
