/**
 * ConnectionStatusBadge - Show WebSocket connection status
 *
 * Only visible when:
 * - Disconnected (shows fallback polling message)
 * - Reconnecting (shows attempt message)
 *
 * Hidden when connected
 */

import { ConnectionStatus } from '../types/websocket'
import { useState } from 'react'

interface ConnectionStatusBadgeProps {
  status: ConnectionStatus
  isUsingFallback?: boolean
  onDismiss?: () => void
}

export function ConnectionStatusBadge({
  status,
  isUsingFallback,
  onDismiss,
}: ConnectionStatusBadgeProps) {
  const [isDismissed, setIsDismissed] = useState(false)

  // Only show if disconnected or reconnecting
  if (status === 'connected' || isDismissed) {
    return null
  }

  const handleDismiss = () => {
    setIsDismissed(true)
    onDismiss?.()
  }

  return (
    <div
      className={`
        p-3 rounded-lg border flex items-center justify-between
        ${
          status === 'reconnecting'
            ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400'
            : 'bg-red-500/10 border-red-500/30 text-red-400'
        }
      `}
    >
      <div className="flex items-center gap-2">
        <span className={status === 'reconnecting' ? 'animate-spin' : ''}>
          {status === 'reconnecting' ? '↻' : '○'}
        </span>
        <div className="text-sm font-semibold">
          {status === 'reconnecting' ? 'Reconnecting...' : 'Disconnected'}
        </div>
        {isUsingFallback && (
          <div className="text-xs ml-1 opacity-75">using fallback polling</div>
        )}
      </div>

      <button
        onClick={handleDismiss}
        className="text-xl opacity-50 hover:opacity-100 transition"
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  )
}
