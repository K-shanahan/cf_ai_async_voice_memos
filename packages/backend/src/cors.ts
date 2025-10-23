/**
 * CORS middleware for Cloudflare Workers
 * Handles preflight requests and adds CORS headers to responses
 */

/**
 * Get allowed origins based on environment
 */
function getAllowedOrigins(): string[] {
  // In development, allow localhost
  // In production, only allow the actual frontend domain
  return [
    'http://localhost:5173', // Vite dev server
    'http://localhost:3000', // Alternative dev port
    'http://127.0.0.1:5173',
    'http://127.0.0.1:3000',
  ];
}

/**
 * Check if origin is allowed
 */
function isOriginAllowed(origin: string | null): boolean {
  if (!origin) return false;
  return getAllowedOrigins().includes(origin);
}

/**
 * Handle CORS preflight requests (OPTIONS)
 */
export function handleCORSPreflight(request: Request): Response | null {
  if (request.method !== 'OPTIONS') {
    return null;
  }

  const origin = request.headers.get('Origin');

  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': isOriginAllowed(origin) ? origin! : '',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400', // 24 hours
    },
  });
}

/**
 * Add CORS headers to response
 */
export function addCORSHeaders(response: Response, request: Request): Response {
  const origin = request.headers.get('Origin');
  const allowedOrigin = isOriginAllowed(origin) ? origin : '';

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
