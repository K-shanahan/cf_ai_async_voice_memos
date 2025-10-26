/**
 * useWebSocketMemo - Real-time status updates via WebSocket
 *
 * Architecture:
 * - WebSocket is the ONLY data source for real-time updates
 * - Local memo state derived from WebSocket events
 * - Single source of truth: WebSocket events drive all state
 * - On completion, WebSocket closes automatically
 * - Connection failures result in reconnection with exponential backoff
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { useAuth } from '@clerk/clerk-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  StatusUpdate,
  HistoryMessage,
  StageProgress,
  WorkflowError,
  ConnectionStatus,
} from '../types/websocket'
import { MEMO_QUERY_KEYS } from './useMemoApi'
import { apiRequest } from '../utils/apiClient'
import { MemoDetailResponse } from '../types/api'

const API_BASE_URL = import.meta.env.VITE_WORKER_URL || 'http://localhost:8787'
const INITIAL_BACKOFF_MS = 1000
const MAX_BACKOFF_MS = 30000
const DEBUG = import.meta.env.DEV // Only log in development

type MemoState = {
  taskId: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  stageProgress: StageProgress
  transcription: string | null
  processedTasks: any[] | null
  createdAt: string
  updatedAt?: string
}

export function useWebSocketMemo(taskId: string, initialMemo?: MemoDetailResponse) {
  const { getToken, isLoaded, isSignedIn } = useAuth()
  const queryClient = useQueryClient()
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reconnectAttemptsRef = useRef(0)
  const intentionallyClosed = useRef<boolean>(false)
  const taskCompleteRef = useRef<boolean>(false) // Track completion status without state dependency

  // Fetch initial memo data (one-time, no polling)
  const { data: fetchedMemo } = useQuery<MemoDetailResponse>({
    queryKey: MEMO_QUERY_KEYS.detail(taskId),
    queryFn: async () => {
      const token = await getToken()
      if (!token) {
        throw new Error('No authentication token available')
      }
      return apiRequest<MemoDetailResponse>(`/api/v1/memo/${taskId}`, {}, token)
    },
    enabled: isLoaded && isSignedIn && taskId !== undefined,
    staleTime: Infinity, // Don't refetch automatically
    refetchInterval: false, // No polling
    retry: 2,
  })

  // Use either provided initialMemo or fetched memo
  const memoData = initialMemo || fetchedMemo

  // LOCAL STATE: Single source of truth (derived from WebSocket + optimistic updates)
  const [memoState, setMemoState] = useState<MemoState | null>(
    memoData
      ? {
          taskId,
          status: memoData.status as any,
          stageProgress: {
            // If completed, all stages done. If failed, wait for history.
            // If pending/processing, default to pending and wait for history to update
            transcribe: memoData.status === 'completed' ? 'completed' : 'pending',
            extract: memoData.status === 'completed' ? 'completed' : 'pending',
            generate: memoData.status === 'completed' ? 'completed' : 'pending',
          },
          transcription: memoData.transcription || null,
          processedTasks: memoData.processedTasks || null,
          createdAt: memoData.createdAt,
          updatedAt: memoData.updatedAt,
        }
      : null
  )

  // Connection & error tracking
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected')
  const [errors, setErrors] = useState<WorkflowError[]>([])
  const [isInitialized, setIsInitialized] = useState(!!memoData)

  // Derived: is task complete?
  const isTaskComplete = memoState?.status === 'completed' || memoState?.status === 'failed'

  // Get current active stage from stageProgress
  const getCurrentStage = useCallback((): string | null => {
    if (!memoState) return null
    const stages: Array<[keyof Omit<StageProgress, 'db_update'>, string]> = [
      ['transcribe', 'transcribe'],
      ['extract', 'extract'],
      ['generate', 'generate'],
    ]

    for (const [key, stageName] of stages) {
      if (memoState.stageProgress[key] === 'started') {
        return stageName
      }
    }

    return null
  }, [memoState])

  // Helper: log only in dev mode
  const log = useCallback((msg: string, data?: any) => {
    if (DEBUG) {
      console.log(`[WS:${taskId}] ${msg}`, data || '')
    }
  }, [taskId])

  const logError = useCallback((msg: string, data?: any) => {
    if (DEBUG) {
      console.error(`[WS:${taskId}] ${msg}`, data || '')
    }
  }, [taskId])

  // Handle incoming WebSocket message
  const handleMessage = useCallback(
    (event: MessageEvent) => {
      try {
        // Skip processing if task is already complete (might be stray messages after close)
        if (taskCompleteRef.current) {
          log(`⏭️  Ignoring message after task completion`)
          return
        }

        // Validate we have data
        if (!event.data) {
          logError(`Received empty message`)
          return
        }

        // Debug: log the raw message
        if (DEBUG) {
          console.log(`[WS:${taskId}] Raw message received:`, {
            data: event.data,
            type: typeof event.data,
            constructor: event.data?.constructor?.name
          })
        }

        const data = JSON.parse(event.data) as unknown

        // Validate data is an object
        if (typeof data !== 'object' || data === null) {
          logError(`Received non-object message: ${JSON.stringify(data)} (type: ${typeof data})`)
          return
        }

        const dataObj = data as Record<string, unknown>

        // Type guard to check if it's a history message
        if (dataObj.type === 'history') {
          // Process history message
          const historyMsg = data as HistoryMessage
          log(`📥 History message received: ${historyMsg.updates.length} updates, taskCompleted=${historyMsg.taskCompleted}`)
          if (DEBUG) {
            console.log(`[WS:${taskId}] History updates:`, historyMsg.updates.map(u => ({
              stage: u.stage,
              status: u.status,
              overallStatus: u.overallStatus
            })))
          }
          processStatusUpdates(historyMsg.updates)
        } else if (dataObj.stage && dataObj.status) {
          // Single status update - validate required fields exist
          const update = data as StatusUpdate
          log(`📥 Status update: ${update.stage} ${update.status}${update.overallStatus ? ` [overall: ${update.overallStatus}]` : ''}`)
          if (DEBUG) {
            console.log(`[WS:${taskId}] Full update payload:`, update)
          }

          // Validate this update is for the correct taskId
          if (update.taskId !== taskId) {
            logError(`TASKID MISMATCH! Expected ${taskId}, got ${update.taskId}`)
            return
          }

          processStatusUpdate(update)
        } else {
          logError(`Received unrecognized message format:`, dataObj)
        }
      } catch (error) {
        logError(`Parse error`, error)
      }
    },
    [taskId, log, logError]
  )

  // Process single status update and update local memo state
  const processStatusUpdate = useCallback((update: StatusUpdate) => {
    log(`🔄 Processing update: ${update.stage} ${update.status}${update.overallStatus ? ` [overall: ${update.overallStatus}]` : ''}`)

    // Update memo state based on WebSocket event
    setMemoState((prev) => {
      if (!prev) return prev

      const newState = { ...prev }
      const oldStatus = prev.status

      // Update stage progress (skip db_update as it's internal)
      if (
        update.stage === 'transcribe' ||
        update.stage === 'extract' ||
        update.stage === 'generate'
      ) {
        const newStatus = update.status === 'failed' ? 'failed' : update.status
        newState.stageProgress = {
          ...newState.stageProgress,
          [update.stage]: newStatus,
        }
      }

      // Store transcription when transcribe completes
      if (update.stage === 'transcribe' && update.status === 'completed' && update.transcription) {
        newState.transcription = update.transcription
        log(`✓ Transcription received (${update.transcription.length} chars)`)
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
        // Revert optimistic updates on error
        newState.status = 'failed'
      }

      // Update overall workflow status
      if (update.overallStatus === 'completed') {
        newState.status = 'completed'
        newState.stageProgress = {
          transcribe: 'completed',
          extract: 'completed',
          generate: 'completed',
        }
        log(`📊 Status changed: ${oldStatus} → completed`)
      } else if (update.overallStatus === 'failed') {
        newState.status = 'failed'
        log(`📊 Status changed: ${oldStatus} → failed`)
      }

      return newState
    })

    // When workflow completes, update status and cache
    if (update.overallStatus === 'completed' || update.overallStatus === 'failed') {
      log(`✓ Workflow ${update.overallStatus.toUpperCase()}`)

      // Update memo status immediately
      setMemoState((prev) => {
        if (!prev) return prev
        const newStatus = update.overallStatus === 'completed' ? 'completed' : 'failed'
        return { ...prev, status: newStatus }
      })

      // Mark as intentionally closed and task complete
      intentionallyClosed.current = true as const
      taskCompleteRef.current = true as const

      // Await cache invalidation and refetch
      (async () => {
        try {
          // Invalidate detail query
          queryClient.invalidateQueries({
            queryKey: MEMO_QUERY_KEYS.detail(update.taskId),
          })

          // Refetch to get complete data from database
          await queryClient.refetchQueries({
            queryKey: MEMO_QUERY_KEYS.detail(update.taskId),
          })

          // Invalidate and refetch all list queries
          queryClient.invalidateQueries({
            queryKey: MEMO_QUERY_KEYS.lists(),
            exact: false,
          })

          await queryClient.refetchQueries({
            queryKey: MEMO_QUERY_KEYS.lists(),
            exact: false,
          })

          log('✓ Cache refetch complete')
        } catch (error) {
          logError('Cache refetch error', error)
        }
      })()

      // Close WebSocket since processing is complete
      if (wsRef.current) {
        log(`Closing WebSocket`)
        wsRef.current.close()
        wsRef.current = null
      }
    }
  }, [queryClient, taskId, log, logError])

  // Process history of updates (initial state reconstruction)
  const processStatusUpdates = useCallback((updates: StatusUpdate[]) => {
    if (!memoState) return

    log(`📋 Processing history with ${updates.length} updates`)

    // Only update stageProgress if we have actual updates
    // If history is empty, keep the current stageProgress
    if (updates.length === 0) {
      log(`Empty history, keeping current stageProgress`)
      setIsInitialized(true)
      return
    }

    if (DEBUG) {
      console.log(`[WS:${taskId}] History updates breakdown:`, updates.map(u => ({
        stage: u.stage,
        status: u.status,
        overallStatus: u.overallStatus,
        error: u.error_message
      })))
    }

    // Rebuild state from history - start with current progress
    const newProgress = { ...memoState.stageProgress }

    const newErrors: WorkflowError[] = []
    let newTranscription: string | null = null
    let overallStatus: string | null = null

    for (const update of updates) {
      if (update.taskId !== taskId) {
        logError(`History TASKID MISMATCH: ${update.taskId} vs ${taskId}`)
        continue
      }

      // Track overall status if present
      if (update.overallStatus) {
        overallStatus = update.overallStatus
      }

      // Update stage progress (skip db_update)
      if (
        update.stage === 'transcribe' ||
        update.stage === 'extract' ||
        update.stage === 'generate'
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

    log(`📊 History reconstructed: stageProgress=${JSON.stringify(newProgress)}, overallStatus=${overallStatus}`)

    // Update memo state with reconstructed state
    setMemoState((prev) =>
      prev
        ? {
            ...prev,
            status: overallStatus === 'completed' ? 'completed' : overallStatus === 'failed' ? 'failed' : prev.status,
            stageProgress: newProgress,
            transcription: newTranscription ?? prev.transcription,
          }
        : prev
    )

    setErrors(newErrors)
    setIsInitialized(true)
  }, [memoState, taskId, log, logError])

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

    const delay = getBackoffDelay()
    setConnectionStatus('reconnecting')
    log(`Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current + 1})`)

    reconnectTimeoutRef.current = setTimeout(() => {
      connectWebSocket()
    }, delay)

    reconnectAttemptsRef.current++
  }, [getBackoffDelay, isTaskComplete, log])

  // Connect to WebSocket
  // NOTE: Carefully manage dependencies to avoid reconnecting on every state update
  const connectWebSocket = useCallback(async () => {
    try {
      // Don't connect if task is already complete
      if (isTaskComplete) {
        log('Task complete, not connecting')
        setConnectionStatus('disconnected')
        return
      }

      log('Attempting connection...')
      const token = await getToken()
      if (!token) {
        logError('No auth token')
        return
      }

      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const wsUrl = `${wsProtocol}//${new URL(API_BASE_URL).host}/ws/task/${taskId}?token=${encodeURIComponent(token)}`

      const ws = new WebSocket(wsUrl)

      ws.onopen = () => {
        log('✓ Connected')
        setConnectionStatus('connected')
        reconnectAttemptsRef.current = 0
      }

      ws.onmessage = handleMessage

      ws.onclose = () => {
        log('Connection closed')
        setConnectionStatus('disconnected')
        wsRef.current = null

        // If we intentionally closed due to task completion, don't reconnect
        if (intentionallyClosed.current || taskCompleteRef.current) {
          log('Task complete or intentional close, not reconnecting')
          return
        }

        // Don't reconnect if already reconnecting
        if (reconnectAttemptsRef.current > 0) {
          log('Already reconnecting, not retrying')
          return
        }

        // Attempt to reconnect
        attemptReconnect()
      }

      ws.onerror = (error) => {
        logError('WebSocket error', error)
      }

      wsRef.current = ws
    } catch (error) {
      logError('Connection error', error)
      attemptReconnect()
    }
    // IMPORTANT: Removed memoState from dependencies to prevent reconnecting on every state update
    // We check isTaskComplete via the ref in onclose handler instead
  }, [taskId, getToken, handleMessage, attemptReconnect, isTaskComplete, log, logError])

  // Sync fetched memo data to state
  useEffect(() => {
    if (memoData) {
      setMemoState({
        taskId,
        status: memoData.status as any,
        stageProgress: {
          transcribe: memoData.status === 'completed' ? 'completed' : 'pending',
          extract: memoData.status === 'completed' ? 'completed' : 'pending',
          generate: memoData.status === 'completed' ? 'completed' : 'pending',
        },
        transcription: memoData.transcription || null,
        processedTasks: memoData.processedTasks || null,
        createdAt: memoData.createdAt,
        updatedAt: memoData.updatedAt,
      })
      setIsInitialized(true)
    }
  }, [memoData, taskId])

  // Reset state when taskId changes
  useEffect(() => {
    intentionallyClosed.current = false
    taskCompleteRef.current = false
    setErrors([])
    reconnectAttemptsRef.current = 0
  }, [taskId])

  // Establish WebSocket connection on mount
  // NOTE: Wait for initial memo data fetch to complete before connecting
  // This prevents connecting and showing progress for already-completed memos
  useEffect(() => {
    // Wait for initial fetch to complete
    if (!memoData) {
      return
    }

    // Don't connect if already complete
    if (taskCompleteRef.current) {
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
  }, [connectWebSocket, memoData])

  // Close WebSocket when task completes (safe to depend on isTaskComplete here - only happens once)
  useEffect(() => {
    if (isTaskComplete && wsRef.current) {
      log('Task complete, closing WebSocket')
      intentionallyClosed.current = true
      taskCompleteRef.current = true
      wsRef.current.close()
      wsRef.current = null
      setConnectionStatus('disconnected')
    }
  }, [isTaskComplete, log])

  // Determine overall loading state
  const isLoading = !memoState || !isInitialized

  return {
    // Memo data (single source of truth from WebSocket)
    memo: memoState,
    status: memoState?.status || 'pending',

    // WebSocket status
    connectionStatus,

    // Workflow progress (without db_update)
    stageProgress: memoState?.stageProgress || {
      transcribe: 'pending',
      extract: 'pending',
      generate: 'pending',
    },
    currentStage: getCurrentStage(),

    // Error tracking
    errors,
    clearErrors: () => setErrors([]),
    clearError: (stage: string) =>
      setErrors((prev) => prev.filter((e) => e.stage !== stage)),

    // Loading state
    isLoading,
    error: null,
    isError: memoState?.status === 'failed',
  }
}
