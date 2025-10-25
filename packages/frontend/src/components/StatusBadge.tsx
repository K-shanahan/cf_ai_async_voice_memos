/**
 * StatusBadge - Display memo processing status
 */

interface StatusBadgeProps {
  status: 'pending' | 'processing' | 'completed' | 'failed'
  processingTimeSeconds?: number
}

export function StatusBadge({ status, processingTimeSeconds }: StatusBadgeProps) {
  const configs = {
    pending: {
      bg: 'bg-yellow-500/20',
      text: 'text-yellow-400',
      label: 'Processing...',
    },
    processing: {
      bg: 'bg-blue-500/20',
      text: 'text-blue-400',
      label: 'Processing...',
    },
    completed: {
      bg: 'bg-green-500/20',
      text: 'text-green-400',
      label: 'Complete',
    },
    failed: {
      bg: 'bg-red-500/20',
      text: 'text-red-400',
      label: 'Failed',
    },
  }

  const config = configs[status]

  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full ${config.bg}`}>
      <span className={`text-sm font-semibold ${config.text}`}>{config.label}</span>
      {processingTimeSeconds && (
        <span className={`text-xs ${config.text}`}>({processingTimeSeconds}s)</span>
      )}
    </div>
  )
}
