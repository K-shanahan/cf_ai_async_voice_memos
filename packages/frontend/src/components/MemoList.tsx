/**
 * MemoList - Display list of all user memos split into processing and completed sections
 */

import { useMemoStatus } from '../hooks/useMemoStatus'
import { MemoCard } from './MemoCard'

interface MemoListProps {
  onMemoClick?: (taskId: string) => void
  isLoading?: boolean
}

export function MemoList({ onMemoClick, isLoading: externalLoading }: MemoListProps) {
  const { processingMemos, completedMemos, isLoadingInitial } = useMemoStatus()

  if (externalLoading || isLoadingInitial) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-32 bg-slate-700/50 border border-slate-600 rounded-lg animate-pulse"
          ></div>
        ))}
      </div>
    )
  }

  if (processingMemos.length === 0 && completedMemos.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-300 font-semibold mb-2">No memos yet</p>
        <p className="text-slate-400 text-sm">Record your first memo to get started</p>
      </div>
    )
  }

  // Sort memos by creation date, most recent first
  const sortedProcessing = [...processingMemos].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )
  const sortedCompleted = [...completedMemos].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )

  return (
    <div className="space-y-6">
      {/* Processing Memos Section */}
      {sortedProcessing.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
            <span className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></span>
            Processing
          </h3>
          <div className="space-y-3">
            {sortedProcessing.map((memo) => (
              <MemoCard
                key={memo.taskId}
                memo={memo}
                onClick={() => onMemoClick?.(memo.taskId)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Completed Memos Section */}
      {sortedCompleted.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
            <span className="w-2 h-2 bg-green-400 rounded-full"></span>
            Completed
          </h3>
          <div className="space-y-3">
            {sortedCompleted.map((memo) => (
              <MemoCard
                key={memo.taskId}
                memo={memo}
                onClick={() => onMemoClick?.(memo.taskId)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Empty state when all memos are processing or completed */}
      {processingMemos.length === 0 && completedMemos.length === 0 && (
        <div className="text-center py-12">
          <p className="text-slate-300 font-semibold mb-2">No memos yet</p>
          <p className="text-slate-400 text-sm">Record your first memo to get started</p>
        </div>
      )}
    </div>
  )
}
