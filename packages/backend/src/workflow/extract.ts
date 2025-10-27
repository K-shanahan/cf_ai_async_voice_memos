/**
 * Step 2: Extract tasks from transcription using Cloudflare Workers AI (Llama 3)
 */

import type { Ai } from '@cloudflare/workers-types';
import { getTaskExtractionSystemPrompt } from './prompts';

export interface ProcessedTask {
  task: string;
  due: string | null;
  generative_task_prompt: string | null;
  generated_content?: string;
}

interface AIEnv {
  AI?: Ai;
}

/**
 * Extract tasks from transcription using Llama 3
 */
export async function extractTasks(
  transcription: string,
  env: AIEnv
): Promise<ProcessedTask[]> {
  // Validate input
  if (!transcription || transcription.trim().length === 0) {
    throw new Error('Transcription is empty');
  }

  // Validate AI is available
  if (!env.AI) {
    throw new Error('Cloudflare Workers AI not available. Please configure AI binding in wrangler.toml');
  }

  try {
    console.log(`Extracting tasks from transcription (length: ${transcription.length})`);
    const totalStartTime = performance.now();

    // Call Llama 3 model via Workers AI
    const aiCallStartTime = performance.now();
    const response = await env.AI.run('@cf/meta/llama-3-8b-instruct', {
      prompt: `${getTaskExtractionSystemPrompt()}

User text to extract tasks from:
"${transcription}"

Respond with only valid JSON.`,
      max_tokens: 2048,
    }) as { response: string };
    const aiCallTime = performance.now() - aiCallStartTime;
    console.log(`[Timing] AI.run() (inference + network): ${aiCallTime.toFixed(2)}ms`);

    if (!response || !response.response) {
      throw new Error('Llama 3 returned empty response');
    }

    console.log(`Raw Llama response: ${response.response}`);

    // Parse the JSON response
    const parseStartTime = performance.now();
    let tasksData: { tasks: ProcessedTask[] };
    try {
      // Extract JSON from response (Llama might include extra text)
      const jsonMatch = response.response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in Llama response');
      }

      tasksData = JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      throw new Error(`Failed to parse Llama response as JSON: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`);
    }
    const parseTime = performance.now() - parseStartTime;
    console.log(`[Timing] JSON parsing & validation: ${parseTime.toFixed(2)}ms`);

    // Validate response structure
    if (!tasksData.tasks || !Array.isArray(tasksData.tasks)) {
      throw new Error('Response does not contain "tasks" array');
    }

    if (tasksData.tasks.length === 0) {
      throw new Error('No tasks extracted from transcription');
    }

    // Validate each task has required fields
    for (const task of tasksData.tasks) {
      if (!task.task || typeof task.task !== 'string') {
        throw new Error('Task missing or invalid "task" field');
      }
      if (task.due !== null && typeof task.due !== 'string') {
        throw new Error('Task "due" field must be ISO 8601 string or null');
      }
      if (task.generative_task_prompt !== null && typeof task.generative_task_prompt !== 'string') {
        throw new Error('Task "generative_task_prompt" field must be string or null');
      }
    }

    const totalTime = performance.now() - totalStartTime;
    console.log(`[Timing] Extraction total: ${totalTime.toFixed(2)}ms, extracted ${tasksData.tasks.length} tasks`);
    return tasksData.tasks;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Task extraction failed: ${message}`);
  }
}
