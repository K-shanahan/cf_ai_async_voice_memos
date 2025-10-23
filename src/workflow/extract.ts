import type { MockWorkerContext } from '../test-utils';

export interface ProcessedTask {
  task: string;
  due: string | null;
  generative_task_prompt: string | null;
  generated_content?: string;
}

/**
 * Step 3: Extract tasks from transcription using Llama 3
 */
export async function extractTasks(
  transcription: string,
  context: MockWorkerContext
): Promise<ProcessedTask[]> {
  if (!transcription || transcription.trim().length === 0) {
    throw new Error('Transcription is empty');
  }

  // In a real implementation, this would call Workers AI Llama 3 model
  // with a system prompt that demands JSON output
  // For testing, we return mock tasks based on the transcription

  // Mock implementation - parse transcription for tasks
  const tasks: ProcessedTask[] = [];

  if (transcription.toLowerCase().includes('email')) {
    tasks.push({
      task: 'Email client about new proposal',
      due: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
      generative_task_prompt: null,
    });
  }

  if (transcription.toLowerCase().includes('draft')) {
    tasks.push({
      task: 'Draft outline for client proposal',
      due: null,
      generative_task_prompt: 'Draft an outline for a client proposal',
    });
  }

  if (tasks.length === 0) {
    // If no tasks extracted, throw error
    throw new Error('No tasks could be extracted from transcription');
  }

  return tasks;
}
