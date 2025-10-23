/**
 * GET /api/v1/memo/{taskId} - Retrieve task status and results
 */

import type { WorkerContext } from '../index';
import { getTask } from '../db';

export async function handleGetMemo(
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

    // Get database
    const { DB: db } = context.env;
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

    // Fetch task from database with security check (both taskId and userId)
    const task = await getTask(db, taskId, userId);

    if (!task) {
      return new Response(
        JSON.stringify({
          error: 'Not Found',
          message: 'Task not found',
        }),
        {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Build response based on status
    let responseData: any = {
      taskId: task.taskId,
      status: task.status,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    };

    // Include results only for completed tasks
    if (task.status === 'completed' && task.transcription && task.processedTasks) {
      responseData.transcription = task.transcription;
      // Parse processedTasks JSON string into array
      responseData.processedTasks = JSON.parse(task.processedTasks);
      responseData.originalAudioUrl = `/api/v1/memo/audio/${task.taskId}`;
    }

    // Include error for failed tasks
    if (task.status === 'failed' && task.errorMessage) {
      responseData.error = task.errorMessage;
    }

    // Return task status
    return new Response(JSON.stringify(responseData), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in handleGetMemo:', error);

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
