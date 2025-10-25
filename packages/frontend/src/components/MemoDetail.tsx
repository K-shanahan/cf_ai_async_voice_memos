/**
 * MemoDetail - Full memo view with transcription, tasks, and actions
 * Real-time updates via WebSocket with fallback to polling
 */

import { useState } from 'react'
import { useWebSocketMemo } from '../hooks/useWebSocketMemo'
import { AudioPlayer } from './AudioPlayer'
import { DeleteConfirmation } from './DeleteConfirmation'
import { StatusBadge } from './StatusBadge'
import { WorkflowProgressIndicator } from './WorkflowProgressIndicator'
import { ErrorLogPanel } from './ErrorLogPanel'
import { ConnectionStatusBadge } from './ConnectionStatusBadge'
import { MarkdownContent } from './MarkdownContent'
import { ProcessedTask } from '../types/api'
import { formatDistanceToNow, parseISO } from 'date-fns'

interface MemoDetailProps {
  taskId: string
  onClose?: () => void
  onDelete?: () => void
}

export function MemoDetail({ taskId, onClose, onDelete }: MemoDetailProps) {
  const {
    memo,
    isLoading,
    error,
    stageProgress,
    errors,
    clearErrors,
    connectionStatus,
    isUsingFallback,
  } = useWebSocketMemo(taskId)

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [copied, setCopied] = useState(false)

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 bg-slate-700/50 rounded animate-pulse w-1/3"></div>
        <div className="h-20 bg-slate-700/50 rounded animate-pulse"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4 bg-red-500/10 border border-red-500 rounded-lg">
        <p className="text-red-400 font-semibold mb-2">Failed to load memo</p>
        <p className="text-red-300 text-sm">{error.message}</p>
      </div>
    )
  }

  if (!memo) {
    return null
  }

  // If memo is still pending, show only the timeline
  if (memo.status === 'pending') {
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

        {/* {connectionStatus !== 'connected' && (
          <ConnectionStatusBadge
            status={connectionStatus}
            isUsingFallback={isUsingFallback}
          />
        )} */}

        <div className="p-4 bg-slate-700/30 border border-slate-600 rounded-lg">
          <WorkflowProgressIndicator stageProgress={stageProgress} />
        </div>

        {errors.length > 0 && (
          <ErrorLogPanel errors={errors} onClearErrors={clearErrors} />
        )}
      </div>
    )
  }

  const createdDate = parseISO(memo.createdAt)
  const timeAgo = formatDistanceToNow(createdDate, { addSuffix: true })
  const processingTime = memo.updatedAt
    ? Math.round(
        (new Date(memo.updatedAt).getTime() - new Date(memo.createdAt).getTime()) / 1000
      )
    : undefined

  const handleCopyTranscription = () => {
    if (memo.transcription) {
      navigator.clipboard.writeText(memo.transcription)
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
            <StatusBadge status={memo.status} processingTimeSeconds={processingTime} />
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

      {/* Error Log Panel - Only show if there are errors */}
      {errors.length > 0 && (
        <ErrorLogPanel errors={errors} onClearErrors={clearErrors} />
      )}

      {/* Transcription */}
      {memo.transcription ? (
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
            <p className="text-slate-100 text-sm leading-relaxed">{memo.transcription}</p>
          </div>
        </div>
      ) : (
        <div className="p-4 bg-yellow-500/10 border border-yellow-500 rounded-lg">
          <p className="text-yellow-400 text-sm">Transcription not yet available. Still processing...</p>
        </div>
      )}

      {/* Extracted Tasks */}
      {memo.processedTasks && memo.processedTasks.length > 0 ? (
        <div className="space-y-2">
          <h3 className="text-lg font-semibold text-white">Extracted Tasks</h3>
          <div className="space-y-2">
            {memo.processedTasks.map((task: ProcessedTask, idx: number) => (
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
      ) : memo.status === 'completed' ? (
        <div className="p-4 bg-slate-700/50 border border-slate-600 rounded-lg">
          <p className="text-slate-400 text-sm">No tasks extracted from this memo</p>
        </div>
      ) : (
        <div className="p-4 bg-blue-500/10 border border-blue-500 rounded-lg">
          <p className="text-blue-400 text-sm">Tasks will appear here once processing is complete</p>
        </div>
      )}

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
