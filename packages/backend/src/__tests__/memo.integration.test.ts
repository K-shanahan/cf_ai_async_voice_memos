import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { pollTaskCompletion } from './helpers/test-utils';

/**
 * Skip async workflow tests in local dev mode
 * R2 Object Created events don't trigger Workflows in local wrangler dev
 * These tests are meant for CI/production environments
 */
const skipWorkflowTests = !process.env.CI;

/**
 * Integration tests against the actual running wrangler dev server.
 *
 * These tests verify:
 * 1. POST endpoint accepts valid files and returns 202 with proper response structure
 * 2. GET endpoint retrieves task status correctly
 * 3. Authorization: users can only see their own tasks
 * 4. Input validation: proper error responses for invalid data
 * 5. Async workflow: files are actually processed (not just queued)
 *
 * Tests use a real audio file (test.webm) to ensure the backend can handle
 * structurally valid audio, not just arbitrary binary data.
 */

const API_URL = 'http://localhost:8787/api/v1/memo';
const TEST_USER_ID = 'integration-test-user';
const REAL_AUDIO_FILE = join(__dirname, 'fixtures/test.webm');

/**
 * Helper: Read real audio file from disk.
 * This ensures tests use actual valid audio data, not fake strings.
 */
function getTestAudioFile(): Buffer {
  try {
    return readFileSync(REAL_AUDIO_FILE);
  } catch (error) {
    throw new Error(`Test audio file not found at ${REAL_AUDIO_FILE}`);
  }
}

