/**
 * Shared API Types for Voice Memo Task Manager
 */

/**
 * Task Status enum
 */
export type TaskStatus = 'pending' | 'processing' | 'completed' | 'failed';

/**
 * Core Task entity from database
 */
export interface Task {
  taskId: string;
  userId: string;
  status: TaskStatus;
  r2Key: string | null;
  transcription: string | null;
  processedTasks: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Individual extracted task structure
 */
export interface ExtractedTask {
  task: string;
  due: string | null;
  generative_task_prompt: string | null;
  generated_content?: string;
}

/**
 * API Response: POST /api/v1/memo
 */
export interface CreateMemoResponse {
  taskId: string;
  status: TaskStatus;
  statusUrl: string;
}

/**
 * API Response: GET /api/v1/memo/{taskId} (pending)
 */
export interface GetMemoPendingResponse {
  taskId: string;
  status: 'pending' | 'processing';
  createdAt: string;
  updatedAt: string;
}

/**
 * API Response: GET /api/v1/memo/{taskId} (completed)
 */
export interface GetMemoCompletedResponse {
  taskId: string;
  status: 'completed';
  createdAt: string;
  updatedAt: string;
  transcription: string;
  processedTasks: ExtractedTask[];
  originalAudioUrl: string;
}

/**
 * API Response: GET /api/v1/memo/{taskId} (failed)
 */
export interface GetMemoFailedResponse {
  taskId: string;
  status: 'failed';
  createdAt: string;
  updatedAt: string;
  errorMessage: string;
}

/**
 * Combined API Response: GET /api/v1/memo/{taskId}
 */
export type GetMemoResponse = GetMemoPendingResponse | GetMemoCompletedResponse | GetMemoFailedResponse;

/**
 * API Response: GET /api/v1/memos
 */
export interface MemoSummary {
  taskId: string;
  status: TaskStatus;
  createdAt: string;
  updatedAt: string;
  transcription?: string;
  taskCount?: number;
  processingTimeSeconds?: number;
}

export interface GetMemosResponse {
  memos: MemoSummary[];
  total: number;
  hasMore: boolean;
}

/**
 * API Error Response
 */
export interface ErrorResponse {
  error: string;
  message: string;
}
