/**
 * MemoDetail - Full memo view with transcription, tasks, and actions
 * Real-time updates via global MemoStatusProvider context
 */

import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@clerk/clerk-react'
import { useMemoStatus } from '../hooks/useMemoStatus'
import { AudioPlayer } from './AudioPlayer'
import { DeleteConfirmation } from './DeleteConfirmation'
import { StatusBadge } from './StatusBadge'
import { WorkflowProgressIndicator } from './WorkflowProgressIndicator'
import { MarkdownContent } from './MarkdownContent'
import { ProcessedTask, MemoDetailResponse } from '../types/api'
import { MEMO_QUERY_KEYS } from '../hooks/useMemoApi'
import { apiRequest } from '../utils/apiClient'
import { formatDistanceToNow, parseISO } from 'date-fns'

interface MemoDetailProps {
  taskId: string
  onClose?: () => void
  onDelete?: () => void
}

export function MemoDetail({ taskId, onClose, onDelete }: MemoDetailProps) {
  const { state, startMonitoring, stopMonitoring } = useMemoStatus()
  const { getToken } = useAuth()
  const memo = state.memos[taskId]

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [copied, setCopied] = useState(false)

  // Fetch full memo details (including processedTasks) when memo is selected
  const { data: detailedMemo, isLoading: isLoadingDetails } = useQuery<MemoDetailResponse>({
    queryKey: MEMO_QUERY_KEYS.detail(taskId),
    queryFn: async () => {
      const token = await getToken()
      if (!token) throw new Error('No authentication token')
      return apiRequest<MemoDetailResponse>(`/api/v1/memo/${taskId}`, {}, token)
    },
    enabled: !!taskId,
    staleTime: Infinity,
  })

  // Merge state memo (with real-time updates) with detailed memo (with full data)
  const displayMemo = memo ? {
    ...memo,
    // Override with detailed data if available (processedTasks, etc)
    ...(detailedMemo ? {
      transcription: detailedMemo.transcription ?? memo.transcription,
      processedTasks: detailedMemo.processedTasks ?? memo.processedTasks,
      originalAudioUrl: detailedMemo.originalAudioUrl,
      errorMessage: detailedMemo.errorMessage,
    } : {})
  } : detailedMemo

  // Start WebSocket monitoring when component mounts
  useEffect(() => {
    if (taskId) {
      startMonitoring(taskId)
    }
    return () => {
      if (taskId) {
        stopMonitoring(taskId)
      }
    }
  }, [taskId, startMonitoring, stopMonitoring])

  // Show loading skeleton while waiting for detailed memo
  if (isLoadingDetails || !displayMemo) {
    return (
      <div className="space-y-4">
        <div className="h-8 bg-slate-700/50 rounded animate-pulse w-1/3"></div>
        <div className="h-20 bg-slate-700/50 rounded animate-pulse"></div>
        <div className="space-y-2">
          <div className="h-6 bg-slate-700/50 rounded animate-pulse w-1/4"></div>
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 bg-slate-700/50 border border-slate-600 rounded-lg animate-pulse"></div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // If memo is still pending/processing, show only the timeline
  if (displayMemo.status === 'pending' || displayMemo.status === 'processing') {
    // Build stage progress from memo's stageProgress, or default to pending
    const stageProgress = (displayMemo as any).stageProgress || {
      transcribe: 'pending',
      extract: 'pending',
      generate: 'pending',
    }

    return (
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-2xl font-bold text-white">Processing Memo</h2>
          {onClose && (
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white text-2xl"
              aria-label="Close"
            >
              ×
            </button>
          )}
        </div>

        <div className="p-4 bg-slate-700/30 border border-slate-600 rounded-lg">
          <WorkflowProgressIndicator stageProgress={stageProgress} />
        </div>
      </div>
    )
  }

  const createdDate = parseISO(displayMemo.createdAt)
  const timeAgo = formatDistanceToNow(createdDate, { addSuffix: true })

  // Check if this is a "no speech detected" error (from memo status if failed)
  const hasNoSpeechError = displayMemo.status === 'failed'
  const statusLabel = hasNoSpeechError ? 'No speech detected' : undefined

  const handleCopyTranscription = () => {
    if (displayMemo.transcription) {
      navigator.clipboard.writeText(displayMemo.transcription)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h2 className="text-2xl font-bold text-white">Memo Details</h2>
            <StatusBadge status={displayMemo.status} customLabel={statusLabel} />
          </div>
          <p className="text-slate-400 text-sm">{timeAgo}</p>
        </div>

        {onClose && (
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white text-2xl"
            aria-label="Close"
          >
            ×
          </button>
        )}
      </div>

      {/* No Speech Detected Error */}
      {displayMemo.status === 'failed' && (
        <div className="p-4 bg-red-500/10 border border-red-500 rounded-lg">
          <p className="text-red-400 text-sm font-semibold">No speech detected in audio</p>
        </div>
      )}

      {/* Transcription */}
      {displayMemo.transcription && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-white">Transcription</h3>
            <button
              onClick={handleCopyTranscription}
              className="text-xs px-2 py-1 bg-slate-700 text-slate-300 rounded hover:bg-slate-600"
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <div className="p-4 bg-slate-700/50 border border-slate-600 rounded-lg">
            <p className="text-slate-100 text-sm leading-relaxed">{displayMemo.transcription}</p>
          </div>
        </div>
      )}

      {/* Extracted Tasks */}
      {displayMemo.processedTasks && displayMemo.processedTasks.length > 0 ? (
        <div className="space-y-2">
          <h3 className="text-lg font-semibold text-white">Extracted Tasks</h3>
          <div className="space-y-2">
            {displayMemo.processedTasks.map((task: ProcessedTask, idx: number) => (
              <div
                key={idx}
                className="p-4 bg-slate-700/50 border border-slate-600 rounded-lg"
              >
                <p className="text-slate-100 font-semibold mb-1">{task.task}</p>
                {task.due && (
                  <p className="text-slate-400 text-sm mb-1">Due: {new Date(task.due).toLocaleDateString()}</p>
                )}
                {task.generated_content && (
                  <div className="mt-2 pt-2 border-t border-slate-600">
                    <MarkdownContent content={task.generated_content} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Audio Player */}
      <div className="space-y-2">
        <h3 className="text-lg font-semibold text-white">Audio</h3>
        <AudioPlayer key={taskId} taskId={taskId} />
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-4 border-t border-slate-700">
        {(memo.status === 'completed' || memo.status === 'failed') && (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="px-4 py-2 bg-red-500/20 text-red-400 rounded hover:bg-red-500/30 transition font-semibold"
          >
            Delete
          </button>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      <DeleteConfirmation
        taskId={taskId}
        isOpen={showDeleteConfirm}
        onCancel={() => setShowDeleteConfirm(false)}
        onConfirm={() => {
          setShowDeleteConfirm(false)
          onDelete?.()
        }}
      />
    </div>
  )
}
