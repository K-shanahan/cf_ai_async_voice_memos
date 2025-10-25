/**
 * MemoList - Display list of all user memos
 */

import { useMemoList } from '../hooks/useMemoApi'
import { MemoCard } from './MemoCard'

interface MemoListProps {
  onMemoClick?: (taskId: string) => void
  isLoading?: boolean
}

export function MemoList({ onMemoClick, isLoading: externalLoading }: MemoListProps) {
  const { data: memos, isLoading, error, refetch } = useMemoList()

  const isLoadingState = externalLoading || isLoading

  if (isLoadingState) {
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

  if (error) {
    return (
      <div className="p-4 bg-red-500/10 border border-red-500 rounded-lg">
        <p className="text-red-400 font-semibold mb-3">Failed to load memos</p>
        <p className="text-red-300 text-sm mb-3">{error.message}</p>
        <button
          onClick={() => refetch()}
          className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
        >
          Try Again
        </button>
      </div>
    )
  }

  if (!memos || memos.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-300 font-semibold mb-2">No memos yet</p>
        <p className="text-slate-400 text-sm">Record your first memo to get started</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {memos.map((memo) => (
        <MemoCard key={memo.taskId} memo={memo} onClick={() => onMemoClick?.(memo.taskId)} />
      ))}
    </div>
  )
}
