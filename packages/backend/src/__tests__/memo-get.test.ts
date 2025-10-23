import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMockContext, MockWorkerContext } from '../test-utils';
import { handleGetMemo } from '../handlers/memo-get';

/**
 * Utility: Create a complete mock task record
 * Prevents brittle tests due to incomplete mock structure
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

describe('GET /api/v1/memo/{taskId} - Task Status & Results Endpoint', () => {
  let mockContext: MockWorkerContext;

  beforeEach(() => {
    mockContext = createMockContext();
  });

  describe('✅ Response Structure & Behavior', () => {
    it('Returns 200 with complete pending task (no transcription/processedTasks)', async () => {
      const taskId = 'c7a2b0e8-5f6a-4b9a-8f0c-1b2d3c4e5f6a';
      const request = new Request(`http://localhost/api/v1/memo/${taskId}`);
      const task = createMockTask({
        taskId,
        status: 'pending',
        transcription: null,
        processedTasks: null,
      });

      const prepareMock = mockContext.env.DB.prepare as any;
      prepareMock.mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue(task),
        }),
      });

      mockContext.data.userId = task.userId;

      // Execute
      const response = await handleGetMemo(request, mockContext);

      // Assert response
      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('application/json');

      const data = await response.json() as any;
      expect(data.taskId).toBe(taskId);
      expect(data.status).toBe('pending');
      expect(data.transcription).toBeUndefined();
      expect(data.processedTasks).toBeUndefined();
      expect(data.originalAudioUrl).toBeUndefined();
    });

    it('Returns 200 with complete completed task (includes transcription, processedTasks, audioUrl)', async () => {
      const taskId = 'c7a2b0e8-5f6a-4b9a-8f0c-1b2d3c4e5f6a';
      const request = new Request(`http://localhost/api/v1/memo/${taskId}`);

      const transcription = 'Remind me to email the client about the proposal and draft an outline.';
      const processedTasksJson = JSON.stringify([
        {
          task: 'Email client about proposal',
          due: '2025-10-23T10:00:00Z',
          generative_task_prompt: null,
        },
        {
          task: 'Draft outline',
          due: null,
          generative_task_prompt: 'Draft an outline for the proposal',
          generated_content: '1. Introduction\n2. Objectives\n3. Timeline',
        },
      ]);

      const task = createMockTask({
        taskId,
        status: 'completed',
        transcription,
        processedTasks: processedTasksJson,
      });

      const prepareMock = mockContext.env.DB.prepare as any;
      prepareMock.mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue(task),
        }),
      });

      mockContext.data.userId = task.userId;

      // Execute
      const response = await handleGetMemo(request, mockContext);

      // Assert response
      expect(response.status).toBe(200);

      const data = await response.json() as any;
      expect(data.taskId).toBe(taskId);
      expect(data.status).toBe('completed');
      expect(data.transcription).toBe(transcription);
      expect(Array.isArray(data.processedTasks)).toBe(true);
      expect(data.processedTasks).toHaveLength(2);
      expect(data.processedTasks[1].generated_content).toBe('1. Introduction\n2. Objectives\n3. Timeline');
      expect(data.originalAudioUrl).toBe(`/api/v1/memo/audio/${taskId}`);
    });

    it('Returns 200 with failed status (includes error, excludes transcription/processedTasks)', async () => {
      const taskId = 'c7a2b0e8-5f6a-4b9a-8f0c-1b2d3c4e5f6a';
      const request = new Request(`http://localhost/api/v1/memo/${taskId}`);

      const errorMessage = 'Failed to transcribe audio. File may be corrupt.';
      const task = createMockTask({
        taskId,
        status: 'failed',
        transcription: null,
        processedTasks: null,
        errorMessage,
      });

      const prepareMock = mockContext.env.DB.prepare as any;
      prepareMock.mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue(task),
        }),
      });

      mockContext.data.userId = task.userId;

      // Execute
      const response = await handleGetMemo(request, mockContext);

      // Assert response
      expect(response.status).toBe(200);

      const data = await response.json() as any;
      expect(data.taskId).toBe(taskId);
      expect(data.status).toBe('failed');
      expect(data.error).toBe(errorMessage);
      expect(data.transcription).toBeUndefined();
      expect(data.processedTasks).toBeUndefined();
      expect(data.originalAudioUrl).toBeUndefined();
    });
  });

  describe('❌ Error Cases', () => {
    it('Returns 404 when task does not exist', async () => {
      const taskId = 'nonexistent-task-id';
      const request = new Request(`http://localhost/api/v1/memo/${taskId}`);

      const prepareMock = mockContext.env.DB.prepare as any;
      prepareMock.mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue(null),
        }),
      });

      mockContext.data.userId = 'test-user-123';

      // Execute
      const response = await handleGetMemo(request, mockContext);

      // Assert
      expect(response.status).toBe(404);

      const data = await response.json() as any;
      expect(data.error).toBe('Not Found');
      expect(data.message).toContain('Task not found');
    });
  });

  describe('🔄 Database Query Verification', () => {
    it('Queries database with correct SQL and BOTH taskId AND userId bindings (security)', async () => {
      const taskId = 'c7a2b0e8-5f6a-4b9a-8f0c-1b2d3c4e5f6a';
      const userId = 'test-user-123';
      const request = new Request(`http://localhost/api/v1/memo/${taskId}`);

      const task = createMockTask({ taskId, userId, status: 'pending' });

      const prepareMock = mockContext.env.DB.prepare as any;
      const firstMock = vi.fn().mockResolvedValue(task);
      const bindMock = vi.fn().mockReturnValue({ first: firstMock });
      prepareMock.mockReturnValue({ bind: bindMock });

      mockContext.data.userId = userId;

      // Execute
      await handleGetMemo(request, mockContext);

      // Assert prepare was called with SELECT query
      expect(prepareMock).toHaveBeenCalled();
      const sqlCall = prepareMock.mock.calls[0][0];
      expect(sqlCall).toContain('SELECT');
      expect(sqlCall).toContain('WHERE taskId = ?');
      expect(sqlCall).toContain('AND userId = ?');

      // CRITICAL: Assert bind was called with BOTH taskId and userId
      expect(bindMock).toHaveBeenCalledWith(taskId, userId);

      // Assert first() was called to fetch single result
      expect(firstMock).toHaveBeenCalled();
    });
  });
});
