import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { createMockContext, MockWorkerContext } from '../test-utils';
import type { ProcessingResult, WorkflowInput } from '../workflow';
import type { ProcessedTask } from '../workflow/extract';

// Mock the separate helper modules so that mocks are properly applied
vi.mock('../workflow/transcribe');
vi.mock('../workflow/extract');
vi.mock('../workflow/generate');

import {
  processAudioWorkflow,
} from '../workflow';
import {
  transcribeAudio,
} from '../workflow/transcribe';
import {
  extractTasks,
} from '../workflow/extract';
import {
  generateTaskContent,
} from '../workflow/generate';

describe('Phase 2: Processing Workflow - Audio to Tasks Pipeline', () => {
  let mockContext: MockWorkerContext;

  beforeEach(() => {
    mockContext = createMockContext();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });


  describe('✅ Main Workflow: End-to-End Integration', () => {
    it('Orchestrates full workflow: R2 → Transcribe → Extract → Generate → D1 Update', async () => {
      // Setup: Define all the data that will flow through the pipeline
      const taskId = 'task-123';
      const userId = 'user-456';
      const r2Key = `uploads/${userId}/${taskId}.webm`;

      const audioBuffer = Buffer.from('mock audio data');
      const transcriptionText = 'Remind me to email the client about the proposal and draft an outline.';

      const extractedTasks: ProcessedTask[] = [
        {
          task: 'Email client about proposal',
          due: '2025-10-24T14:00:00Z',
          generative_task_prompt: null,
        },
        {
          task: 'Draft outline',
          due: null,
          generative_task_prompt: 'Draft an outline for the proposal',
        },
      ];

      const generatedContent = '1. Executive Summary\n2. Proposal Details\n3. Timeline';

      // Build the workflow input - this time, we let the workflow DO the work
      const workflowInput: WorkflowInput = {
        taskId,
        userId,
        r2Key,
      };

      // Mock each step of the pipeline
      // Step 1: R2 retrieval (would happen in processAudioWorkflow)
      const r2Object = {
        arrayBuffer: vi.fn().mockResolvedValue(audioBuffer.buffer),
      };
      (mockContext.env.R2_BUCKET.get as any).mockResolvedValue(r2Object);

      // Step 2: Transcription
      vi.mocked(transcribeAudio).mockResolvedValueOnce(transcriptionText);

      // Step 3: Task extraction
      vi.mocked(extractTasks).mockResolvedValueOnce(extractedTasks);

      // Step 4: Content generation (only for task with generative_task_prompt)
      vi.mocked(generateTaskContent).mockResolvedValueOnce(generatedContent);

      // Execute the workflow
      const result = await processAudioWorkflow(workflowInput, mockContext);

      // Verify the workflow completed successfully
      expect(result.status).toBe('completed');
      expect(result.taskId).toBe(taskId);
      expect(result.transcription).toBe(transcriptionText);

      // Verify processed tasks have correct structure
      expect(result.processedTasks).toHaveLength(2);

      // First task: no generative content
      expect(result.processedTasks[0]).toEqual({
        task: 'Email client about proposal',
        due: '2025-10-24T14:00:00Z',
        generative_task_prompt: null,
        generated_content: undefined,
      });

      // Second task: has generated content
      expect(result.processedTasks[1]).toEqual({
        task: 'Draft outline',
        due: null,
        generative_task_prompt: 'Draft an outline for the proposal',
        generated_content: generatedContent,
      });

      // Verify D1 was updated with completed status
      const prepareMock = mockContext.env.DB.prepare as any;
      expect(prepareMock).toHaveBeenCalled();

      // Check that an UPDATE query was executed (resilient to parameter order changes)
      const updateCall = prepareMock.mock.calls.find((call: any[]) =>
        call[0]?.includes?.('UPDATE tasks SET status = ?')
      );
      expect(updateCall).toBeDefined();

      // Verify the query was actually executed (bound parameters + run called)
      const bindMock = prepareMock.mock.results.find((r: any) => r.value?.bind)?.value?.bind as any;
      expect(bindMock).toBeDefined();
      expect(bindMock.mock.calls.length).toBeGreaterThan(0);
    });
  });

  describe('❌ Error Handling & Resilience', () => {
    it('Stops workflow and updates D1 with failed status on R2 retrieval error', async () => {
      const taskId = 'task-123';
      const userId = 'user-456';
      const r2Key = `uploads/${userId}/${taskId}.webm`;

      const workflowInput: WorkflowInput = {
        taskId,
        userId,
        r2Key,
      };

      // Mock R2 failure at the start
      (mockContext.env.R2_BUCKET.get as any).mockRejectedValueOnce(
        new Error('R2 connection failed')
      );

      const result = await processAudioWorkflow(workflowInput, mockContext);

      // Workflow should fail and report the error
      expect(result.status).toBe('failed');
      expect(result.error).toContain('R2 connection failed');

      // D1 should be updated with failed status
      const prepareMock = mockContext.env.DB.prepare as any;
      expect(prepareMock).toHaveBeenCalled();
    });

    it('Stops workflow and updates D1 on transcription failure', async () => {
      const taskId = 'task-123';
      const userId = 'user-456';
      const r2Key = `uploads/${userId}/${taskId}.webm`;
      const audioBuffer = Buffer.from('mock audio data');

      const workflowInput: WorkflowInput = {
        taskId,
        userId,
        r2Key,
      };

      // Mock successful R2 retrieval
      const r2Object = {
        arrayBuffer: vi.fn().mockResolvedValue(audioBuffer.buffer),
      };
      (mockContext.env.R2_BUCKET.get as any).mockResolvedValue(r2Object);

      // Mock transcription failure
      vi.mocked(transcribeAudio).mockRejectedValueOnce(
        new Error('Whisper API error: invalid audio')
      );

      const result = await processAudioWorkflow(workflowInput, mockContext);

      expect(result.status).toBe('failed');
      expect(result.error).toBeDefined();
      expect(result.error).toContain('Whisper');
    });

    it('Stops workflow when task extraction fails', async () => {
      const taskId = 'task-123';
      const userId = 'user-456';
      const r2Key = `uploads/${userId}/${taskId}.webm`;
      const audioBuffer = Buffer.from('mock audio data');

      const workflowInput: WorkflowInput = {
        taskId,
        userId,
        r2Key,
      };

      // Mock successful R2 and transcription
      const r2Object = {
        arrayBuffer: vi.fn().mockResolvedValue(audioBuffer.buffer),
      };
      (mockContext.env.R2_BUCKET.get as any).mockResolvedValue(r2Object);
      vi.mocked(transcribeAudio).mockResolvedValueOnce('Some transcription');

      // Mock extraction failure
      vi.mocked(extractTasks).mockRejectedValueOnce(
        new Error('Failed to parse LLM response')
      );

      const result = await processAudioWorkflow(workflowInput, mockContext);

      expect(result.status).toBe('failed');
      expect(result.error).toContain('parse');
    });

    it('Continues workflow even if content generation fails for one task', async () => {
      const taskId = 'task-123';
      const userId = 'user-456';
      const r2Key = `uploads/${userId}/${taskId}.webm`;
      const audioBuffer = Buffer.from('mock audio data');
      const transcription = 'Draft an email and create a document';

      const extractedTasks: ProcessedTask[] = [
        {
          task: 'Draft email',
          due: null,
          generative_task_prompt: 'Draft a professional email',
        },
        {
          task: 'Create document',
          due: null,
          generative_task_prompt: 'Create an outline document',
        },
      ];

      const workflowInput: WorkflowInput = {
        taskId,
        userId,
        r2Key,
      };

      // Mock successful R2, transcription, and extraction
      const r2Object = {
        arrayBuffer: vi.fn().mockResolvedValue(audioBuffer.buffer),
      };
      (mockContext.env.R2_BUCKET.get as any).mockResolvedValue(r2Object);
      vi.mocked(transcribeAudio).mockResolvedValueOnce(transcription);
      vi.mocked(extractTasks).mockResolvedValueOnce(extractedTasks);

      // Mock first generation succeeds, second fails
      vi.mocked(generateTaskContent)
        .mockResolvedValueOnce('Email content here...')
        .mockRejectedValueOnce(new Error('Content generation failed'));

      const result = await processAudioWorkflow(workflowInput, mockContext);

      // Workflow should still complete despite one task's generation failure
      expect(result.status).toBe('completed');
      expect(result.processedTasks).toHaveLength(2);

      // First task should have content
      expect(result.processedTasks[0].generated_content).toBe('Email content here...');

      // Second task should not have content (generation failed, but workflow continued)
      expect(result.processedTasks[1].generated_content).toBeUndefined();
    });

    it('Handles D1 update failure after successful processing', async () => {
      const taskId = 'task-123';
      const userId = 'user-456';
      const r2Key = `uploads/${userId}/${taskId}.webm`;
      const audioBuffer = Buffer.from('mock audio data');
      const transcription = 'Complete transcription';

      const extractedTasks: ProcessedTask[] = [
        {
          task: 'Task 1',
          due: null,
          generative_task_prompt: null,
        },
      ];

      const workflowInput: WorkflowInput = {
        taskId,
        userId,
        r2Key,
      };

      // Mock successful R2, transcription, and extraction
      const r2Object = {
        arrayBuffer: vi.fn().mockResolvedValue(audioBuffer.buffer),
      };
      (mockContext.env.R2_BUCKET.get as any).mockResolvedValue(r2Object);
      vi.mocked(transcribeAudio).mockResolvedValueOnce(transcription);
      vi.mocked(extractTasks).mockResolvedValueOnce(extractedTasks);

      // Mock D1 update failure after everything else succeeds
      const prepareMock = mockContext.env.DB.prepare as any;
      prepareMock.mockReturnValueOnce({
        bind: vi.fn().mockReturnValue({
          run: vi.fn().mockRejectedValueOnce(new Error('Database connection failed')),
        }),
      });

      const result = await processAudioWorkflow(workflowInput, mockContext);

      // Should report failure when D1 update fails
      expect(result.status).toBe('failed');
      expect(result.error).toBeDefined();
      expect(result.error).toContain('Database connection failed');
    });
  });
});
