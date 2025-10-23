/**
 * GET /api/v1/memo/audio/{taskId} - Retrieve audio file from R2
 */

import type { WorkerContext } from '../index';
import { getTask } from '../db';

/**
 * Map file extensions to MIME types
 */
function getMimeType(r2Key: string): string {
  const ext = r2Key.split('.').pop()?.toLowerCase() || 'webm';
  const mimeMap: Record<string, string> = {
    webm: 'audio/webm',
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    ogg: 'audio/ogg',
    flac: 'audio/flac',
  };
  return mimeMap[ext] || 'audio/webm';
}

export async function handleGetAudio(
  request: Request,
  context: WorkerContext
): Promise<Response> {
  try {
    // Extract taskId from URL
    const url = new URL(request.url);
    const taskId = url.pathname.split('/').pop() || '';

    if (!taskId) {
      return new Response(
        JSON.stringify({
          error: 'Bad Request',
          message: 'Task ID is required',
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Verify user is authenticated
    const userId = context.data.userId;
    if (!userId) {
      return new Response(
        JSON.stringify({
          error: 'Unauthorized',
          message: 'User ID not found. Please authenticate.',
        }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Get database and R2 bucket
    const { DB: db, R2_BUCKET: r2Bucket } = context.env;
    if (!db || !r2Bucket) {
      return new Response(
        JSON.stringify({
          error: 'Internal Server Error',
          message: 'Database or storage not configured',
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Fetch task from database by taskId, filtered by userId (filter-in-select pattern)
    const task = await getTask(db, taskId, userId);

    // Task not found (either doesn't exist or belongs to different user)
    if (!task) {
      return new Response(
        JSON.stringify({
          error: 'Not Found',
          message: 'Audio file not found',
        }),
        {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Retrieve audio file from R2
    const r2Key = task.r2Key;
    if (!r2Key) {
      return new Response(
        JSON.stringify({
          error: 'Not Found',
          message: 'Audio file path not found in task record',
        }),
        {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    const r2Object = await r2Bucket.get(r2Key);

    // File not found in R2
    if (!r2Object) {
      return new Response(
        JSON.stringify({
          error: 'Not Found',
          message: 'Audio file not found in storage',
        }),
        {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Get audio data
    const audioBuffer = await r2Object.arrayBuffer();

    // Determine MIME type from file extension
    const mimeType = getMimeType(r2Key);

    // Build response headers
    const headers: Record<string, string> = {
      'Content-Type': mimeType,
      'Cache-Control': 'public, max-age=31536000, immutable',
    };

    // Set Content-Length if available
    if (r2Object.size !== undefined) {
      headers['Content-Length'] = r2Object.size.toString();
    }

    return new Response(audioBuffer, {
      status: 200,
      headers,
    });
  } catch (error) {
    console.error('Error in handleGetAudio:', error);

    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';

    return new Response(
      JSON.stringify({
        error: 'Internal Server Error',
        message: errorMessage,
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}
