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
  const intentionallyClosed = useRef(false)  // Track if we intentionally closed due to completion

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
  const [isInitialized, setIsInitialized] = useState(false)
  const [realtimeTranscription, setRealtimeTranscription] = useState<string | null>(null)

  // Get memo data via polling (fallback mechanism)
  const pollingQuery = useMemoDetail(taskId)
  const memo = pollingQuery.data

  // Check if task is complete - don't reconnect if it is
  const isTaskComplete = memo?.status === 'completed' || memo?.status === 'failed'

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
        console.log(`[WebSocket:${taskId}] Message received:`, event.data)
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
          console.log(`[WebSocket:${taskId}] History message with ${historyMsg.updates.length} updates`)
          processStatusUpdates(historyMsg.updates)
        } else {
          // Single status update
          const update = data as StatusUpdate
          console.log(`[WebSocket:${taskId}] Status update: stage=${update.stage}, status=${update.status}`)

          // Validate this update is for the correct taskId
          if (update.taskId !== taskId) {
            console.warn(
              `[WebSocket:${taskId}] ⚠️ TASKID MISMATCH! Update is for taskId: ${update.taskId}, but this hook is for: ${taskId}. IGNORING.`
            )
            return
          }

          processStatusUpdate(update)
        }
      } catch (error) {
        console.error(`[WebSocket:${taskId}] Error parsing message:`, error)
      }
    },
    [taskId]
  )

  // Process single status update
  const processStatusUpdate = useCallback((update: StatusUpdate) => {
    console.log(`[WebSocket:${taskId}] Processing update: stage=${update.stage}, status=${update.status}`)

    // Update stage progress (only if it's a tracked stage, not 'workflow')
    if (
      update.stage === 'transcribe' ||
      update.stage === 'extract' ||
      update.stage === 'generate' ||
      update.stage === 'db_update'
    ) {
      setStageProgress((prev) => {
        const newStatus = update.status === 'failed' ? 'failed' : update.status
        console.log(`[WebSocket:${taskId}] Updating stage "${update.stage}" to "${newStatus}"`)
        return {
          ...prev,
          [update.stage]: newStatus,
        }
      })
    } else {
      console.log(`[WebSocket:${taskId}] Ignoring stage "${update.stage}" (not a tracked stage)`)
    }

    // Store transcription when transcribe stage completes
    if (update.stage === 'transcribe' && update.status === 'completed' && update.transcription) {
      console.log(`[WebSocket:${taskId}] ✓ Transcription received via WebSocket (${update.transcription.length} chars)`)
      setRealtimeTranscription(update.transcription)
    }

    // Track errors
    if (update.status === 'failed' && update.error_message) {
      console.warn(
        `[WebSocket:${taskId}] Error occurred in stage "${update.stage}": ${update.error_message}`
      )
      setErrors((prev) => [
        ...prev,
        {
          stage: update.stage,
          message: update.error_message!,
          timestamp: update.timestamp,
        },
      ])
    }

    // When workflow completes or fails, invalidate cache and close WebSocket
    if (update.overallStatus === 'completed' || update.overallStatus === 'failed') {
      console.log(`[WebSocket:${taskId}] ✓ WORKFLOW ${update.overallStatus.toUpperCase()} - Refetching memo list and detail`)
      // Mark that we're intentionally closing due to completion
      intentionallyClosed.current = true
      // Refetch to get complete data from database
      queryClient.invalidateQueries({
        queryKey: MEMO_QUERY_KEYS.detail(update.taskId),
      })
      console.log(`[WebSocket:${taskId}] Invalidating memo list queries with prefix matching`)
      // Also invalidate ALL memo list queries regardless of pagination params
      queryClient.invalidateQueries({
        queryKey: MEMO_QUERY_KEYS.lists(),
        exact: false  // Use prefix matching to catch all list queries
      })
      // Force refetch of all memo list queries to ensure they're updated
      queryClient.refetchQueries({
        queryKey: MEMO_QUERY_KEYS.lists(),
        exact: false  // Use prefix matching to catch all list queries
      }).then((result) => {
        console.log(`[WebSocket:${taskId}] Refetch complete, updated ${result.length} queries`)
      }).catch((error) => {
        console.error(`[WebSocket:${taskId}] Refetch error:`, error)
      })
      // Close WebSocket since processing is complete
      if (wsRef.current) {
        console.log(`[WebSocket:${taskId}] Closing WebSocket (task ${update.overallStatus})`)
        wsRef.current.close()
        wsRef.current = null
      }
    }
  }, [queryClient, taskId])

  // Process history of updates
  const processStatusUpdates = useCallback((updates: StatusUpdate[]) => {
    // Validate all updates are for this taskId
    const updatesByTaskId = updates.reduce(
      (acc, update) => {
        acc[update.taskId] = (acc[update.taskId] || 0) + 1
        return acc
      },
      {} as Record<string, number>
    )

    if (Object.keys(updatesByTaskId).length > 1) {
      console.warn(
        `[WebSocket:${taskId}] ⚠️ MULTIPLE TASKIDS IN HISTORY! Expected only ${taskId}, but got:`,
        Object.keys(updatesByTaskId)
      )
    }

    // Reset stage progress
    const newProgress: StageProgress = {
      transcribe: 'pending',
      extract: 'pending',
      generate: 'pending',
      db_update: 'pending',
    }

    // Rebuild state from history
    const newErrors: WorkflowError[] = []
    let newTranscription: string | null = null

    for (const update of updates) {
      if (update.taskId !== taskId) {
        console.warn(
          `[WebSocket:${taskId}] ⚠️ TASKID MISMATCH in history! Update is for ${update.taskId}, ignoring.`
        )
        continue
      }

      // Update stage progress (only if it's a tracked stage, not 'workflow')
      if (
        update.stage === 'transcribe' ||
        update.stage === 'extract' ||
        update.stage === 'generate' ||
        update.stage === 'db_update'
      ) {
        newProgress[update.stage] = update.status === 'failed' ? 'failed' : update.status
      }

      // Extract transcription from history if available
      if (update.stage === 'transcribe' && update.status === 'completed' && update.transcription) {
        newTranscription = update.transcription
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
    if (newTranscription) {
      setRealtimeTranscription(newTranscription)
    }
    setIsInitialized(true)
  }, [taskId])

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
    // Don't reconnect if task is complete
    if (isTaskComplete) {
      return
    }

    if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
      console.warn(
        `[WebSocket:${taskId}] Max reconnection attempts (${MAX_RECONNECT_ATTEMPTS}) reached, switching to polling`
      )
      setUseFallbackPolling(true)
      return
    }

    const delay = getBackoffDelay()
    setConnectionStatus('reconnecting')

    reconnectTimeoutRef.current = setTimeout(() => {
      connectWebSocket()
    }, delay)

    reconnectAttemptsRef.current++
  }, [getBackoffDelay, isTaskComplete, taskId])

  // Connect to WebSocket
  const connectWebSocket = useCallback(async () => {
    try {
      // Don't connect if task is already complete
      if (isTaskComplete) {
        console.log(`[WebSocket:${taskId}] Task already complete, not connecting`)
        setConnectionStatus('disconnected')
        return
      }

      console.log(`[WebSocket:${taskId}] Attempting connection...`)
      const token = await getToken()
      if (!token) {
        console.error(`[WebSocket:${taskId}] No auth token available`)
        return
      }

      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const wsUrl = `${wsProtocol}//${new URL(API_BASE_URL).host}/ws/task/${taskId}?token=${encodeURIComponent(token)}`

      console.log(`[WebSocket:${taskId}] Connecting to: ${wsUrl.split('?')[0]}...`)
      const ws = new WebSocket(wsUrl)

      ws.onopen = () => {
        console.log(`[WebSocket:${taskId}] ✓ Connected`)
        setConnectionStatus('connected')
        reconnectAttemptsRef.current = 0
        setUseFallbackPolling(false)
      }

      ws.onmessage = handleMessage

      ws.onclose = () => {
        console.log(`[WebSocket:${taskId}] Connection closed`)
        setConnectionStatus('disconnected')
        wsRef.current = null

        // If we intentionally closed due to task completion, don't reconnect
        if (intentionallyClosed.current) {
          console.log(`[WebSocket:${taskId}] Connection was intentionally closed (task completed), not reconnecting`)
          return
        }

        // Check current memo status (not captured isTaskComplete which may be stale)
        const currentMemoStatus = memo?.status
        const taskIsComplete = currentMemoStatus === 'completed' || currentMemoStatus === 'failed'

        // Don't reconnect if task is already complete or if already using fallback polling
        if (!useFallbackPolling && !taskIsComplete) {
          console.log(`[WebSocket:${taskId}] Task not complete, attempting reconnect...`)
          attemptReconnect()
        } else if (taskIsComplete) {
          console.log(`[WebSocket:${taskId}] Task is complete (${currentMemoStatus}), not reconnecting`)
        }
      }

      ws.onerror = (error) => {
        console.error(`[WebSocket:${taskId}] Error:`, error)
      }

      wsRef.current = ws
    } catch (error) {
      console.error(`[WebSocket:${taskId}] Connection error:`, error)
      attemptReconnect()
    }
  }, [taskId, getToken, handleMessage, useFallbackPolling, attemptReconnect, isTaskComplete])

  // Reset state when taskId changes
  useEffect(() => {
    // Reset the intentionally closed flag when the taskId changes
    intentionallyClosed.current = false

    // Reset error and progress state for the new memo
    setErrors([])
    setStageProgress({
      transcribe: 'pending',
      extract: 'pending',
      generate: 'pending',
      db_update: 'pending',
    })
    setIsInitialized(false)
    setRealtimeTranscription(null)
  }, [taskId])

  // Establish WebSocket connection on mount (skip if task already complete)
  useEffect(() => {
    // Wait for memo data to load before deciding whether to connect
    if (pollingQuery.isLoading) {
      return
    }

    if (isTaskComplete) {
      // For completed tasks, mark as initialized since we don't need WebSocket
      setIsInitialized(true)
      return
    }

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
  }, [connectWebSocket, isTaskComplete, pollingQuery.isLoading])

  // Close WebSocket when task completes - no need to keep connection open
  useEffect(() => {
    if (isTaskComplete && wsRef.current) {
      console.log(`[WebSocket:${taskId}] Task complete, closing WebSocket`)
      intentionallyClosed.current = true
      wsRef.current.close()
      wsRef.current = null
      setConnectionStatus('disconnected')
    }
  }, [isTaskComplete, taskId, memo?.status])

  // Filter out db_update from stageProgress for display (we track it internally, but users only see AI stages)
  const displayStageProgress: Partial<StageProgress> = {
    transcribe: stageProgress.transcribe,
    extract: stageProgress.extract,
    generate: stageProgress.generate,
  }

  // Merge real-time transcription with memo data (prefer real-time version if available)
  const memoWithRealtimeData = memo
    ? { ...memo, transcription: realtimeTranscription ?? memo.transcription }
    : null

  // Determine overall loading state - wait for initialization if pending
  const isLoading = !memo || !isInitialized || (connectionStatus === 'disconnected' && pollingQuery.isLoading)

  return {
    // Memo data
    memo: memoWithRealtimeData,
    status: memo?.status || 'pending',

    // WebSocket status
    connectionStatus,
    isUsingFallback: useFallbackPolling,

    // Workflow progress (display version without db_update)
    stageProgress: displayStageProgress as StageProgress,
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
