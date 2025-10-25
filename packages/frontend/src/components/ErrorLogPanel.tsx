/**
 * ErrorLogPanel - Display workflow errors in a dedicated panel
 *
 * Shows:
 * - Stage name
 * - Error message
 * - Timestamp
 * - Copy to clipboard
 * - Dismiss individual or all errors
 */

import { WorkflowError } from '../types/websocket'
import { useState } from 'react'

interface ErrorLogPanelProps {
  errors: WorkflowError[]
  onClearErrors?: () => void
}

export function ErrorLogPanel({ errors, onClearErrors }: ErrorLogPanelProps) {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)

  if (errors.length === 0) {
    return null
  }

  const handleCopy = (message: string, idx: number) => {
    navigator.clipboard.writeText(message)
    setCopiedIndex(idx)
    setTimeout(() => setCopiedIndex(null), 2000)
  }

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp)
    return date.toLocaleTimeString()
  }

  const stageLabel = (stage: string): string => {
    const labels: Record<string, string> = {
      workflow: 'WF',
      transcribe: 'TR',
      extract: 'EX',
      generate: 'GN',
      db_update: 'DB',
    }
    return labels[stage] || '?'
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-red-400">Errors</h4>
        {errors.length > 0 && (
          <button
            onClick={onClearErrors}
            className="text-xs px-2 py-1 bg-red-500/20 text-red-300 rounded hover:bg-red-500/30 transition"
          >
            Clear all
          </button>
        )}
      </div>

      <div className="space-y-2 max-h-48 overflow-y-auto">
        {errors.map((error, idx) => (
          <div
            key={idx}
            className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm"
          >
            {/* Stage and timestamp */}
            <div className="flex items-start justify-between mb-2">
              <div className="font-semibold text-red-400">
                {stageLabel(error.stage)} {error.stage}
              </div>
              <div className="text-xs text-red-300/60">{formatTime(error.timestamp)}</div>
            </div>

            {/* Error message */}
            <div className="text-red-300 text-xs mb-2">{error.message}</div>

            {/* Actions */}
            <div className="flex gap-2 text-xs">
              <button
                onClick={() => handleCopy(error.message, idx)}
                className="px-2 py-1 bg-red-500/20 text-red-300 rounded hover:bg-red-500/30 transition"
              >
                {copiedIndex === idx ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>
        ))}
      </div>

      {errors.length > 0 && (
        <div className="text-xs text-red-300 bg-red-500/5 border border-red-500/20 rounded p-2">
          <span className="font-semibold">{errors.length}</span> error
          {errors.length !== 1 ? 's' : ''} encountered during processing
        </div>
      )}
    </div>
  )
}
