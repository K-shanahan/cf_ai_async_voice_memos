import { MemoDetailResponse } from '../types/api'
import { StatusUpdate, StageProgress } from '../types/websocket'

export type MemoStatus = 'pending' | 'processing' | 'completed' | 'failed'

export interface MemoStateItem extends MemoDetailResponse {
  status: MemoStatus
  stageProgress: StageProgress
}

export interface GlobalMemoState {
  memos: Record<string, MemoStateItem>
}

// Action types
export type MemoAction =
  | { type: 'MEMO_CREATED'; payload: { taskId: string; memo: MemoStateItem } }
  | { type: 'STATUS_UPDATE'; payload: StatusUpdate }
  | { type: 'MEMO_COMPLETED'; payload: { taskId: string; status: 'completed' | 'failed'; memo: MemoStateItem } }
  | { type: 'MEMO_DELETED'; payload: { taskId: string } }
  | { type: 'SET_MEMOS'; payload: MemoStateItem[] }

export const initialState: GlobalMemoState = {
  memos: {},
}

export function memoStatusReducer(
  state: GlobalMemoState,
  action: MemoAction
): GlobalMemoState {
  switch (action.type) {
    case 'MEMO_CREATED': {
      return {
        ...state,
        memos: {
          ...state.memos,
          [action.payload.taskId]: action.payload.memo,
        },
      }
    }

    case 'STATUS_UPDATE': {
      const { taskId } = action.payload
      const memo = state.memos[taskId]

      if (!memo) {
        // Silently ignore updates for memos we don't know about yet
        // This can happen if WebSocket delivers updates before list is fetched
        return state
      }

      const updated = { ...memo }
      const oldStatus = memo.status

      // Ensure stageProgress exists
      let stageProgress = updated.stageProgress || {
        transcribe: 'pending',
        extract: 'pending',
        generate: 'pending',
      }

      // Update stage progress if this is a stage update (not workflow or db_update)
      if (action.payload.stage && action.payload.stage !== 'workflow' && action.payload.stage !== 'db_update') {
        stageProgress = {
          ...stageProgress,
          [action.payload.stage]: action.payload.status === 'failed' ? 'failed' : action.payload.status,
        }

        // If any stage is 'started', mark memo as 'processing'
        if (action.payload.status === 'started' && oldStatus === 'pending') {
          updated.status = 'processing'
        }
      }

      updated.stageProgress = stageProgress

      // Store transcription when transcribe completes
      if (action.payload.stage === 'transcribe' && action.payload.status === 'completed' && action.payload.transcription) {
        updated.transcription = action.payload.transcription
      }

      // Update overall status if provided
      if (action.payload.overallStatus) {
        updated.status = action.payload.overallStatus
      }

      return {
        ...state,
        memos: {
          ...state.memos,
          [taskId]: updated,
        },
      }
    }

    case 'MEMO_COMPLETED': {
      return {
        ...state,
        memos: {
          ...state.memos,
          [action.payload.taskId]: {
            ...action.payload.memo,
            status: action.payload.status,
          },
        },
      }
    }

    case 'MEMO_DELETED': {
      const { [action.payload.taskId]: deleted, ...remaining } = state.memos
      return {
        ...state,
        memos: remaining,
      }
    }

    case 'SET_MEMOS': {
      const memos: Record<string, MemoStateItem> = {}
      for (const memo of action.payload) {
        memos[memo.taskId] = {
          ...memo,
          stageProgress: memo.stageProgress || {
            transcribe: memo.status === 'completed' ? 'completed' : 'pending',
            extract: memo.status === 'completed' ? 'completed' : 'pending',
            generate: memo.status === 'completed' ? 'completed' : 'pending',
          },
        }
      }
      return {
        ...state,
        memos,
      }
    }

    default:
      return state
  }
}
