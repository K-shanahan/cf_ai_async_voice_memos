import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMockContext, createAudioRequest, MockWorkerContext } from '../test-utils';
import { handlePostMemo } from '../handlers/memo';

describe('POST /api/v1/memo - Voice Memo Upload Handler', () => {
  let mockContext: MockWorkerContext;

  beforeEach(() => {
    mockContext = createMockContext();
  });

  describe('✅ Happy Path - Successful Upload', () => {
    it('Consolidated: Single successful upload creates R2 object, D1 record, and returns 202', async () => {
      // Setup
      const audioData = Buffer.from('mock audio file content here');
      const userId = 'test-user-123';
      const request = createAudioRequest(audioData, 'meeting.webm', 'audio/webm');

      mockContext.data.userId = userId;

      // Execute (ONCE)
      const response = await handlePostMemo(request, mockContext);

      // Assert Response Status
      expect(response.status).toBe(202);
      expect(response.statusText).toBe('Accepted');

      // Assert Response Body
      const responseData = await response.json() as any;
      const taskId = responseData.taskId;
      const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

      expect(taskId).toMatch(uuidPattern);
      expect(responseData.status).toBe('pending');
      expect(responseData.statusUrl).toBe(`/api/v1/memo/${taskId}`); // <-- Correlated!

      // Assert R2 Upload was called with CORRECT parameters
      const prepareMock = mockContext.env.DB.prepare as any;
      const r2Bucket = mockContext.env.R2_BUCKET;

      expect(r2Bucket.put).toHaveBeenCalledOnce();
      const r2PutCall = (r2Bucket.put as any).mock.calls[0];
      const r2Key = r2PutCall[0];
      const uploadedBuffer = r2PutCall[1];

      // Verify R2 key has correct format with SAME taskId
      expect(r2Key).toMatch(new RegExp(`^uploads/${userId}/${taskId}\\.webm$`));
      // Verify the uploaded buffer contains the same data
      expect(new Uint8Array(uploadedBuffer as ArrayBuffer)).toEqual(new Uint8Array(audioData));

      // Assert D1 Insert was called with CORRECT parameters
      expect(prepareMock).toHaveBeenCalledOnce();
      const sqlStatement = prepareMock.mock.calls[0][0];
      expect(sqlStatement).toContain('INSERT INTO tasks');
      expect(sqlStatement).toContain('taskId');
      expect(sqlStatement).toContain('userId');
      expect(sqlStatement).toContain('status');
      expect(sqlStatement).toContain('r2Key');

      // Assert D1 bind was called with CORRECT parameters (correlated!)
      const bindMock = (prepareMock.mock.results[0].value).bind as any;
      expect(bindMock).toHaveBeenCalledOnce();
      const bindCall = bindMock.mock.calls[0];

      expect(bindCall[0]).toBe(taskId); // taskId
      expect(bindCall[1]).toBe(userId); // userId
      expect(bindCall[2]).toBe('pending'); // status
      expect(bindCall[3]).toBe(r2Key); // r2Key - SAME as R2!

      // Assert D1 run() was actually executed
      const runMock = (bindMock.mock.results[0].value).run as any;
      expect(runMock).toHaveBeenCalledOnce();
    });
  });

  describe('❌ User Input Validation Errors', () => {
    it('Missing authentication → 401 Unauthorized', async () => {
      const request = createAudioRequest();
      mockContext.data.userId = undefined; // No auth

      const response = await handlePostMemo(request, mockContext);

      expect(response.status).toBe(401);
      const data = await response.json() as any;
      expect(data.error).toBe('Unauthorized');
      expect(data.message).toContain('User ID not found');
    });

    it('Missing audio file → 400 Bad Request with specific message', async () => {
      const formData = new FormData();
      // No file added
      const request = new Request('http://localhost/api/v1/memo', {
        method: 'POST',
        body: formData,
      });

      const response = await handlePostMemo(request, mockContext);

      expect(response.status).toBe(400);
      const data = await response.json() as any;
      expect(data.error).toBe('Bad Request');
      expect(data.message).toContain('No audio file provided');
    });

    it('Empty audio file → 400 Bad Request with specific message', async () => {
      const request = createAudioRequest(Buffer.alloc(0), 'empty.webm');

      const response = await handlePostMemo(request, mockContext);

      expect(response.status).toBe(400);
      const data = await response.json() as any;
      expect(data.error).toBe('Bad Request');
      expect(data.message).toContain('Audio file is empty');
    });

    it('File exceeds size limit → 413 Payload Too Large', async () => {
      const oversizedBuffer = Buffer.alloc(51 * 1024 * 1024); // 51MB (exceeds 50MB limit)
      const request = createAudioRequest(oversizedBuffer, 'toolarge.webm');

      const response = await handlePostMemo(request, mockContext);

      expect(response.status).toBe(413);
      const data = await response.json() as any;
      expect(data.error).toBe('Payload Too Large');
      expect(data.message).toContain('exceeds maximum size');
    });

    it('Unsupported MIME type → 415 Unsupported Media Type', async () => {
      const request = createAudioRequest(
        Buffer.from('image data'),
        'notaudio.png',
        'image/png'
      );

      const response = await handlePostMemo(request, mockContext);

      expect(response.status).toBe(415);
      const data = await response.json() as any;
      expect(data.error).toBe('Unsupported Media Type');
      expect(data.message).toContain('image/png');
      expect(data.message).toContain('not supported');
    });

    it('Invalid Content-Type header → 400 Bad Request', async () => {
      const request = new Request('http://localhost/api/v1/memo', {
        method: 'POST',
        body: 'plain text',
        headers: { 'Content-Type': 'text/plain' },
      });

      const response = await handlePostMemo(request, mockContext);

      expect(response.status).toBe(400);
      const data = await response.json() as any;
      expect(data.error).toBe('Bad Request');
      expect(data.message).toContain('multipart/form-data');
    });
  });

  describe('💥 Server-Side Failures', () => {
    it('R2 upload fails → 500 Internal Server Error', async () => {
      const request = createAudioRequest();
      const r2Error = new Error('R2 connectivity error');
      (mockContext.env.R2_BUCKET.put as any).mockRejectedValueOnce(r2Error);

      const response = await handlePostMemo(request, mockContext);

      expect(response.status).toBe(500);
      const data = await response.json() as any;
      expect(data.error).toBe('Internal Server Error');
      expect(data.message).toContain('R2 connectivity error');
    });

    it('D1 prepare fails → 500 Internal Server Error', async () => {
      const request = createAudioRequest();
      const dbError = new Error('Database read-only');
      const prepareMock = mockContext.env.DB.prepare as any;
      prepareMock.mockImplementationOnce(() => {
        throw dbError;
      });

      const response = await handlePostMemo(request, mockContext);

      expect(response.status).toBe(500);
      const data = await response.json() as any;
      expect(data.error).toBe('Internal Server Error');
      expect(data.message).toContain('Database read-only');
    });

    it('D1 insert fails → 500 AND deletes orphaned R2 file (cleanup)', async () => {
      const request = createAudioRequest();
      const dbInsertError = new Error('Unique constraint violation');

      // Set up the mocks to fail on run()
      const prepareMock = mockContext.env.DB.prepare as any;
      const originalImplementation = prepareMock.getMockImplementation();
      prepareMock.mockImplementation(function() {
        return {
          bind: vi.fn(function() {
            return {
              run: vi.fn().mockRejectedValueOnce(dbInsertError),
              first: vi.fn(),
              all: vi.fn(),
            };
          }),
        };
      });

      const response = await handlePostMemo(request, mockContext);

      expect(response.status).toBe(500);
      const data = await response.json() as any;
      expect(data.error).toBe('Internal Server Error');

      // Verify R2 file was uploaded
      expect(mockContext.env.R2_BUCKET.put).toHaveBeenCalledOnce();
      const r2Key = (mockContext.env.R2_BUCKET.put as any).mock.calls[0][0];

      // Verify R2 file was DELETED (cleanup)
      expect(mockContext.env.R2_BUCKET.delete).toHaveBeenCalledOnce();
      expect(mockContext.env.R2_BUCKET.delete).toHaveBeenCalledWith(r2Key);
    });

    it('D1 cleanup fails after R2 upload error → logs error but still returns 500', async () => {
      const request = createAudioRequest();
      const dbError = new Error('DB constraint failed');
      const cleanupError = new Error('Cannot delete from R2');

      // Set up the mocks to fail on run()
      const prepareMock = mockContext.env.DB.prepare as any;
      prepareMock.mockImplementation(function() {
        return {
          bind: vi.fn(function() {
            return {
              run: vi.fn().mockRejectedValueOnce(dbError),
              first: vi.fn(),
              all: vi.fn(),
            };
          }),
        };
      });

      (mockContext.env.R2_BUCKET.delete as any).mockRejectedValueOnce(cleanupError);

      // Spy on console.error
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const response = await handlePostMemo(request, mockContext);

      // Still returns 500 despite cleanup failure
      expect(response.status).toBe(500);
      const data = await response.json() as any;
      expect(data.error).toBe('Internal Server Error');

      // Verify cleanup was attempted
      expect(mockContext.env.R2_BUCKET.delete).toHaveBeenCalled();

      // Verify error was logged
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to cleanup R2 file'),
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe('📋 Edge Cases & Boundary Conditions', () => {
    it('Supports different audio MIME types (mp3)', async () => {
      const request = createAudioRequest(
        Buffer.from('mp3 data'),
        'song.mp3',
        'audio/mpeg'
      );

      const response = await handlePostMemo(request, mockContext);

      expect(response.status).toBe(202);
    });

    it('Supports different audio MIME types (wav)', async () => {
      const request = createAudioRequest(
        Buffer.from('wav data'),
        'recording.wav',
        'audio/wav'
      );

      const response = await handlePostMemo(request, mockContext);

      expect(response.status).toBe(202);
    });

    it('Accepts file at maximum size boundary (50MB)', async () => {
      const maxBuffer = Buffer.alloc(50 * 1024 * 1024); // Exactly 50MB
      const request = createAudioRequest(maxBuffer, 'large.webm');

      const response = await handlePostMemo(request, mockContext);

      expect(response.status).toBe(202);
    });

    it('Preserves original filename in R2 metadata', async () => {
      const request = createAudioRequest(
        Buffer.from('data'),
        'my-important-meeting.webm'
      );

      await handlePostMemo(request, mockContext);

      const r2PutCall = (mockContext.env.R2_BUCKET.put as any).mock.calls[0];
      const r2Key = r2PutCall[0];

      // Filename should be preserved in the key
      expect(r2Key).toContain('.webm');
    });

    it('Generates unique taskIds across multiple uploads', async () => {
      const request1 = createAudioRequest();
      const request2 = createAudioRequest();

      const response1 = await handlePostMemo(request1, mockContext);
      const response2 = await handlePostMemo(request2, mockContext);

      const taskId1 = (await response1.json() as any).taskId;
      const taskId2 = (await response2.json() as any).taskId;

      expect(taskId1).not.toBe(taskId2);
    });
  });

  describe('🔒 Security & Data Integrity', () => {
    it('Prevents directory traversal in filename (normalizes key)', async () => {
      const request = createAudioRequest(
        Buffer.from('data'),
        '../../../etc/passwd.webm'
      );

      const response = await handlePostMemo(request, mockContext);

      expect(response.status).toBe(202);
      const r2Key = (mockContext.env.R2_BUCKET.put as any).mock.calls[0][0];

      // Key should not contain parent directory traversal
      expect(r2Key).not.toContain('..');
      expect(r2Key).toMatch(/^uploads\/test-user-123\/[\da-f-]+\.webm$/);
    });

    it('Associates upload with authenticated user (prevents user spoofing)', async () => {
      const request = createAudioRequest();
      mockContext.data.userId = 'alice';

      await handlePostMemo(request, mockContext);

      // Verify R2 key contains alice's user ID
      const r2Key = (mockContext.env.R2_BUCKET.put as any).mock.calls[0][0];
      expect(r2Key).toContain('/alice/');

      // Verify D1 insert binds alice's user ID
      const prepareMock = mockContext.env.DB.prepare as any;
      const bindMock = (prepareMock.mock.results[0].value).bind as any;
      const bindCall = bindMock.mock.calls[0];
      expect(bindCall[1]).toBe('alice'); // userId parameter
    });
  });
});
