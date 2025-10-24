/**
 * Workflow orchestration for audio processing
 * Phase 2: Transcription, Task Extraction, Content Generation
 */

import type { MockWorkerContext } from './test-utils';
import type { StatusUpdate } from './durable-objects/task-status-do';
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
 * Publish a workflow status update to the Durable Object
 * This is a fire-and-forget operation - failures do not affect the workflow
 *
 * @param taskId - The task ID
 * @param update - The status update to publish
 * @param env - The worker environment with TASK_STATUS_DO binding
 *
 * Note: This function returns immediately without awaiting the fetch call.
 * Updates are published asynchronously in the background.
 */
function publishWorkflowUpdate(
  taskId: string,
  update: Omit<StatusUpdate, 'taskId'>,
  env: any
): void {
  const updatePayload = { ...update, taskId };
  console.log(`[StatusUpdate] Publishing update for task ${taskId}:`, JSON.stringify(updatePayload));

  // Fire-and-forget: don't await this call
  const doId = env.TASK_STATUS_DO?.idFromName?.(taskId);
  if (!doId || !env.TASK_STATUS_DO?.get) {
    // If TASK_STATUS_DO is not available (e.g., in tests), silently skip
    console.warn(`[StatusUpdate] TASK_STATUS_DO not available for task ${taskId}, skipping update`);
    return;
  }

  const doStub = env.TASK_STATUS_DO.get(doId);

  // Perform the fetch in the background without awaiting
  doStub
    .fetch(
      new Request('https://do/publish', {
        method: 'POST',
        body: JSON.stringify(updatePayload)
      })
    )
    .then(() => {
      console.log(`[StatusUpdate] ✓ Published ${update.stage} ${update.status} for task ${taskId}`);
    })
    .catch((err) => {
      // Log errors but don't throw - status updates are non-critical
      console.error(`[StatusUpdate] ✗ Failed to publish update for task ${taskId}:`, err);
    });
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
  const workflowStartTime = performance.now();
  console.log(`[Timing] Workflow started for task ${taskId}`);

  try {
    // Step 1: Get transcription (either provided or retrieve audio and transcribe)
    let transcription = input.transcription;
    if (!transcription) {
      const transcribeStartTime = performance.now();

      // Notify clients that transcription is starting (fire-and-forget)
      publishWorkflowUpdate(taskId, {
        stage: 'transcribe',
        status: 'started',
        timestamp: Date.now()
      }, context.env);

      try {
        const r2RetrieveStartTime = performance.now();
        const audioBuffer = await retrieveAudioFromR2(context, r2Key);
        const r2RetrieveDuration = performance.now() - r2RetrieveStartTime;
        console.log(`[Timing] R2 retrieval: ${r2RetrieveDuration.toFixed(2)}ms`);

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

        // Notify clients that transcription is complete (fire-and-forget)
        publishWorkflowUpdate(taskId, {
          stage: 'transcribe',
          status: 'completed',
          duration_ms: Math.round(transcribeDuration),
          timestamp: Date.now()
        }, context.env);
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

        // Notify clients that transcription failed (fire-and-forget)
        publishWorkflowUpdate(taskId, {
          stage: 'transcribe',
          status: 'failed',
          error_message: errorMessage,
          timestamp: Date.now()
        }, context.env);

        throw new Error(`Failed to transcribe audio: ${errorMessage}`);
      }
    }

    // Step 2: Extract tasks from transcription
    let processedTasks: ProcessedTask[] = input.extractedTasks || [];
    if (!input.extractedTasks) {
      const extractStartTime = performance.now();

      // Notify clients that extraction is starting (fire-and-forget)
      publishWorkflowUpdate(taskId, {
        stage: 'extract',
        status: 'started',
        timestamp: Date.now()
      }, context.env);

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

        // Notify clients that extraction is complete (fire-and-forget)
        publishWorkflowUpdate(taskId, {
          stage: 'extract',
          status: 'completed',
          duration_ms: Math.round(extractDuration),
          timestamp: Date.now()
        }, context.env);
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

        // Notify clients that extraction failed (fire-and-forget)
        publishWorkflowUpdate(taskId, {
          stage: 'extract',
          status: 'failed',
          error_message: errorMessage,
          timestamp: Date.now()
        }, context.env);

        throw new Error(`Failed to extract tasks: ${errorMessage}`);
      }
    }

    // Step 3: Generate content for tasks that require it
    const tasksWithContent: ProcessedTask[] = [];
    for (const task of processedTasks) {
      let taskWithContent: ProcessedTask = { ...task };

      if (task.generative_task_prompt) {
        const generateStartTime = performance.now();

        // Notify clients that generation is starting (fire-and-forget)
        publishWorkflowUpdate(taskId, {
          stage: 'generate',
          status: 'started',
          timestamp: Date.now()
        }, context.env);

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

          // Notify clients that generation is complete (fire-and-forget)
          publishWorkflowUpdate(taskId, {
            stage: 'generate',
            status: 'completed',
            duration_ms: Math.round(generateDuration),
            timestamp: Date.now()
          }, context.env);
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

          // Notify clients that generation failed (fire-and-forget)
          publishWorkflowUpdate(taskId, {
            stage: 'generate',
            status: 'failed',
            error_message: errorMessage,
            timestamp: Date.now()
          }, context.env);

          console.error(`Failed to generate content for task "${task.task}":`, error);
        }
      }

      tasksWithContent.push(taskWithContent);
    }

    // Step 4: Update D1 with results
    const processedTasksJson = JSON.stringify(tasksWithContent);
    const dbUpdateStartTime = performance.now();

    // Notify clients that database update is starting (fire-and-forget)
    publishWorkflowUpdate(taskId, {
      stage: 'db_update',
      status: 'started',
      timestamp: Date.now()
    }, context.env);

    try {
      await updateTaskResults(context.env.DB, taskId, transcription, processedTasksJson);

      const dbUpdateDuration = performance.now() - dbUpdateStartTime;
      console.log(`[Timing] DB update: ${dbUpdateDuration.toFixed(2)}ms`);
      await logPipelineEvent(context.env.ANALYTICS, {
        timestamp: Date.now(),
        taskId,
        userId,
        stage: 'db_update',
        duration_ms: dbUpdateDuration,
        status: 'completed',
      });

      // Notify clients that database update is complete (fire-and-forget)
      publishWorkflowUpdate(taskId, {
        stage: 'db_update',
        status: 'completed',
        duration_ms: Math.round(dbUpdateDuration),
        timestamp: Date.now()
      }, context.env);
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

      // Notify clients that database update failed (fire-and-forget)
      publishWorkflowUpdate(taskId, {
        stage: 'db_update',
        status: 'failed',
        error_message: errorMessage,
        timestamp: Date.now()
      }, context.env);

      throw dbError;
    }

    const workflowTotalTime = performance.now() - workflowStartTime;
    console.log(`[Timing] Workflow total: ${workflowTotalTime.toFixed(2)}ms`);

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
