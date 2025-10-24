/**
 * Queue Consumer for R2 Event Notifications
 *
 * This worker consumes messages from the voice-memo-events queue
 * and triggers the audio processing workflow for each message.
 *
 * Message format:
 * {
 *   bucket: string,
 *   key: string,
 *   eventName: string,
 *   eventTimestamp: string,
 *   taskId: string,
 *   userId: string
 * }
 */

import type { Env } from './index';
import { handleAudioProcessingWorkflow } from './workflow-handler';
import type { R2ObjectCreatedEvent } from './workflow-handler';
import { logPipelineEvent } from './analytics';
import type { StatusUpdate } from './durable-objects/task-status-do';

export interface QueueMessage {
  bucket: string;
  key: string;
  eventName: string;
  eventTimestamp: string;
  taskId: string;
  userId: string;
}

/**
 * Publish a workflow start notification to the Durable Object
 * This is a fire-and-forget operation - failures do not affect the queue processing
 *
 * @param taskId - The task ID
 * @param env - The worker environment with TASK_STATUS_DO binding
 */
function publishWorkflowStartUpdate(taskId: string, env: Env): void {
  // Fire-and-forget: don't await this call
  const doId = env.TASK_STATUS_DO?.idFromName?.(taskId);
  if (!doId || !env.TASK_STATUS_DO?.get) {
    // If TASK_STATUS_DO is not available, silently skip
    return;
  }

  const doStub = env.TASK_STATUS_DO.get(doId);

  // Perform the fetch in the background without awaiting
  doStub
    .fetch(
      new Request('https://do/publish', {
        method: 'POST',
        body: JSON.stringify({
          taskId,
          stage: 'workflow',
          status: 'started',
          timestamp: Date.now()
        } as StatusUpdate)
      })
    )
    .catch((err) => {
      // Log errors but don't throw - status updates are non-critical
      console.error(`[StatusUpdate] Failed to publish workflow start for task ${taskId}:`, err);
    });
}

/**
 * Queue consumer handler
 * Called by Cloudflare when messages arrive in the queue
 */
export async function handleQueueConsumer(
  batch: MessageBatch<QueueMessage>,
  env: Env
): Promise<void> {
  console.log(`[Timing] Queue batch received with ${batch.messages.length} message(s)`);

  for (const message of batch.messages) {
    const queueProcessStartTime = performance.now();
    try {
      const queueMessage = message.body as QueueMessage;
      const messageCreatedTime = new Date(queueMessage.eventTimestamp).getTime();
      const queueWaitTime = Date.now() - messageCreatedTime;
      console.log(`[Timing] Queue wait time (message created → batch received): ${queueWaitTime.toFixed(0)}ms`);

      console.log(`Processing queue message for task: ${queueMessage.taskId}`);

      // Notify clients that workflow is starting (fire-and-forget)
      publishWorkflowStartUpdate(queueMessage.taskId, env);

      // Convert queue message to R2 event format
      const r2Event: R2ObjectCreatedEvent = {
        bucket: queueMessage.bucket,
        key: queueMessage.key,
        eventName: queueMessage.eventName,
        eventTimestamp: queueMessage.eventTimestamp,
      };

      // Trigger the workflow
      await handleAudioProcessingWorkflow(r2Event, env);

      // Acknowledge the message (remove from queue)
      message.ack();

      const queueProcessDuration = performance.now() - queueProcessStartTime;
      await logPipelineEvent(env.ANALYTICS, {
        timestamp: Date.now(),
        taskId: queueMessage.taskId,
        userId: queueMessage.userId,
        stage: 'queue',
        duration_ms: queueProcessDuration,
        status: 'completed',
      });

      console.log(`✅ Successfully processed task: ${queueMessage.taskId}`);
    } catch (error) {
      const taskId = (message.body as QueueMessage).taskId;
      const userId = (message.body as QueueMessage).userId;
      console.error(`❌ Failed to process task ${taskId}:`, error);

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const queueProcessDuration = performance.now() - queueProcessStartTime;

      try {
        await logPipelineEvent(env.ANALYTICS, {
          timestamp: Date.now(),
          taskId,
          userId,
          stage: 'queue',
          duration_ms: queueProcessDuration,
          status: 'failed',
          metadata: {
            errorMessage,
          },
        });
      } catch (analyticsError) {
        console.warn('[Analytics] Failed to log queue error event:', analyticsError);
      }

      // Retry the message (Cloudflare will re-queue based on max_retries in wrangler.toml)
      message.retry();
    }
  }
}

/**
 * Export a queue consumer for Cloudflare
 * The name must match the queue name in wrangler.toml
 */
export default {
  async queue(batch: MessageBatch<QueueMessage>, env: Env): Promise<void> {
    await handleQueueConsumer(batch, env);
  },
} as ExportedHandler<Env, QueueMessage>;
