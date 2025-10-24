/**
 * CORS middleware for Cloudflare Workers
 * Handles preflight requests and adds CORS headers to responses
 */

/**
 * Get allowed origins based on environment variables
 */
function getAllowedOrigins(allowedOriginEnv?: string): string[] {
  const origins = [
    // Development
    'http://localhost:5173', // Vite dev server
    'http://localhost:3000', // Alternative dev port
    'http://127.0.0.1:5173',
    'http://127.0.0.1:3000',
  ];

  // Add production origin from environment variable if set
  if (allowedOriginEnv) {
    origins.push(allowedOriginEnv);
  }

  return origins;
}

/**
 * Check if origin is allowed
 */
function isOriginAllowed(origin: string | null, allowedOriginEnv?: string): boolean {
  if (!origin) return false;
  return getAllowedOrigins(allowedOriginEnv).includes(origin);
}

/**
 * Handle CORS preflight requests (OPTIONS)
 */
export function handleCORSPreflight(request: Request, allowedOriginEnv?: string): Response | null {
  if (request.method !== 'OPTIONS') {
    return null;
  }

  const origin = request.headers.get('Origin');
  const allowedOrigins = getAllowedOrigins(allowedOriginEnv);
  const isAllowed = isOriginAllowed(origin, allowedOriginEnv);

  // console.log('[CORS] Preflight request');
  // console.log('[CORS] Origin:', origin);
  // console.log('[CORS] Allowed origins:', allowedOrigins);
  // console.log('[CORS] Is allowed:', isAllowed);

  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': isAllowed ? origin! : '',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400', // 24 hours
    },
  });
}

/**
 * Add CORS headers to response
 */
export function addCORSHeaders(response: Response, request: Request, allowedOriginEnv?: string): Response {
  const origin = request.headers.get('Origin');
  const allowedOrigins = getAllowedOrigins(allowedOriginEnv);
  const allowedOrigin = isOriginAllowed(origin, allowedOriginEnv) ? origin : '';

  // console.log('[CORS] Response headers');
  // console.log('[CORS] Origin:', origin);
  // console.log('[CORS] Allowed origins:', allowedOrigins);
  // console.log('[CORS] Setting Allow-Origin to:', allowedOrigin || '(empty)');

  // Create a new response with CORS headers
  const newResponse = new Response(response.body, response);

  if (allowedOrigin) {
    newResponse.headers.set('Access-Control-Allow-Origin', allowedOrigin);
  }
  newResponse.headers.set('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  newResponse.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  newResponse.headers.set('Access-Control-Max-Age', '86400');

  return newResponse;
}
