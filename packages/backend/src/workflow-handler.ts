/**
 * Cloudflare Workflow Handler for Audio Processing
 * Triggered by R2 Object Creation events
 * It orchestrates the transcription, task extraction, and content generation pipeline
 */

import type { Env } from './index';
import { processAudioWorkflow, type WorkflowInput } from './workflow';
import type { MockWorkerContext } from './test-utils';

/**
 * R2 Event payload when an object is created
 */
export interface R2ObjectCreatedEvent {
  bucket: string;
  key: string;
  eventTimestamp: string;
  eventName: string;
}

/**
 * Extract userId and taskId from R2 object key
 * Key format: uploads/{userId}/{taskId}.webm
 */
export function parseR2ObjectKey(key: string): { userId: string; taskId: string } | null {
  const match = key.match(/^uploads\/([^/]+)\/([a-f0-9-]+)\./);
  if (!match) {
    return null;
  }
  return {
    userId: match[1],
    taskId: match[2],
  };
}

/**
 * Handler function for the audio processing workflow
 * This function is called by Cloudflare Workflows when triggered by an R2 event
 */
export async function handleAudioProcessingWorkflow(
  r2Event: R2ObjectCreatedEvent,
  env: Env
): Promise<void> {
  const handlerStartTime = performance.now();
  try {
    // Extract userId and taskId from the R2 object key
    const parsed = parseR2ObjectKey(r2Event.key);
    if (!parsed) {
      throw new Error(
        `Invalid R2 object key format: ${r2Event.key}. Expected: uploads/{userId}/{taskId}.webm`
      );
    }

    const { userId, taskId } = parsed;
    const r2Key = r2Event.key;
    const eventTimestamp = new Date(r2Event.eventTimestamp).getTime();
    const timeSinceEvent = Date.now() - eventTimestamp;
    console.log(`[Timing] Time since R2 event: ${timeSinceEvent.toFixed(0)}ms`);

    console.log(`Workflow triggered for R2 object: ${r2Key}`);
    console.log(`Processing task ${taskId} for user ${userId}`);

    // Create the workflow input from R2 event data
    const workflowInput: WorkflowInput = {
      taskId,
      userId,
      r2Key,
    };

    // Create context for the workflow processing function
    const context: MockWorkerContext = {
      env: {
        DB: env.DB,
        R2_BUCKET: env.R2_BUCKET,
        AUDIO_PROCESSING_WORKFLOW: env.AUDIO_PROCESSING_WORKFLOW,
        AI: env.AI,
        VOICE_MEMO_QUEUE: env.VOICE_MEMO_QUEUE,
        ANALYTICS: env.ANALYTICS,
        TASK_STATUS_DO: env.TASK_STATUS_DO,
        ENVIRONMENT: env.ENVIRONMENT,
      },
      data: {
        userId,
      },
    };

    // Execute the audio processing pipeline
    const result = await processAudioWorkflow(workflowInput, context);

    console.log(`Workflow completed for task ${taskId}:`, result.status);
  } catch (error) {
    console.error(`Workflow failed processing R2 event:`, error);
    throw error;
  }
}

/**
 * Workflow class for Cloudflare Workflows integration
 * This is the entry point that Cloudflare Workflows will call when R2 event is triggered
 */
export class AudioProcessingWorkflow {
  constructor(public state: unknown, public env: Env, public ctx: unknown) {}

  async run(r2Event: R2ObjectCreatedEvent): Promise<void> {
    return handleAudioProcessingWorkflow(r2Event, this.env);
  }
}
