import type { MockWorkerContext } from '../test-utils';

/**
 * Step 4: Generate content for tasks using Llama 3
 */
export async function generateTaskContent(
  prompt: string,
  context: MockWorkerContext
): Promise<string> {
  if (!prompt || prompt.trim().length === 0) {
    throw new Error('Prompt is empty');
  }

  // In a real implementation, this would call Workers AI Llama 3 model
  // For testing, we return mock generated content

  // Mock implementation - generate simple structured content
  return '1. Introduction\n2. Key Objectives\n3. Timeline\n4. Budget\n5. Next Steps';
}
