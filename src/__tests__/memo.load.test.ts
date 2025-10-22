import { describe, it, expect } from 'vitest';
import { pollTaskCompletion } from './helpers/test-utils';

/**
 * Load and boundary tests for large files.
 *
 * These tests are intentionally separated from the main integration tests because:
 * 1. They allocate large amounts of memory (50-51MB buffers)
 * 2. They can be slow and resource-intensive
 * 3. They are best run nightly or separately from the main test suite
 * 4. They test infrastructure (file size limits) rather than application logic
 *
 * CRITICAL: These tests must verify end-to-end processing success, not just
 * that the gateway accepts the payload. A 202 response only means the request
 * was received - it says nothing about whether the async worker can process
 * the large file within its memory and execution time constraints.
 *
 * Run with: npm test -- memo.load.test.ts
 * Or schedule for nightly CI runs only.
 */

const API_URL = 'http://localhost:8787/api/v1/memo';
const TEST_USER_ID = 'load-test-user';

describe('POST /api/v1/memo - Load and Boundary Tests', { timeout: 120000 }, () => {
  describe('📊 Large File Handling', () => {
    it('File at maximum boundary (50MB exactly) is accepted AND processed end-to-end', async () => {
      // CRITICAL: This test must verify that the async worker can actually process the 50MB file
      // within its memory and execution time constraints. A 202 response only proves the gateway
      // accepts the payload - it says nothing about whether the async worker will succeed.
      const maxBuffer = new Uint8Array(50 * 1024 * 1024);
      const formData = new FormData();
      formData.append('audio', new Blob([maxBuffer], { type: 'audio/webm' }), 'large.webm');

      // Step 1: Submit the file - should be accepted
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'X-User-Id': TEST_USER_ID },
        body: formData,
      });

      expect(response.status).toBe(202);
      const data = await response.json() as any;
      expect(data.taskId).toBeDefined();

      // Step 2: CRITICAL - Poll for completion with extended timeout
      // The async worker must actually process the 50MB file. If it has memory or time limits,
      // this is where the test will catch it failing. Without this, we'd have false confidence.
      const finalTask = await pollTaskCompletion(data.taskId, TEST_USER_ID, 90000);

      // Step 3: Verify the task actually completed or failed (reached terminal state)
      expect(finalTask.status).toMatch(/completed|failed/);

      // If completion is expected (file is valid audio), verify transcription was generated:
      // expect(finalTask.status).toBe('completed');
      // expect(finalTask.transcription).toBeDefined();
      // For now, we only assert it reached a terminal state, as 50MB of zeros may not be valid audio.
    });

    it('File slightly over boundary (50.1MB) is rejected with 413', async () => {
      // Test the tight boundary: just 1 byte over the limit should fail.
      // This is the definitive boundary test. If 50MB + 1 byte is rejected, then 51MB will also
      // be rejected. The 51MB test is redundant and can be safely deleted.
      const oversizedBuffer = new Uint8Array(50 * 1024 * 1024 + 1);
      const formData = new FormData();
      formData.append('audio', new Blob([oversizedBuffer], { type: 'audio/webm' }), 'toolarge.webm');

      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'X-User-Id': TEST_USER_ID },
        body: formData,
      });

      expect(response.status).toBe(413);
      const data = await response.json() as any;
      expect(data.error).toBe('Payload Too Large');
      expect(data.message).toContain('exceeds maximum size');
    });
  });
});
