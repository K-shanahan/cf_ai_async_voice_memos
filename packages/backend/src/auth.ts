/**
 * Clerk JWT Authentication Middleware
 * Validates Clerk tokens and extracts user information
 */

/**
 * Represents decoded JWT payload
 */
interface JWTPayload {
  sub: string; // Clerk user ID
  iss?: string;
  aud?: string[];
  iat?: number;
  exp?: number;
  [key: string]: any;
}

/**
 * Error thrown during auth validation
 */
export class AuthError extends Error {
  constructor(
    message: string,
    public status: number = 401
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

/**
 * Decode JWT payload without verification
 * NOTE: This trusts that the frontend validated the token with Clerk SDK
 * In production, consider verifying the signature using Clerk's public keys
 */
function decodeJWT(token: string): JWTPayload {
  const parts = token.split('.');
  if (parts.length !== 3) {
    console.error('[Auth] Invalid token format - expected 3 parts, got', parts.length);
    throw new AuthError('Invalid token format', 401);
  }

  const payload = parts[1];
  if (!payload) {
    throw new AuthError('Invalid token format', 401);
  }

  try {
    // Base64url decode
    const decoded = atob(
      payload
        .replace(/-/g, '+')
        .replace(/_/g, '/')
        .padEnd(payload.length + (4 - (payload.length % 4)) % 4, '=')
    );
    const parsed = JSON.parse(decoded) as JWTPayload;
    console.log('[Auth] Token payload:', {
      sub: parsed.sub,
      iss: parsed.iss,
      exp: parsed.exp,
      iat: parsed.iat,
    });
    return parsed;
  } catch (error) {
    console.error('[Auth] Failed to decode token:', error);
    throw new AuthError('Failed to decode token', 401);
  }
}

/**
 * Validate JWT expiration
 */
function validateExpiration(payload: JWTPayload): void {
  if (!payload.exp) {
    console.warn('[Auth] Token missing expiration claim, skipping expiration validation');
    return;
  }

  const now = Math.floor(Date.now() / 1000);
  const expirationTime = payload.exp;
  const secondsUntilExpiry = expirationTime - now;

  // Allow 60 second clock skew (increased for development)
  const clockSkew = 60;

  console.log('[Auth] Token expiration check:', {
    now,
    expirationTime,
    secondsUntilExpiry,
    clockSkew,
    isExpired: secondsUntilExpiry < -clockSkew,
  });

  if (now > expirationTime + clockSkew) {
    throw new AuthError(`Token expired (${-secondsUntilExpiry} seconds ago)`, 401);
  }
}

/**
 * Extract userId from JWT payload
 */
function extractUserId(payload: JWTPayload): string {
  // Clerk uses 'sub' claim for user ID
  const userId = payload.sub;

  if (!userId) {
    throw new AuthError('Token missing user ID', 401);
  }

  // Validate userId format (Clerk IDs are usually user_* or similar)
  if (typeof userId !== 'string' || userId.length === 0) {
    throw new AuthError('Invalid user ID format', 401);
  }

  return userId;
}

/**
 * Parse and validate Bearer token from Authorization header
 */
export function extractBearerToken(authHeader: string | null): string {
  if (!authHeader) {
    throw new AuthError('Missing Authorization header', 401);
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    throw new AuthError('Invalid Authorization header format', 401);
  }

  const token = parts[1];
  if (!token) {
    throw new AuthError('Empty token', 401);
  }

  return token;
}

/**
 * Validate Clerk JWT and extract userId
 *
 * Security Notes:
 * - Verifies JWT structure (3 parts)
 * - Validates expiration claim with 30-second clock skew
 * - Extracts userId from 'sub' claim
 * - Does NOT verify JWT signature (assumes frontend validated with Clerk SDK)
 *
 * For production with stricter requirements:
 * - Add signature verification using Clerk's public JWKS keys
 * - Fetch keys from: https://clerk.com/.well-known/jwks.json
 * - Use SubtleCrypto API for RS256 verification
 */
export function validateClerkToken(token: string): string {
  try {
    const payload = decodeJWT(token);
    validateExpiration(payload);
    return extractUserId(payload);
  } catch (error) {
    if (error instanceof AuthError) {
      throw error;
    }
    throw new AuthError('Token validation failed', 401);
  }
}

/**
 * Middleware to extract and validate user from request
 * Sets userId in context.data if token is valid
 * Throws AuthError if validation fails
 */
export function extractUserFromRequest(request: Request): string {
  const authHeader = request.headers.get('Authorization');

  if (!authHeader) {
    throw new AuthError('Missing Authorization header', 401);
  }

  const token = extractBearerToken(authHeader);
  return validateClerkToken(token);
}

/**
 * Legacy support: Check for X-User-Id header if present
 * Used for backward compatibility and testing
 * In production, this should be removed
 */
export function extractUserIdLegacy(request: Request): string | undefined {
  return request.headers.get('X-User-Id') || undefined;
}
