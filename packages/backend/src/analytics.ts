/**
 * Analytics Engine utilities for profiling the pipeline
 */

export interface PipelineEvent {
  timestamp: number;
  taskId: string;
  userId: string;
  stage:
    | 'upload'
    | 'queue'
    | 'transcribe'
    | 'extract'
    | 'generate'
    | 'db_update';
  duration_ms: number;
  status: 'completed' | 'failed';
  metadata?: {
    audioSize?: number;
    taskCount?: number;
    errorMessage?: string;
  };
}

/**
 * Log a pipeline event to Cloudflare Analytics Engine
 * @param analytics Analytics Engine binding
 * @param event Pipeline event to log
 */
export async function logPipelineEvent(
  analytics: AnalyticsEngineDataset,
  event: PipelineEvent
): Promise<void> {
  try {
    analytics.writeDataPoint({
      indexes: [event.stage, event.status],
      blobs: [event.taskId, event.userId, JSON.stringify(event.metadata || {})],
      doubles: [event.duration_ms, event.timestamp],
    });
  } catch (error) {
    // Fail silently - analytics should not break the pipeline
    console.warn('[Analytics] Failed to log event:', error);
  }
}
