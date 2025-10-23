/**
 * Shared test utilities for integration and load tests.
 * Extracted to avoid duplication and ensure consistency across test suites.
 */

/**
 * Create a test JWT token for use in integration tests
 * This simulates a valid Clerk JWT without requiring actual Clerk authentication
 *
 * NOTE: This is for testing only. In production, tokens come from Clerk.
 */
export function createTestJWT(userId: string, expiresInMinutes: number = 60): string {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: userId,
    iss: 'https://clerk.example.com',
    aud: ['api'],
    iat: now,
    exp: now + expiresInMinutes * 60,
  };

  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');

  // For testing, we use a dummy signature (not cryptographically valid)
  // Real tokens would be signed with Clerk's private key
  const signature = Buffer.from('test-signature').toString('base64url');

  return `${header}.${payloadB64}.${signature}`;
}

/**
 * Helper: Poll task status until it changes from 'pending' or times out.
 * This is critical for testing the async workflow - we need to verify
 * that the task actually progresses, not just sits in 'pending' forever.
 *
 * Returns the final task status or throws if timeout is reached.
 */
export async function pollTaskCompletion(
  taskId: string,
  userId: string,
  maxWaitMs: number = 30000,
  pollIntervalMs: number = 500,
  useJWT: boolean = false
): Promise<any> {
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    const headers: Record<string, string> = useJWT
      ? { Authorization: `Bearer ${createTestJWT(userId)}` }
      : { 'X-User-Id': userId };

    const response = await fetch(`http://localhost:8787/api/v1/memo/${taskId}`, {
      method: 'GET',
      headers,
    });

    if (response.status !== 200) {
      throw new Error(`Failed to fetch task status: ${response.status}`);
    }

    const task = await response.json() as any;

    // Task is no longer pending - either completed or failed
    if (task.status !== 'pending') {
      return task;
    }

    // Wait before polling again
    await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
  }

  throw new Error(`Task ${taskId} did not complete within ${maxWaitMs}ms`);
}
