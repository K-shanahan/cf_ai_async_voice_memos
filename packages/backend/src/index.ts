import { handlePostMemo } from './handlers/memo';
import { handleGetMemo } from './handlers/memo-get';
import { handleGetMemos } from './handlers/memos-list';
import { handleDeleteMemo } from './handlers/memo-delete';
import { handleGetAudio } from './handlers/memo-audio';
import { AudioProcessingWorkflow } from './workflow-handler';
import { handleQueueConsumer } from './queue-consumer';
import { extractUserFromRequest, extractUserIdLegacy, AuthError } from './auth';
import { handleCORSPreflight, addCORSHeaders } from './cors';

export interface Env {
  DB: D1Database;
  R2_BUCKET: R2Bucket;
  AUDIO_PROCESSING_WORKFLOW: Workflow;
  AI: Ai;
  VOICE_MEMO_QUEUE: Queue;
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

    // Fall back to X-User-Id header for backward compatibility / testing
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

    // Authenticate user
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
