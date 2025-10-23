import { handlePostMemo } from './handlers/memo';
import { handleGetMemo } from './handlers/memo-get';
import { handleGetAudio } from './handlers/memo-audio';
import { AudioProcessingWorkflow } from './workflow-handler';

export interface Env {
  DB: D1Database;
  R2_BUCKET: R2Bucket;
  AUDIO_PROCESSING_WORKFLOW: Workflow;
  AI: Ai;
  ENVIRONMENT: string;
}

export interface WorkerContext {
  env: Env;
  data: {
    userId?: string;
  };
}

/**
 * Main Worker fetch handler
 */
export default {
  fetch: async (request: Request, env: Env, ctx: ExecutionContext) => {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // Create context with user data (no default - authentication is required)
    const context: WorkerContext = {
      env,
      data: {
        userId: request.headers.get('X-User-Id') || undefined,
      },
    };

    // Route: POST /api/v1/memo
    if (method === 'POST' && path === '/api/v1/memo') {
      return handlePostMemo(request, context);
    }

    // Route: GET /api/v1/memo/:taskId
    if (method === 'GET' && path.match(/^\/api\/v1\/memo\/[a-f0-9\-]+$/)) {
      return handleGetMemo(request, context);
    }

    // Route: GET /api/v1/memo/audio/:taskId
    if (method === 'GET' && path.match(/^\/api\/v1\/memo\/audio\/[a-f0-9\-]+$/)) {
      return handleGetAudio(request, context);
    }

    // 404
    return new Response('Not Found', { status: 404 });
  },
};

/**
 * Export the workflow class for Cloudflare Workflows
 * The name must match the "class_name" in wrangler.toml
 * This is called automatically by Cloudflare when an R2 Object Created event occurs
 */
export { AudioProcessingWorkflow };
