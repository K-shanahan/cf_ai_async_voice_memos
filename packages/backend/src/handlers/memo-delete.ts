/**
 * DELETE /api/v1/memo/{taskId} - Delete memo and associated audio
 */

import type { WorkerContext } from '../index';
import { deleteTask } from '../db';
import { deleteAudioFromR2 } from '../r2';

/**
 * Handler for DELETE /api/v1/memo/{taskId}
 * Deletes a memo and its audio file
 *
 * Security:
 * - Verifies user owns the memo before deletion
 * - Deletes from R2 first, then database
 * - If R2 deletion fails, still attempts database deletion (avoids data orphaning)
 */
export async function handleDeleteMemo(
  request: Request,
  context: WorkerContext
): Promise<Response> {
  try {
    // Extract taskId from URL
    const url = new URL(request.url);
    const taskId = url.pathname.split('/').pop();

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

    // Validate taskId format (UUID)
    if (!isValidTaskId(taskId)) {
      return new Response(
        JSON.stringify({
          error: 'Bad Request',
          message: 'Invalid task ID format',
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Get authenticated user
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
    const { DB: db, R2_BUCKET: bucket } = context.env;
    if (!db) {
      return new Response(
        JSON.stringify({
          error: 'Internal Server Error',
          message: 'Database not configured',
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    if (!bucket) {
      return new Response(
        JSON.stringify({
          error: 'Internal Server Error',
          message: 'R2 bucket not configured',
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Delete task from database (verifies user owns it)
    const task = await deleteTask(db, taskId, userId);

    if (!task) {
      // Task not found or user doesn't own it
      return new Response(
        JSON.stringify({
          error: 'Not Found',
          message: 'Memo not found or you do not have permission to delete it',
        }),
        {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Delete audio from R2 if it exists
    if (task.r2Key) {
      try {
        await deleteAudioFromR2(bucket, task.r2Key);
      } catch (error) {
        // Log the error but don't fail the request
        // Database deletion already succeeded, so memo is gone
        console.error(`Failed to delete audio from R2 (key: ${task.r2Key}):`, error);
        // In production, might want to queue this for cleanup later
      }
    }

    // Return 204 No Content on success
    return new Response(null, {
      status: 204,
    });
  } catch (error) {
    console.error('Error in handleDeleteMemo:', error);

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

/**
 * Validate task ID format
 * Accepts UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
 */
function isValidTaskId(taskId: string): boolean {
  // UUID v4 format: 8-4-4-4-12 hexadecimal characters
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(taskId);
}
