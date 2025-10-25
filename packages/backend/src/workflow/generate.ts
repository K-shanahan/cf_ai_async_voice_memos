/**
 * Step 3: Generate content for tasks using Cloudflare Workers AI (Llama 3)
 */

import type { Ai } from '@cloudflare/workers-types';

interface AIEnv {
  AI?: Ai;
}

/**
 * Generate content for a task using Llama 3
 */
export async function generateTaskContent(
  prompt: string,
  env: AIEnv
): Promise<string> {
  // Validate input
  if (!prompt || prompt.trim().length === 0) {
    throw new Error('Prompt is empty');
  }

  // Validate AI is available
  if (!env.AI) {
    throw new Error('Cloudflare Workers AI not available. Please configure AI binding in wrangler.toml');
  }

  try {
    console.log(`Generating content with prompt: "${prompt}"`);
    const totalStartTime = performance.now();

    // Call Llama 3 model via Workers AI
    const aiCallStartTime = performance.now();
    const response = await env.AI.run('@cf/meta/llama-3-8b-instruct', {
      prompt: `You are a helpful assistant that generates content based on user requests.

User request: ${prompt}

Generate relevant, useful, and professional content in **Markdown format** to help the user with 
  their request.
  Use proper markdown syntax for formatting (headers, lists, emphasis, code blocks, etc.).`,
      max_tokens: 512,
    }) as { response: string };
    const aiCallTime = performance.now() - aiCallStartTime;
    console.log(`[Timing] AI.run() (inference + network): ${aiCallTime.toFixed(2)}ms`);

    if (!response || !response.response) {
      throw new Error('Llama 3 returned empty response');
    }

    const generatedContent = response.response.trim();

    if (!generatedContent) {
      throw new Error('Generated content is empty');
    }

    const totalTime = performance.now() - totalStartTime;
    console.log(`[Timing] Content generation total: ${totalTime.toFixed(2)}ms, content length: ${generatedContent.length}`);
    return generatedContent;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Content generation failed: ${message}`);
  }
}
