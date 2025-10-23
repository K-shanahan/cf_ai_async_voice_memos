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

export interface QueueMessage {
  bucket: string;
  key: string;
  eventName: string;
  eventTimestamp: string;
  taskId: string;
  userId: string;
}

/**
 * Queue consumer handler
 * Called by Cloudflare when messages arrive in the queue
 */
export async function handleQueueConsumer(
  batch: MessageBatch<QueueMessage>,
  env: Env
): Promise<void> {
  for (const message of batch.messages) {
    try {
      const queueMessage = message.body as QueueMessage;

      console.log(`Processing queue message for task: ${queueMessage.taskId}`);

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

      console.log(`✅ Successfully processed task: ${queueMessage.taskId}`);
    } catch (error) {
      const taskId = (message.body as QueueMessage).taskId;
      console.error(`❌ Failed to process task ${taskId}:`, error);

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
