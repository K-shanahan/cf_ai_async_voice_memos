/**
 * DeleteConfirmation - Modal for confirming memo deletion
 */

import { useDeleteMemo } from '../hooks/useMemoApi'

interface DeleteConfirmationProps {
  taskId: string
  onConfirm?: () => void
  onCancel?: () => void
  isOpen: boolean
}

export function DeleteConfirmation({ taskId, onConfirm, onCancel, isOpen }: DeleteConfirmationProps) {
  const deleteMemo = useDeleteMemo()

  if (!isOpen) {
    return null
  }

  const handleConfirm = async () => {
    try {
      await deleteMemo.mutateAsync(taskId)
      onConfirm?.()
    } catch (error) {
      console.error('Delete failed:', error)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-slate-800 rounded-lg p-6 max-w-sm border border-slate-700">
        <h3 className="text-lg font-bold text-white mb-2">Delete Memo?</h3>
        <p className="text-slate-300 text-sm mb-6">This action cannot be undone. The memo and audio file will be permanently deleted.</p>

        {deleteMemo.error && (
          <div className="p-3 bg-red-500/10 border border-red-500 rounded-lg text-red-400 text-sm mb-4">
            {deleteMemo.error.message || 'Delete failed'}
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            disabled={deleteMemo.isPending}
            className="flex-1 px-4 py-2 bg-slate-700 text-white rounded hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            Cancel
          </button>

          <button
            onClick={handleConfirm}
            disabled={deleteMemo.isPending}
            className="flex-1 px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition font-semibold"
          >
            {deleteMemo.isPending ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  )
}
