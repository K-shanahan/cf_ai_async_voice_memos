/**
 * Shared test utilities for integration and load tests.
 * Extracted to avoid duplication and ensure consistency across test suites.
 */

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
  pollIntervalMs: number = 500
): Promise<any> {
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    const response = await fetch(`http://localhost:8787/api/v1/memo/${taskId}`, {
      method: 'GET',
      headers: { 'X-User-Id': userId },
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
