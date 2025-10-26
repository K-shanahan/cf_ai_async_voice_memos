/**
 * StatusBadge - Display memo processing status
 */

interface StatusBadgeProps {
  status: 'pending' | 'processing' | 'completed' | 'failed'
  processingTimeSeconds?: number
  customLabel?: string
}

export function StatusBadge({ status, processingTimeSeconds, customLabel }: StatusBadgeProps) {
  const configs = {
    pending: {
      bg: 'bg-yellow-500/20',
      text: 'text-yellow-400',
      label: 'Pending',
    },
    processing: {
      bg: 'bg-blue-500/20',
      text: 'text-blue-400',
      label: 'Processing',
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
  const label = customLabel || config.label

  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full ${config.bg}`}>
      <span className={`text-sm font-semibold ${config.text}`}>{label}</span>
      {processingTimeSeconds && (
        <span className={`text-xs ${config.text}`}>({processingTimeSeconds}s)</span>
      )}
    </div>
  )
}
