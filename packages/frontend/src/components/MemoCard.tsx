/**
 * MemoCard - Display individual memo in list
 */

import { MemoSummary } from '../types/api'
import { StatusBadge } from './StatusBadge'
import { formatDistanceToNow, parseISO } from 'date-fns'

interface MemoCardProps {
  memo: MemoSummary
  onClick?: () => void
}

export function MemoCard({ memo, onClick }: MemoCardProps) {
  const createdDate = parseISO(memo.createdAt)
  const timeAgo = formatDistanceToNow(createdDate, { addSuffix: true })
  const transcriptionPreview = memo.transcription?.substring(0, 100) || 'No transcription yet'

  return (
    <button
      onClick={onClick}
      className="block w-full text-left p-4 bg-slate-700/50 hover:bg-slate-700 border border-slate-600 rounded-lg transition hover:border-slate-500"
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-sm text-slate-400">{timeAgo}</span>
          </div>
          <StatusBadge status={memo.status} processingTimeSeconds={memo.processingTimeSeconds} />
        </div>
      </div>

      <p className="text-slate-300 text-sm mb-2 line-clamp-2">{transcriptionPreview}</p>

      {memo.taskCount !== undefined && (
        <div className="text-xs text-slate-400">
          {memo.taskCount} task{memo.taskCount !== 1 ? 's' : ''} extracted
        </div>
      )}
    </button>
  )
}
