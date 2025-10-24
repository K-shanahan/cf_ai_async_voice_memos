/**
 * useWebSocketMemo - Real-time status updates via WebSocket with fallback to polling
 *
 * Features:
 * - Establishes WebSocket connection to backend for real-time updates
 * - Parses incoming status updates and tracks workflow stage progress
 * - Maintains error log for failed stages
 * - Implements exponential backoff reconnection (1s, 2s, 4s, 8s, 16s, 30s max)
 * - Auto-fallback to polling if WebSocket fails after max retries
 * - Syncs updates with React Query cache
 * - Proper cleanup on unmount
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { useAuth } from '@clerk/clerk-react'
import { useQueryClient } from '@tanstack/react-query'
import { useMemoDetail } from './useMemoApi'
import {
  StatusUpdate,
  HistoryMessage,
  StageProgress,
  WorkflowError,
  ConnectionStatus,
} from '../types/websocket'
import { MEMO_QUERY_KEYS } from './useMemoApi'

const API_BASE_URL = import.meta.env.VITE_WORKER_URL || 'http://localhost:8787'
const MAX_RECONNECT_ATTEMPTS = 10
const INITIAL_BACKOFF_MS = 1000
const MAX_BACKOFF_MS = 30000

export function useWebSocketMemo(taskId: string) {
  const { getToken } = useAuth()
  const queryClient = useQueryClient()
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reconnectAttemptsRef = useRef(0)

  // State
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected')
  const [stageProgress, setStageProgress] = useState<StageProgress>({
    transcribe: 'pending',
    extract: 'pending',
    generate: 'pending',
    db_update: 'pending',
  })
  const [errors, setErrors] = useState<WorkflowError[]>([])
  const [useFallbackPolling, setUseFallbackPolling] = useState(false)

  // Get memo data via polling (fallback mechanism)
  const pollingQuery = useMemoDetail(taskId)
  const memo = pollingQuery.data

  // Determine current stage based on progress
  const getCurrentStage = useCallback((): string | null => {
    const stages: Array<[keyof StageProgress, string]> = [
      ['transcribe', 'transcribe'],
      ['extract', 'extract'],
      ['generate', 'generate'],
      ['db_update', 'db_update'],
    ]

    for (const [key, stageName] of stages) {
      if (stageProgress[key] === 'started') {
        return stageName
      }
    }

    // Check if any are started but not yet all completed
    if (stageProgress.transcribe !== 'pending' && stageProgress.db_update !== 'completed') {
      // Find the next stage that hasn't started
      for (const [key] of stages) {
        if (stageProgress[key] === 'pending') {
          return key
        }
      }
    }

    return null
  }, [stageProgress])

  // Handle incoming WebSocket message
  const handleMessage = useCallback(
    (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data) as unknown

        // Type guard to check if it's a history message
        if (
          typeof data === 'object' &&
          data !== null &&
          'type' in data &&
          (data as Record<string, unknown>).type === 'history'
        ) {
          // Process history message
          const historyMsg = data as HistoryMessage
          processStatusUpdates(historyMsg.updates)
        } else {
          // Single status update
          const update = data as StatusUpdate
          processStatusUpdate(update)
        }
      } catch (error) {
        console.error('[WebSocket] Error parsing message:', error)
      }
    },
    []
  )

  // Process single status update
  const processStatusUpdate = useCallback((update: StatusUpdate) => {
    console.log(`[WebSocket] Update: ${update.stage} ${update.status}`)

    // Update stage progress (only if it's a tracked stage, not 'workflow')
    if (
      update.stage === 'transcribe' ||
      update.stage === 'extract' ||
      update.stage === 'generate' ||
      update.stage === 'db_update'
    ) {
      setStageProgress((prev) => ({
        ...prev,
        [update.stage]: update.status === 'failed' ? 'failed' : update.status,
      }))
    }

    // Track errors
    if (update.status === 'failed' && update.error_message) {
      setErrors((prev) => [
        ...prev,
        {
          stage: update.stage,
          message: update.error_message!,
          timestamp: update.timestamp,
        },
      ])
    }

    // Update React Query cache with latest memo data
    // This ensures the memo detail is synced across the app
    if (update.status === 'completed' || update.status === 'failed') {
      // On final update, refetch to get complete data
      queryClient.invalidateQueries({
        queryKey: MEMO_QUERY_KEYS.detail(update.taskId),
      })
    }
  }, [queryClient])

  // Process history of updates
  const processStatusUpdates = useCallback((updates: StatusUpdate[]) => {
    // Reset stage progress
    const newProgress: StageProgress = {
      transcribe: 'pending',
      extract: 'pending',
      generate: 'pending',
      db_update: 'pending',
    }

    // Rebuild state from history
    const newErrors: WorkflowError[] = []

    for (const update of updates) {
      // Update stage progress (only if it's a tracked stage, not 'workflow')
      if (
        update.stage === 'transcribe' ||
        update.stage === 'extract' ||
        update.stage === 'generate' ||
        update.stage === 'db_update'
      ) {
        newProgress[update.stage] = update.status === 'failed' ? 'failed' : update.status
      }

      if (update.status === 'failed' && update.error_message) {
        newErrors.push({
          stage: update.stage,
          message: update.error_message,
          timestamp: update.timestamp,
        })
      }
    }

    setStageProgress(newProgress)
    setErrors(newErrors)
  }, [])

  // Calculate exponential backoff delay
  const getBackoffDelay = useCallback(() => {
    const delay = Math.min(
      INITIAL_BACKOFF_MS * Math.pow(2, reconnectAttemptsRef.current),
      MAX_BACKOFF_MS
    )
    return delay
  }, [])

  // Attempt to reconnect with exponential backoff
  const attemptReconnect = useCallback(async () => {
    if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
      console.warn(
        `[WebSocket] Max reconnection attempts (${MAX_RECONNECT_ATTEMPTS}) reached, switching to polling`
      )
      setUseFallbackPolling(true)
      return
    }

    const delay = getBackoffDelay()
    console.log(
      `[WebSocket] Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current + 1}/${MAX_RECONNECT_ATTEMPTS})`
    )

    setConnectionStatus('reconnecting')

    reconnectTimeoutRef.current = setTimeout(() => {
      connectWebSocket()
    }, delay)

    reconnectAttemptsRef.current++
  }, [getBackoffDelay])

  // Connect to WebSocket
  const connectWebSocket = useCallback(async () => {
    try {
      const token = await getToken()
      if (!token) {
        console.error('[WebSocket] No auth token available')
        return
      }

      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const wsUrl = `${wsProtocol}//${new URL(API_BASE_URL).host}/ws/task/${taskId}?token=${encodeURIComponent(token)}`

      console.log('[WebSocket] Connecting to:', wsUrl)
      const ws = new WebSocket(wsUrl)

      ws.onopen = () => {
        console.log('[WebSocket] Connected')
        setConnectionStatus('connected')
        reconnectAttemptsRef.current = 0
        setUseFallbackPolling(false)
      }

      ws.onmessage = handleMessage

      ws.onclose = () => {
        console.warn('[WebSocket] Disconnected')
        setConnectionStatus('disconnected')
        wsRef.current = null

        // Attempt reconnect if not already using fallback polling
        if (!useFallbackPolling) {
          attemptReconnect()
        }
      }

      ws.onerror = (error) => {
        console.error('[WebSocket] Error:', error)
      }

      wsRef.current = ws
    } catch (error) {
      console.error('[WebSocket] Connection error:', error)
      attemptReconnect()
    }
  }, [taskId, getToken, handleMessage, useFallbackPolling, attemptReconnect])

  // Establish WebSocket connection on mount
  useEffect(() => {
    connectWebSocket()

    return () => {
      // Cleanup
      if (wsRef.current) {
        wsRef.current.close()
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
    }
  }, [connectWebSocket])

  // Determine overall loading state
  const isLoading = !memo || (connectionStatus === 'disconnected' && pollingQuery.isLoading)

  return {
    // Memo data
    memo,
    status: memo?.status || 'pending',

    // WebSocket status
    connectionStatus,
    isUsingFallback: useFallbackPolling,

    // Workflow progress
    stageProgress,
    currentStage: getCurrentStage(),

    // Error tracking
    errors,
    clearErrors: () => setErrors([]),
    clearError: (stage: string) =>
      setErrors((prev) => prev.filter((e) => e.stage !== stage)),

    // Query state
    isLoading,
    error: pollingQuery.error,
    isError: pollingQuery.isError,
  }
}
