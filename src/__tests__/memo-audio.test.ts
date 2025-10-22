import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMockContext, MockWorkerContext } from '../test-utils';
import { handleGetAudio } from '../handlers/memo-audio';

/**
 * Utility: Create a consistent, complete R2 object mock
 * Prevents brittle tests due to incomplete mock structure
 */
function createMockR2Object(audioBuffer: Buffer = Buffer.from('mock audio')) {
  return {
    arrayBuffer: vi.fn().mockResolvedValue(audioBuffer.buffer),
    size: audioBuffer.length,
  };
}

/**
 * Utility: Create a complete mock task record
 */
function createMockTask(overrides: Partial<any> = {}) {
  return {
    taskId: 'c7a2b0e8-5f6a-4b9a-8f0c-1b2d3c4e5f6a',
    userId: 'test-user-123',
    status: 'completed',
    r2Key: 'uploads/test-user-123/c7a2b0e8-5f6a-4b9a-8f0c-1b2d3c4e5f6a.webm',
    transcription: 'Test',
    processedTasks: '[]',
    errorMessage: null,
    createdAt: '2025-10-22T10:00:00Z',
    updatedAt: '2025-10-22T10:05:00Z',
    ...overrides,
  };
}

describe('GET /api/v1/memo/audio/{taskId} - Audio File Retrieval', () => {
  let mockContext: MockWorkerContext;

  beforeEach(() => {
    mockContext = createMockContext();
  });

  describe('✅ Happy Path - Retrieve Audio File', () => {
    it('Successfully retrieves and streams audio file from R2', async () => {
      const taskId = 'c7a2b0e8-5f6a-4b9a-8f0c-1b2d3c4e5f6a';
      const userId = 'test-user-123';
      const r2Key = `uploads/${userId}/${taskId}.webm`;
      const request = new Request(`http://localhost/api/v1/memo/audio/${taskId}`);

      const audioBuffer = Buffer.from('mock audio file content');
      const task = createMockTask({ taskId, userId, r2Key });

      const prepareMock = mockContext.env.DB.prepare as any;
      prepareMock.mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue(task),
        }),
      });

      const r2Object = createMockR2Object(audioBuffer);
      (mockContext.env.R2_BUCKET.get as any).mockResolvedValue(r2Object);

      mockContext.data.userId = userId;

      // Execute
      const response = await handleGetAudio(request, mockContext);

      // Assert response status
      expect(response.status).toBe(200);

      // Assert correct Content-Type header
      expect(response.headers.get('Content-Type')).toBe('audio/webm');

      // Assert R2 was queried with correct key
      expect(mockContext.env.R2_BUCKET.get).toHaveBeenCalledWith(r2Key);

      // Assert response body contains audio data
      const responseBuffer = await response.arrayBuffer();
      expect(Buffer.from(responseBuffer)).toEqual(audioBuffer);
    });

    it('Sets correct Content-Length header based on file size', async () => {
      const audioBuffer = Buffer.from('x'.repeat(1024)); // 1KB file
      const task = createMockTask();
      const request = new Request(`http://localhost/api/v1/memo/audio/${task.taskId}`);

      const prepareMock = mockContext.env.DB.prepare as any;
      prepareMock.mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue(task),
        }),
      });

      const r2Object = createMockR2Object(audioBuffer);
      (mockContext.env.R2_BUCKET.get as any).mockResolvedValue(r2Object);

      mockContext.data.userId = task.userId;

      // Execute
      const response = await handleGetAudio(request, mockContext);

      // Assert Content-Length
      expect(response.headers.get('Content-Length')).toBe('1024');
    });

    it('Sets proper cache headers with long-term caching for immutable audio', async () => {
      const audioBuffer = Buffer.from('mock audio');
      const task = createMockTask();
      const request = new Request(`http://localhost/api/v1/memo/audio/${task.taskId}`);

      const prepareMock = mockContext.env.DB.prepare as any;
      prepareMock.mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue(task),
        }),
      });

      const r2Object = createMockR2Object(audioBuffer);
      (mockContext.env.R2_BUCKET.get as any).mockResolvedValue(r2Object);

      mockContext.data.userId = task.userId;

      // Execute
      const response = await handleGetAudio(request, mockContext);

      // Assert specific cache policy (audio files are immutable once uploaded)
      const cacheControl = response.headers.get('Cache-Control');
      expect(cacheControl).toBe('public, max-age=31536000, immutable');
    });
  });

  describe('📊 MIME Type Detection', () => {
    const audioFormats = [
      { ext: 'webm', mime: 'audio/webm' },
      { ext: 'mp3', mime: 'audio/mpeg' },
      { ext: 'wav', mime: 'audio/wav' },
      { ext: 'ogg', mime: 'audio/ogg' },
      { ext: 'flac', mime: 'audio/flac' },
    ];

    it.each(audioFormats)(
      'Detects $mime for .$ext files',
      async ({ ext, mime }) => {
        const audioBuffer = Buffer.from(`mock ${ext} audio`);
        const taskId = `task-${ext}`;
        const userId = 'test-user-123';
        const r2Key = `uploads/${userId}/${taskId}.${ext}`;
        const request = new Request(`http://localhost/api/v1/memo/audio/${taskId}`);

        const task = createMockTask({ taskId, userId, r2Key });

        const prepareMock = mockContext.env.DB.prepare as any;
        prepareMock.mockReturnValue({
          bind: vi.fn().mockReturnValue({
            first: vi.fn().mockResolvedValue(task),
          }),
        });

        const r2Object = createMockR2Object(audioBuffer);
        (mockContext.env.R2_BUCKET.get as any).mockResolvedValue(r2Object);

        mockContext.data.userId = userId;

        // Execute
        const response = await handleGetAudio(request, mockContext);

        // Assert
        expect(response.status).toBe(200);
        expect(response.headers.get('Content-Type')).toBe(mime);
      }
    );

    it('Defaults to audio/webm for unknown extensions', async () => {
      const audioBuffer = Buffer.from('mock audio');
      const taskId = 'task-unknown';
      const userId = 'test-user-123';
      const r2Key = `uploads/${userId}/${taskId}.unknown`;
      const request = new Request(`http://localhost/api/v1/memo/audio/${taskId}`);

      const task = createMockTask({ taskId, userId, r2Key });

      const prepareMock = mockContext.env.DB.prepare as any;
      prepareMock.mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue(task),
        }),
      });

      const r2Object = createMockR2Object(audioBuffer);
      (mockContext.env.R2_BUCKET.get as any).mockResolvedValue(r2Object);

      mockContext.data.userId = userId;

      // Execute
      const response = await handleGetAudio(request, mockContext);

      // Assert
      expect(response.headers.get('Content-Type')).toBe('audio/webm');
    });
  });

  describe('❌ Error Cases - Audio Not Found', () => {
    it('Returns 404 when task does not exist', async () => {
      const taskId = 'nonexistent-task-id';
      const request = new Request(`http://localhost/api/v1/memo/audio/${taskId}`);

      const prepareMock = mockContext.env.DB.prepare as any;
      prepareMock.mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue(null),
        }),
      });

      mockContext.data.userId = 'test-user-123';

      // Execute
      const response = await handleGetAudio(request, mockContext);

      // Assert
      expect(response.status).toBe(404);
      const data = await response.json() as any;
      expect(data.error).toBe('Not Found');
    });

    it('Returns 404 when audio file is missing from R2', async () => {
      const task = createMockTask();
      const request = new Request(`http://localhost/api/v1/memo/audio/${task.taskId}`);

      const prepareMock = mockContext.env.DB.prepare as any;
      prepareMock.mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue(task),
        }),
      });

      // R2 file is missing
      (mockContext.env.R2_BUCKET.get as any).mockResolvedValue(null);

      mockContext.data.userId = task.userId;

      // Execute
      const response = await handleGetAudio(request, mockContext);

      // Assert
      expect(response.status).toBe(404);
    });

    it('Returns 500 if R2 retrieval fails (dependency error)', async () => {
      const task = createMockTask();
      const request = new Request(`http://localhost/api/v1/memo/audio/${task.taskId}`);

      const prepareMock = mockContext.env.DB.prepare as any;
      prepareMock.mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue(task),
        }),
      });

      // R2 retrieval fails - internal dependency error
      (mockContext.env.R2_BUCKET.get as any).mockRejectedValue(
        new Error('R2 connection failed')
      );

      mockContext.data.userId = task.userId;

      // Execute
      const response = await handleGetAudio(request, mockContext);

      // Assert - 500 for internal/dependency failures
      expect(response.status).toBe(500);
    });
  });

  describe('🔐 Authentication & Authorization', () => {
    it('Returns 401 when user is not authenticated (fails fast, no I/O)', async () => {
      const taskId = 'c7a2b0e8-5f6a-4b9a-8f0c-1b2d3c4e5f6a';
      const request = new Request(`http://localhost/api/v1/memo/audio/${taskId}`);

      mockContext.data.userId = undefined; // No auth

      // Execute
      const response = await handleGetAudio(request, mockContext);

      // Assert - 401 response
      expect(response.status).toBe(401);
      const data = await response.json() as any;
      expect(data.error).toBe('Unauthorized');

      // Assert - No I/O was attempted (fail fast)
      expect(mockContext.env.DB.prepare).not.toHaveBeenCalled();
      expect(mockContext.env.R2_BUCKET.get).not.toHaveBeenCalled();
    });

    it('Prevents access to audio files of other users (404 after auth, no R2 access)', async () => {
      const task = createMockTask({ userId: 'user-alice' });
      const request = new Request(`http://localhost/api/v1/memo/audio/${task.taskId}`);

      const prepareMock = mockContext.env.DB.prepare as any;
      prepareMock.mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue(task),
        }),
      });

      mockContext.data.userId = 'user-bob'; // Different user

      // Execute
      const response = await handleGetAudio(request, mockContext);

      // Assert - 404 because task belongs to different user
      expect(response.status).toBe(404);

      // Assert - DB was queried to check ownership
      expect(mockContext.env.DB.prepare).toHaveBeenCalled();

      // Assert - R2 was NOT accessed (fail fast after auth check)
      expect(mockContext.env.R2_BUCKET.get).not.toHaveBeenCalled();
    });
  });

  describe('🔄 Database Query Verification', () => {
    it('Queries database with correct SQL and taskId binding', async () => {
      const audioBuffer = Buffer.from('mock audio');
      const task = createMockTask();
      const request = new Request(`http://localhost/api/v1/memo/audio/${task.taskId}`);

      const prepareMock = mockContext.env.DB.prepare as any;
      const firstMock = vi.fn().mockResolvedValue(task);
      const bindMock = vi.fn().mockReturnValue({ first: firstMock });
      prepareMock.mockReturnValue({ bind: bindMock });

      const r2Object = createMockR2Object(audioBuffer);
      (mockContext.env.R2_BUCKET.get as any).mockResolvedValue(r2Object);

      mockContext.data.userId = task.userId;

      // Execute
      await handleGetAudio(request, mockContext);

      // Assert prepare was called with SELECT query
      expect(prepareMock).toHaveBeenCalled();
      const sqlCall = prepareMock.mock.calls[0][0];
      expect(sqlCall).toContain('SELECT');
      expect(sqlCall).toContain('WHERE taskId = ?');

      // Assert bind was called with taskId
      expect(bindMock).toHaveBeenCalledWith(task.taskId);

      // Assert first() was called
      expect(firstMock).toHaveBeenCalled();
    });
  });

});
