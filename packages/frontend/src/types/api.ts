/**
 * API response types matching backend contracts
 */

export interface MemoListResponse {
  memos: MemoSummary[]
  total: number
  hasMore: boolean
}

export interface MemoSummary {
  taskId: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  createdAt: string
  updatedAt: string
  transcription?: string
  taskCount?: number
  processingTimeSeconds?: number
}

export interface MemoDetailResponse {
  taskId: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  createdAt: string
  updatedAt: string
  transcription?: string
  processedTasks?: ProcessedTask[]
  originalAudioUrl?: string
  errorMessage?: string
}

export interface ProcessedTask {
  task: string
  due: string | null
  generative_task_prompt: string | null
  generated_content?: string
}

export interface UploadMemoResponse {
  taskId: string
  status: 'pending'
  statusUrl: string
}

export interface ApiError {
  message: string
  status?: number
  code?: string
}
