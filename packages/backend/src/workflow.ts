/**
 * Workflow orchestration for audio processing
 * Phase 2: Transcription, Task Extraction, Content Generation
 */

import type { MockWorkerContext } from './test-utils';
import { updateTaskResults, updateTaskError } from './db';
import { transcribeAudio } from './workflow/transcribe';
import { extractTasks, type ProcessedTask } from './workflow/extract';
import { generateTaskContent } from './workflow/generate';
import { logPipelineEvent } from './analytics';

// Re-export ProcessedTask for external use
export type { ProcessedTask };

/**
 * Discriminated union for workflow processing results
 * When status is 'completed', transcription and processedTasks are always defined
 * When status is 'failed', error is always defined
 */
export type ProcessingResult =
  | {
      status: 'completed';
      taskId: string;
      transcription: string;
      processedTasks: ProcessedTask[];
    }
  | {
      status: 'failed';
      taskId: string;
      error: string;
    };

export interface WorkflowInput {
  taskId: string;
  userId: string;
  r2Key: string;
  transcription?: string;
  extractedTasks?: ProcessedTask[];
  generatedContent?: string | null;
}

/**
 * Main workflow orchestration function
 * Coordinates the entire processing pipeline
 */
export async function processAudioWorkflow(
  input: WorkflowInput,
  context: MockWorkerContext
): Promise<ProcessingResult> {
  const { taskId, userId, r2Key } = input;

  try {
    // Step 1: Get transcription (either provided or retrieve audio and transcribe)
    let transcription = input.transcription;
    if (!transcription) {
      const transcribeStartTime = performance.now();
      try {
        const audioBuffer = await retrieveAudioFromR2(context, r2Key);
        transcription = await transcribeAudio(audioBuffer, context.env);

        const transcribeDuration = performance.now() - transcribeStartTime;
        await logPipelineEvent(context.env.ANALYTICS, {
          timestamp: Date.now(),
          taskId,
          userId,
          stage: 'transcribe',
          duration_ms: transcribeDuration,
          status: 'completed',
        });
      } catch (error) {
        const transcribeDuration = performance.now() - transcribeStartTime;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        try {
          await logPipelineEvent(context.env.ANALYTICS, {
            timestamp: Date.now(),
            taskId,
            userId,
            stage: 'transcribe',
            duration_ms: transcribeDuration,
            status: 'failed',
            metadata: { errorMessage },
          });
        } catch (analyticsError) {
          console.warn('[Analytics] Failed to log transcribe error:', analyticsError);
        }

        throw new Error(`Failed to transcribe audio: ${errorMessage}`);
      }
    }

    // Step 2: Extract tasks from transcription
    let processedTasks: ProcessedTask[] = input.extractedTasks || [];
    if (!input.extractedTasks) {
      const extractStartTime = performance.now();
      try {
        processedTasks = await extractTasks(transcription, context.env);

        const extractDuration = performance.now() - extractStartTime;
        await logPipelineEvent(context.env.ANALYTICS, {
          timestamp: Date.now(),
          taskId,
          userId,
          stage: 'extract',
          duration_ms: extractDuration,
          status: 'completed',
          metadata: { taskCount: processedTasks.length },
        });
      } catch (error) {
        const extractDuration = performance.now() - extractStartTime;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        try {
          await logPipelineEvent(context.env.ANALYTICS, {
            timestamp: Date.now(),
            taskId,
            userId,
            stage: 'extract',
            duration_ms: extractDuration,
            status: 'failed',
            metadata: { errorMessage },
          });
        } catch (analyticsError) {
          console.warn('[Analytics] Failed to log extract error:', analyticsError);
        }

        throw new Error(`Failed to extract tasks: ${errorMessage}`);
      }
    }

    // Step 3: Generate content for tasks that require it
    const tasksWithContent: ProcessedTask[] = [];
    for (const task of processedTasks) {
      let taskWithContent: ProcessedTask = { ...task };

      if (task.generative_task_prompt) {
        const generateStartTime = performance.now();
        try {
          let generatedContent = input.generatedContent;
          if (!generatedContent) {
            generatedContent = await generateTaskContent(task.generative_task_prompt, context.env);
          }
          if (generatedContent) {
            taskWithContent.generated_content = generatedContent;
          }

          const generateDuration = performance.now() - generateStartTime;
          await logPipelineEvent(context.env.ANALYTICS, {
            timestamp: Date.now(),
            taskId,
            userId,
            stage: 'generate',
            duration_ms: generateDuration,
            status: 'completed',
          });
        } catch (error) {
          // Continue processing other tasks even if one generation fails
          const generateDuration = performance.now() - generateStartTime;
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';

          try {
            await logPipelineEvent(context.env.ANALYTICS, {
              timestamp: Date.now(),
              taskId,
              userId,
              stage: 'generate',
              duration_ms: generateDuration,
              status: 'failed',
              metadata: { errorMessage },
            });
          } catch (analyticsError) {
            console.warn('[Analytics] Failed to log generate error:', analyticsError);
          }

          console.error(`Failed to generate content for task "${task.task}":`, error);
        }
      }

      tasksWithContent.push(taskWithContent);
    }

    // Step 4: Update D1 with results
    const processedTasksJson = JSON.stringify(tasksWithContent);
    const dbUpdateStartTime = performance.now();

    try {
      await updateTaskResults(context.env.DB, taskId, transcription, processedTasksJson);

      const dbUpdateDuration = performance.now() - dbUpdateStartTime;
      await logPipelineEvent(context.env.ANALYTICS, {
        timestamp: Date.now(),
        taskId,
        userId,
        stage: 'db_update',
        duration_ms: dbUpdateDuration,
        status: 'completed',
      });
    } catch (dbError) {
      const dbUpdateDuration = performance.now() - dbUpdateStartTime;
      const errorMessage = dbError instanceof Error ? dbError.message : 'Unknown error';

      try {
        await logPipelineEvent(context.env.ANALYTICS, {
          timestamp: Date.now(),
          taskId,
          userId,
          stage: 'db_update',
          duration_ms: dbUpdateDuration,
          status: 'failed',
          metadata: { errorMessage },
        });
      } catch (analyticsError) {
        console.warn('[Analytics] Failed to log db_update error:', analyticsError);
      }

      throw dbError;
    }

    return {
      status: 'completed',
      taskId,
      transcription,
      processedTasks: tasksWithContent,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

    // Update D1 with error status
    try {
      await updateTaskError(context.env.DB, taskId, errorMessage);
    } catch (updateError) {
      console.error('Failed to update task error status:', updateError);
    }

    return {
      status: 'failed',
      taskId,
      error: errorMessage,
    };
  }
}

/**
 * Step 1: Retrieve audio from R2
 */
async function retrieveAudioFromR2(
  context: MockWorkerContext,
  r2Key: string
): Promise<ArrayBuffer> {
  const r2Object = await context.env.R2_BUCKET.get(r2Key);

  if (!r2Object) {
    throw new Error('Audio file not found in R2');
  }

  return await r2Object.arrayBuffer();
}
