/**
 * Utility functions for memo list management
 */

import type { MemoSummary } from '../types/api'

export interface SeparatedMemos {
  processing: MemoSummary[]
  completed: MemoSummary[]
}

/**
 * Separate memos into processing and completed groups
 * Processing: pending, processing statuses
 * Completed: completed, failed statuses
 */
export function separateMemosByStatus(memos: MemoSummary[]): SeparatedMemos {
  const processing: MemoSummary[] = []
  const completed: MemoSummary[] = []

  for (const memo of memos) {
    if (memo.status === 'pending' || memo.status === 'processing') {
      processing.push(memo)
    } else {
      // completed or failed
      completed.push(memo)
    }
  }

  return { processing, completed }
}