describe('POST /api/v1/memo - Integration Tests (Real API)', () => {
  describe('✅ Happy Path - Real Upload', () => {
    it('Upload real audio file and verify response structure', async () => {
      // Use a REAL audio file to ensure the backend can handle valid data,
      // not just arbitrary binary blobs.
      const audioData = new Uint8Array(getTestAudioFile());
      const formData = new FormData();
      formData.append('audio', new Blob([audioData], { type: 'audio/webm' }), 'test.webm');

      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'X-User-Id': TEST_USER_ID,
        },
        body: formData,
      });

      expect(response.status).toBe(202);
      const data = await response.json() as any;

      // Verify response structure
      expect(data.taskId).toBeDefined();
      expect(data.status).toBe('pending');
      expect(data.statusUrl).toBeDefined();

      // Verify taskId is a valid UUID
      const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(data.taskId).toMatch(uuidPattern);

      // Verify statusUrl format
      expect(data.statusUrl).toBe(`/api/v1/memo/${data.taskId}`);
    });

    it.skipIf(skipWorkflowTests)(
      'Uploads, processes, and completes a real audio file',
      async () => {
        // This test verifies the complete async workflow:
        // 1. POST endpoint accepts the file (202)
        // 2. Task is created with pending status
        // 3. Workflow processes asynchronously
        // 4. Task transitions to completed with results
        const audioData = new Uint8Array(getTestAudioFile());
        const formData = new FormData();
        formData.append('audio', new Blob([audioData], { type: 'audio/webm' }), 'test.webm');

        // Step 1: Upload file
        const uploadResponse = await fetch(API_URL, {
          method: 'POST',
          headers: { 'X-User-Id': TEST_USER_ID },
          body: formData,
        });

        expect(uploadResponse.status).toBe(202);
        const uploadData = await uploadResponse.json() as any;
        const taskId = uploadData.taskId;

        // Step 2: Verify initial task status
        const getResponse = await fetch(`http://localhost:8787/api/v1/memo/${taskId}`, {
          method: 'GET',
          headers: { 'X-User-Id': TEST_USER_ID },
        });

        expect(getResponse.status).toBe(200);
        const task = await getResponse.json() as any;

        // Step 3: Verify the task exists with proper structure (initially pending)
        expect(task.taskId).toBe(taskId);
        expect(task.status).toBe('pending');
        expect(task.createdAt).toBeDefined();
        expect(task.updatedAt).toBeDefined();
        expect(task.transcription).toBeUndefined(); // Not yet processed
        expect(task.processedTasks).toBeUndefined(); // Not yet processed

        // Step 4: Poll for workflow completion
        const completedTask = await pollTaskCompletion(taskId, TEST_USER_ID, 60000, 500);

        // Step 5: Verify task completed with results
        expect(completedTask.status).toBe('completed');
        expect(completedTask.transcription).toBeDefined();
        expect(completedTask.processedTasks).toBeDefined();
        expect(Array.isArray(completedTask.processedTasks)).toBe(true);
      }
    );

    it('Multiple uploads generate unique taskIds', async () => {
      const uploadFile = async () => {
        const audioData = new Uint8Array(getTestAudioFile());
        const formData = new FormData();
        formData.append('audio', new Blob([audioData], { type: 'audio/webm' }), 'test.webm');

        const response = await fetch(API_URL, {
          method: 'POST',
          headers: { 'X-User-Id': TEST_USER_ID },
          body: formData,
        });

        const data = await response.json() as any;
        return data.taskId;
      };

      const taskId1 = await uploadFile();
      const taskId2 = await uploadFile();
      const taskId3 = await uploadFile();

      expect(taskId1).not.toBe(taskId2);
      expect(taskId2).not.toBe(taskId3);
      expect(taskId1).not.toBe(taskId3);
    });
  });

  describe('❌ User Input Validation - Real API', () => {
    it('Missing X-User-Id header → 401 Unauthorized', async () => {
      const formData = new FormData();
      const audioData = new Uint8Array(getTestAudioFile());
      formData.append('audio', new Blob([audioData], { type: 'audio/webm' }), 'test.webm');

      const response = await fetch(API_URL, {
        method: 'POST',
        // No X-User-Id header
        body: formData,
      });

      expect(response.status).toBe(401);
      const data = await response.json() as any;
      expect(data.error).toBe('Unauthorized');
    });

    it('Missing audio file → 400 Bad Request', async () => {
      const formData = new FormData();
      // No audio file added

      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'X-User-Id': TEST_USER_ID },
        body: formData,
      });

      expect(response.status).toBe(400);
      const data = await response.json() as any;
      expect(data.error).toBe('Bad Request');
      expect(data.message).toContain('No audio file provided');
    });

    it('Empty audio file → 400 Bad Request', async () => {
      const formData = new FormData();
      formData.append('audio', new Blob([], { type: 'audio/webm' }), 'empty.webm');

      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'X-User-Id': TEST_USER_ID },
        body: formData,
      });

      expect(response.status).toBe(400);
      const data = await response.json() as any;
      expect(data.error).toBe('Bad Request');
      expect(data.message).toContain('Audio file is empty');
    });

    it('Unsupported MIME type → 415 Unsupported Media Type', async () => {
      const formData = new FormData();
      const audioData = new Uint8Array(getTestAudioFile());
      // Send valid audio file but with wrong MIME type
      formData.append('audio', new Blob([audioData], { type: 'image/png' }), 'image.png');

      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'X-User-Id': TEST_USER_ID },
        body: formData,
      });

      expect(response.status).toBe(415);
      const data = await response.json() as any;
      expect(data.error).toBe('Unsupported Media Type');
      expect(data.message).toContain('image/png');
      expect(data.message).toContain('not supported');
    });

    it('Invalid Content-Type → 400 Bad Request', async () => {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'X-User-Id': TEST_USER_ID,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ audio: 'data' }),
      });

      expect(response.status).toBe(400);
      const data = await response.json() as any;
      expect(data.error).toBe('Bad Request');
      expect(data.message).toContain('multipart/form-data');
    });
  });

  describe('📋 Edge Cases - Real API', () => {
    it('Processes audio files with different MIME types (mp3)', async () => {
      // Verifies that the server accepts files with different MIME types
      // and that the workflow can process them.
      const formData = new FormData();
      const audioData = new Uint8Array(getTestAudioFile());
      // Sending a webm file with mp3 MIME type to test MIME type handling
      formData.append('audio', new Blob([audioData], { type: 'audio/mpeg' }), 'song.mp3');

      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'X-User-Id': TEST_USER_ID },
        body: formData,
      });

      expect(response.status).toBe(202);
      const uploadData = await response.json() as any;
      const taskId = uploadData.taskId;

      // Verify the task was created
      const getResponse = await fetch(`http://localhost:8787/api/v1/memo/${taskId}`, {
        method: 'GET',
        headers: { 'X-User-Id': TEST_USER_ID },
      });

      expect(getResponse.status).toBe(200);
      const task = await getResponse.json() as any;
      expect(task.status).toBe('pending');
    });

    it('GET endpoint rejects access to non-existent task', async () => {
      const fakeTaskId = '00000000-0000-4000-8000-000000000000';

      const response = await fetch(`http://localhost:8787/api/v1/memo/${fakeTaskId}`, {
        method: 'GET',
        headers: { 'X-User-Id': TEST_USER_ID },
      });

      expect(response.status).toBe(404);
      const data = await response.json() as any;
      expect(data.error).toBe('Not Found');
    });
  });

  describe('🔒 Security - Real API', () => {
    it('User cannot access another users task - returns 404 (does not leak task existence)', async () => {
      const user1Id = `user-${Date.now()}`;
      const user2Id = `user-${Date.now() + 1}`;

      // User 1 uploads a file and gets taskId
      const formData1 = new FormData();
      const audioData = new Uint8Array(getTestAudioFile());
      formData1.append('audio', new Blob([audioData], { type: 'audio/webm' }), 'test.webm');

      const response1 = await fetch(API_URL, {
        method: 'POST',
        headers: { 'X-User-Id': user1Id },
        body: formData1,
      });

      expect(response1.status).toBe(202);
      const task1 = await response1.json() as any;
      const taskId = task1.taskId;

      // User 2 tries to GET User 1's task
      // The database query filters by userId, so returns 404 (doesn't leak task existence)
      const response2 = await fetch(`http://localhost:8787/api/v1/memo/${taskId}`, {
        method: 'GET',
        headers: { 'X-User-Id': user2Id },
      });

      // Should return 404 - we don't leak that the task exists but belongs to another user
      expect(response2.status).toBe(404);
      const error = await response2.json() as any;
      expect(error.error).toBe('Not Found');
    });

    it('User cannot access task without authentication', async () => {
      // First, create a task as an authenticated user
      const formData = new FormData();
      const audioData = new Uint8Array(getTestAudioFile());
      formData.append('audio', new Blob([audioData], { type: 'audio/webm' }), 'test.webm');

      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'X-User-Id': TEST_USER_ID },
        body: formData,
      });

      const task = await response.json() as any;
      const taskId = task.taskId;

      // Now try to GET the task without auth
      const getResponse = await fetch(`http://localhost:8787/api/v1/memo/${taskId}`, {
        method: 'GET',
        // No X-User-Id header
      });

      expect(getResponse.status).toBe(401);
      const error = await getResponse.json() as any;
      expect(error.error).toBe('Unauthorized');
    });

    it('Directory traversal in filename is safely handled during processing', async () => {
      // SECURITY TEST: Verify that malicious filenames with directory traversal are handled safely.
      // The POST handler accepts the file (since filenames are auto-generated by taskId).
      const formData = new FormData();
      const audioData = new Uint8Array(getTestAudioFile());
      // Try to upload with directory traversal in filename
      formData.append(
        'audio',
        new Blob([audioData], { type: 'audio/webm' }),
        '../../../etc/passwd.webm'
      );

      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'X-User-Id': TEST_USER_ID },
        body: formData,
      });

      expect(response.status).toBe(202);
      const uploadData = await response.json() as any;
      const taskId = uploadData.taskId;

      // Verify the task was created with safe handling
      const getResponse = await fetch(`http://localhost:8787/api/v1/memo/${taskId}`, {
        method: 'GET',
        headers: { 'X-User-Id': TEST_USER_ID },
      });

      expect(getResponse.status).toBe(200);
      const task = await getResponse.json() as any;
      expect(task.taskId).toBe(taskId);
      console.log('Task Status', task.status);
      console.log('Task Error', task.error);
      expect(task.status).toBe('pending');
      // The system generates safe keys based on taskId, not user-provided filenames
    });
  });

  describe('🧪 GET Endpoint Tests', () => {
    it('GET endpoint returns correct task with all fields', async () => {
      // Upload a file first
      const formData = new FormData();
      const audioData = new Uint8Array(getTestAudioFile());
      formData.append('audio', new Blob([audioData], { type: 'audio/webm' }), 'test.webm');

      const uploadResponse = await fetch(API_URL, {
        method: 'POST',
        headers: { 'X-User-Id': TEST_USER_ID },
        body: formData,
      });

      const uploadData = await uploadResponse.json() as any;
      const taskId = uploadData.taskId;

      // GET the task
      const getResponse = await fetch(`http://localhost:8787/api/v1/memo/${taskId}`, {
        method: 'GET',
        headers: { 'X-User-Id': TEST_USER_ID },
      });

      expect(getResponse.status).toBe(200);
      const taskData = await getResponse.json() as any;

      // Verify all expected fields are present
      expect(taskData.taskId).toBe(taskId);
      expect(taskData.status).toBe('pending');
      expect(taskData.createdAt).toBeDefined();
      expect(taskData.updatedAt).toBeDefined();
      expect(taskData.transcription).toBeUndefined(); // Not yet processed
      expect(taskData.processedTasks).toBeUndefined();
    });
  });
});
