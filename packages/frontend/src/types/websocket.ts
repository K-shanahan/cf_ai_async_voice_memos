/**
 * WebSocket event types for real-time task status updates
 * Mirrors the backend StatusUpdate interface
 */

export type WorkflowStage = 'workflow' | 'transcribe' | 'extract' | 'generate' | 'db_update'
export type UpdateStatus = 'started' | 'completed' | 'failed'
export type StageStatus = 'pending' | 'started' | 'completed' | 'failed'
export type ConnectionStatus = 'connected' | 'disconnected' | 'reconnecting'

export interface StatusUpdate {
  taskId: string
  stage: WorkflowStage
  status: UpdateStatus
  timestamp: number
  duration_ms?: number
  error_message?: string
  overallStatus?: 'completed' | 'failed' // Final workflow status when workflow completes
  transcription?: string // Transcription text (included when transcribe completes)
}

export interface HistoryMessage {
  type: 'history'
  updates: StatusUpdate[]
  taskCompleted: boolean
}

export type WebSocketMessage = StatusUpdate | HistoryMessage

export interface StageProgress {
  transcribe: StageStatus
  extract: StageStatus
  generate: StageStatus
  // db_update is internal-only, not exposed to UI
}

export interface WorkflowError {
  stage: WorkflowStage
  message: string
  timestamp: number
}
