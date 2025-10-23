/**
 * GET /api/v1/memos - Retrieve paginated list of user's memos
 */

import type { WorkerContext } from '../index';
import { getUserTasksPaginated } from '../db';

/**
 * Memo summary for list view
 */
interface MemoSummary {
  taskId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  createdAt: string;
  updatedAt: string;
  transcription?: string;
  taskCount?: number;
  processingTimeSeconds?: number;
}

/**
 * Handler for GET /api/v1/memos
 * Returns paginated list of user's memos
 */
export async function handleGetMemos(
  request: Request,
  context: WorkerContext
): Promise<Response> {
  try {
    console.log('[GetMemos] Starting handler');

    // Get authenticated user
    const userId = context.data.userId;
    console.log('[GetMemos] userId:', userId);

    if (!userId) {
      console.warn('[GetMemos] No userId provided');
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
    console.log('[GetMemos] db binding available:', !!db);

    if (!db) {
      console.error('[GetMemos] Database not available');
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

    // Parse pagination query params
    const url = new URL(request.url);
    const limit = parsePaginationParam(url.searchParams.get('limit'), 100);
    const offset = parsePaginationParam(url.searchParams.get('offset'), 0);
    console.log('[GetMemos] pagination:', { limit, offset });

    if (limit < 1 || limit > 100) {
      console.warn('[GetMemos] Invalid limit:', limit);
      return new Response(
        JSON.stringify({
          error: 'Bad Request',
          message: 'Limit must be between 1 and 100',
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    if (offset < 0) {
      console.warn('[GetMemos] Invalid offset:', offset);
      return new Response(
        JSON.stringify({
          error: 'Bad Request',
          message: 'Offset must be >= 0',
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Fetch paginated tasks
    console.log('[GetMemos] Calling getUserTasksPaginated...');
    const { tasks, total } = await getUserTasksPaginated(db, userId, limit, offset);
    console.log('[GetMemos] Query successful. tasks:', tasks.length, 'total:', total);

    // Build response with summaries
    console.log('[GetMemos] Building response summaries...');
    const memos: MemoSummary[] = tasks.map((task) => {
      const summary: MemoSummary = {
        taskId: task.taskId,
        status: task.status,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
      };

      // Include transcription if available
      if (task.transcription) {
        summary.transcription = task.transcription;
      }

      // Include task count for completed tasks
      if (task.processedTasks) {
        try {
          const parsedTasks = JSON.parse(task.processedTasks);
          summary.taskCount = Array.isArray(parsedTasks) ? parsedTasks.length : 0;
        } catch (parseError) {
          console.warn('[GetMemos] Failed to parse processedTasks for task:', task.taskId);
          summary.taskCount = 0;
        }
      }

      // Calculate processing time in seconds
      if (task.status === 'completed' || task.status === 'failed') {
        const createdTime = new Date(task.createdAt).getTime();
        const updatedTime = new Date(task.updatedAt).getTime();
        summary.processingTimeSeconds = Math.round((updatedTime - createdTime) / 1000);
      }

      return summary;
    });

    // Calculate pagination metadata
    const hasMore = offset + limit < total;
    console.log('[GetMemos] Response ready. hasMore:', hasMore);

    // Return response
    const response = {
      memos,
      total,
      hasMore,
    };
    console.log('[GetMemos] ✓ Returning successful response');

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[GetMemos] ✗ ERROR caught:', error);

    if (error instanceof Error) {
      console.error('[GetMemos] Error details:', {
        name: error.name,
        message: error.message,
        stack: error.stack,
      });
    }

    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
    console.error('[GetMemos] Returning 500 error:', errorMessage);

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
 * Parse and validate pagination parameter
 */
function parsePaginationParam(value: string | null, defaultValue: number): number {
  if (!value) return defaultValue;

  try {
    const parsed = parseInt(value, 10);
    if (isNaN(parsed)) return defaultValue;
    return parsed;
  } catch {
    return defaultValue;
  }
}
