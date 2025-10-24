import { handlePostMemo } from './handlers/memo';
import { handleGetMemo } from './handlers/memo-get';
import { handleGetMemos } from './handlers/memos-list';
import { handleDeleteMemo } from './handlers/memo-delete';
import { handleGetAudio } from './handlers/memo-audio';
import { AudioProcessingWorkflow } from './workflow-handler';
import { handleQueueConsumer } from './queue-consumer';
import { extractUserFromRequest, extractUserIdLegacy, AuthError, validateClerkToken } from './auth';
import { handleCORSPreflight, addCORSHeaders } from './cors';
import { TaskStatusDO } from './durable-objects/task-status-do';
import { getTask } from './db';

export interface Env {
  DB: D1Database;
  R2_BUCKET: R2Bucket;
  AUDIO_PROCESSING_WORKFLOW: Workflow;
  AI: Ai;
  VOICE_MEMO_QUEUE?: Queue;
  ANALYTICS: AnalyticsEngineDataset;
  TASK_STATUS_DO: DurableObjectNamespace;
  ENVIRONMENT: string;
  ALLOWED_ORIGIN?: string;
}

export interface WorkerContext {
  env: Env;
  data: {
    userId?: string;
  };
}

/**
 * Extract user ID from request using Clerk JWT or legacy X-User-Id header
 * Throws AuthError if neither is valid
 */
function extractUserIdFromRequest(request: Request): string {
  try {
    // Try Clerk JWT first (preferred)
    return extractUserFromRequest(request);
  } catch (error) {
    if (!(error instanceof AuthError)) {
      throw error;
    }

    // TODO: Remove this
    const legacyUserId = extractUserIdLegacy(request);
    if (legacyUserId) {
      console.warn('Using legacy X-User-Id header. Please update to use Clerk JWT.');
      return legacyUserId;
    }

    // No valid auth method found
    throw error;
  }
}

/**
 * Handle WebSocket upgrade for real-time task status updates
 * Verifies user authentication and task ownership before connecting to Durable Object
 * Extracts token from query parameter since WebSocket handshakes can't use Authorization header
 */
async function handleWebSocketUpgrade(
  request: Request,
  env: Env
): Promise<Response> {
  try {
    const url = new URL(request.url);
    const pathParts = url.pathname.split('/');
    const taskId = pathParts[pathParts.length - 1];

    // Extract token from query parameter
    const token = url.searchParams.get('token');
    if (!token) {
      console.warn('[WebSocket] Missing token in query parameter');
      return new Response(
        JSON.stringify({
          error: 'Unauthorized',
          message: 'Missing authentication token'
        }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // Validate token and extract userId
    let userId: string;
    try {
      userId = validateClerkToken(token);
      console.log('[Auth] ✓ WebSocket user authenticated:', userId);
    } catch (error) {
      if (error instanceof AuthError) {
        console.warn('[Auth] ✗ WebSocket authentication failed:', error.message);
        return new Response(
          JSON.stringify({
            error: 'Unauthorized',
            message: error.message
          }),
          {
            status: 401,
            headers: { 'Content-Type': 'application/json' }
          }
        );
      }
      throw error;
    }

    // Verify task ownership
    const task = await getTask(env.DB, taskId, userId);
    if (!task) {
      return new Response(
        JSON.stringify({
          error: 'Not Found',
          message: 'Task not found or access denied'
        }),
        {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // Forward WebSocket request to Durable Object
    const doId = env.TASK_STATUS_DO.idFromName(taskId);
    const doStub = env.TASK_STATUS_DO.get(doId);
    return doStub.fetch(request);
  } catch (error) {
    console.error('[WebSocket] Error during upgrade:', error);
    return new Response(
      JSON.stringify({
        error: 'Internal Server Error',
        message: 'Failed to establish WebSocket connection'
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}

/**
 * Main Worker fetch handler and queue consumer
 */
export default {
  fetch: async (request: Request, env: Env, ctx: ExecutionContext) => {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // Handle CORS preflight requests
    const corsPreflightResponse = handleCORSPreflight(request, env.ALLOWED_ORIGIN);
    if (corsPreflightResponse) {
      return corsPreflightResponse;
    }

    // Route: GET /ws/task/:taskId (WebSocket for real-time status updates)
    // Handle WebSocket separately since token is passed as query parameter, not header
    if (method === 'GET' && path.match(/^\/ws\/task\/[a-f0-9\-]+$/)) {
      return handleWebSocketUpgrade(request, env);
    }

    // Authenticate user for all other routes
    let userId: string | undefined;
    try {
      userId = extractUserIdFromRequest(request);
      console.log('[Auth] ✓ User authenticated:', userId);
    } catch (error) {
      if (error instanceof AuthError) {
        console.warn('[Auth] ✗ Authentication failed:', error.message);
        const response = new Response(
          JSON.stringify({
            error: 'Unauthorized',
            message: error.message,
          }),
          {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          }
        );
        return addCORSHeaders(response, request, env.ALLOWED_ORIGIN);
      }
      console.error('[Auth] Unexpected error:', error);
      throw error;
    }

    // Create context with authenticated user
    const context: WorkerContext = {
      env,
      data: {
        userId,
      },
    };

    // Route: POST /api/v1/memo
    if (method === 'POST' && path === '/api/v1/memo') {
      const response = await handlePostMemo(request, context);
      return addCORSHeaders(response, request, env.ALLOWED_ORIGIN);
    }

    // Route: GET /api/v1/memos (list all memos with pagination)
    if (method === 'GET' && path === '/api/v1/memos') {
      const response = await handleGetMemos(request, context);
      return addCORSHeaders(response, request, env.ALLOWED_ORIGIN);
    }

    // Route: GET /api/v1/memo/:taskId
    if (method === 'GET' && path.match(/^\/api\/v1\/memo\/[a-f0-9\-]+$/) && !path.includes('/audio/')) {
      const response = await handleGetMemo(request, context);
      return addCORSHeaders(response, request, env.ALLOWED_ORIGIN);
    }

    // Route: GET /api/v1/memo/audio/:taskId
    if (method === 'GET' && path.match(/^\/api\/v1\/memo\/audio\/[a-f0-9\-]+$/)) {
      const response = await handleGetAudio(request, context);
      return addCORSHeaders(response, request, env.ALLOWED_ORIGIN);
    }

    // Route: DELETE /api/v1/memo/:taskId
    if (method === 'DELETE' && path.match(/^\/api\/v1\/memo\/[a-f0-9\-]+$/)) {
      const response = await handleDeleteMemo(request, context);
      return addCORSHeaders(response, request, env.ALLOWED_ORIGIN);
    }

    // 404
    const notFoundResponse = new Response('Not Found', { status: 404 });
    return addCORSHeaders(notFoundResponse, request, env.ALLOWED_ORIGIN);
  },

  queue: async (batch: MessageBatch<any>, env: Env): Promise<void> => {
    await handleQueueConsumer(batch, env);
  },
} as ExportedHandler<Env>;

/**
 * Export the workflow class for Cloudflare Workflows
 * The name must match the "class_name" in wrangler.toml
 * This is called automatically by Cloudflare when an R2 Object Created event occurs
 */
export { AudioProcessingWorkflow };

/**
 * Export the Durable Object class for status updates
 * The name must match the "class_name" in wrangler.toml
 * Manages real-time WebSocket connections and status update history for audio processing tasks
 */
export { TaskStatusDO };
