import React, { createContext, useReducer, useRef, useEffect, useCallback, useMemo } from 'react'
import { useAuth } from '@clerk/clerk-react'
import { memoStatusReducer, GlobalMemoState, MemoAction, MemoStateItem } from './memoStatusReducer'
import { StatusUpdate, HistoryMessage } from '../types/websocket'
import { apiRequest } from '../utils/apiClient'
import { MemoDetailResponse } from '../types/api'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { MEMO_QUERY_KEYS } from '../hooks/useMemoApi'

const API_BASE_URL = import.meta.env.VITE_WORKER_URL || 'http://localhost:8787'
const INITIAL_BACKOFF_MS = 1000
const MAX_BACKOFF_MS = 30000

interface WebSocketConnection {
  ws: WebSocket | null
  reconnectTimeout: ReturnType<typeof setTimeout> | null
  reconnectAttempts: number
  intentionallyClosed: boolean
  taskCompleted: boolean
}

export interface MemoStatusContextType {
  state: GlobalMemoState
  dispatch: React.Dispatch<MemoAction>
  processingMemos: MemoStateItem[]
  completedMemos: MemoStateItem[]
  isLoadingInitial: boolean
  startMonitoring: (taskId: string) => void
  stopMonitoring: (taskId: string) => void
}

export const MemoStatusContext = createContext<MemoStatusContextType | undefined>(undefined)

interface MemoStatusProviderProps {
  children: React.ReactNode
}

export function MemoStatusProvider({ children }: MemoStatusProviderProps) {
  const { getToken, isLoaded, isSignedIn } = useAuth()
  const queryClient = useQueryClient()
  const [state, dispatch] = useReducer(memoStatusReducer, { memos: {} })

  // Registry of WebSocket connections per taskId
  const connectionsRef = useRef<Map<string, WebSocketConnection>>(new Map())

  // Load memos from React Query on mount
  const { data: initialMemos, isLoading: isLoadingInitialMemos } = useQuery<MemoDetailResponse[]>({
    queryKey: MEMO_QUERY_KEYS.lists(),
    queryFn: async () => {
      const token = await getToken()
      if (!token) throw new Error('No authentication token')
      const response = await apiRequest<{ memos: MemoDetailResponse[] }>('/api/v1/memos?limit=100&offset=0', {}, token)
      return response.memos
    },
    enabled: isLoaded && isSignedIn,
    staleTime: Infinity,
    refetchInterval: false,
  })

  // Sync initial memos from query to state
  useEffect(() => {
    if (initialMemos) {
      dispatch({
        type: 'SET_MEMOS',
        payload: initialMemos.map(memo => ({
          ...memo,
          stageProgress: {
            transcribe: memo.status === 'completed' ? 'completed' : 'pending',
            extract: memo.status === 'completed' ? 'completed' : 'pending',
            generate: memo.status === 'completed' ? 'completed' : 'pending',
          },
        })),
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMemos])


  // Handle incoming WebSocket message
  const handleWebSocketMessage = useCallback((taskId: string, event: MessageEvent) => {
    const connection = connectionsRef.current.get(taskId)
    if (!connection) return

    try {
      if (connection.taskCompleted) {
        return
      }

      if (!event.data) {
        return
      }

      const data = JSON.parse(event.data) as unknown

      if (typeof data !== 'object' || data === null) {
        return
      }

      const dataObj = data as Record<string, unknown>

      if (dataObj.type === 'history') {
        // Process history message
        const historyMsg = data as HistoryMessage

        // Process each update in history
        for (const update of historyMsg.updates) {
          dispatch({
            type: 'STATUS_UPDATE',
            payload: update,
          })
        }

        if (historyMsg.taskCompleted) {
          connection.taskCompleted = true
        }
      } else if (dataObj.stage && dataObj.status) {
        // Single status update
        const update = data as StatusUpdate

        if (update.taskId !== taskId) {
          return
        }

        dispatch({
          type: 'STATUS_UPDATE',
          payload: update,
        })

        // Handle workflow completion
        if (update.overallStatus === 'completed' || update.overallStatus === 'failed') {
          connection.taskCompleted = true

          // Invalidate and refetch caches
          ;(async () => {
            try {
              queryClient.invalidateQueries({
                queryKey: MEMO_QUERY_KEYS.detail(update.taskId),
              })

              await queryClient.refetchQueries({
                queryKey: MEMO_QUERY_KEYS.detail(update.taskId),
              })

              queryClient.invalidateQueries({
                queryKey: MEMO_QUERY_KEYS.lists(),
                exact: false,
              })

              await queryClient.refetchQueries({
                queryKey: MEMO_QUERY_KEYS.lists(),
                exact: false,
              })
            } catch (error) {
              // Silently fail
            }
          })()

          // Close WebSocket
          const ws = connectionsRef.current.get(taskId)?.ws
          if (ws && ws.OPEN) {
            ws.close()
          }
        }
      }
    } catch (error) {
      // Silently fail
    }
  }, [dispatch, queryClient])

  const getBackoffDelay = useCallback((reconnectAttempts: number) => {
    return Math.min(
      INITIAL_BACKOFF_MS * Math.pow(2, reconnectAttempts),
      MAX_BACKOFF_MS
    )
  }, [])

  // Connect WebSocket for a specific memo
  const connectWebSocket = useCallback(async (taskId: string) => {
    if (!isLoaded || !isSignedIn) {
      return
    }

    const memo = state.memos[taskId]
    if (!memo) {
      return
    }

    // Don't connect if already complete
    if (memo.status === 'completed' || memo.status === 'failed') {
      return
    }

    try {
      const token = await getToken()
      if (!token) {
        return
      }

      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const wsUrl = `${wsProtocol}//${new URL(API_BASE_URL).host}/ws/task/${taskId}?token=${encodeURIComponent(token)}`

      const ws = new WebSocket(wsUrl)
      const connection = connectionsRef.current.get(taskId) || {
        ws: null,
        reconnectTimeout: null,
        reconnectAttempts: 0,
        intentionallyClosed: false,
        taskCompleted: false,
      }

      ws.onopen = () => {
        connection.reconnectAttempts = 0
        connection.ws = ws
        connectionsRef.current.set(taskId, connection)
      }

      ws.onmessage = (event) => handleWebSocketMessage(taskId, event)

      ws.onclose = () => {
        connection.ws = null

        const updatedConnection = connectionsRef.current.get(taskId)
        if (updatedConnection?.taskCompleted || updatedConnection?.intentionallyClosed) {
          return
        }

        if (updatedConnection && updatedConnection.reconnectAttempts === 0) {
          const delay = getBackoffDelay(updatedConnection.reconnectAttempts)

          updatedConnection.reconnectAttempts++
          updatedConnection.reconnectTimeout = setTimeout(() => {
            connectWebSocket(taskId)
          }, delay)
          connectionsRef.current.set(taskId, updatedConnection)
        }
      }

      ws.onerror = () => {
        // Silently fail
      }

      connection.ws = ws
      connectionsRef.current.set(taskId, connection)
    } catch (error) {
      const connection = connectionsRef.current.get(taskId)
      if (connection) {
        const delay = getBackoffDelay(connection.reconnectAttempts)
        connection.reconnectAttempts++
        connection.reconnectTimeout = setTimeout(() => {
          connectWebSocket(taskId)
        }, delay)
        connectionsRef.current.set(taskId, connection)
      }
    }
  }, [state.memos, isLoaded, isSignedIn, getToken, handleWebSocketMessage, getBackoffDelay])

  // Start monitoring a memo (open WebSocket)
  const startMonitoring = useCallback((taskId: string) => {
    // Ensure connection tracking exists
    if (!connectionsRef.current.has(taskId)) {
      connectionsRef.current.set(taskId, {
        ws: null,
        reconnectTimeout: null,
        reconnectAttempts: 0,
        intentionallyClosed: false,
        taskCompleted: false,
      })
    }

    connectWebSocket(taskId)
  }, [connectWebSocket])

  // Stop monitoring a memo (close WebSocket)
  const stopMonitoring = useCallback((taskId: string) => {
    const connection = connectionsRef.current.get(taskId)
    if (connection) {
      connection.intentionallyClosed = true

      if (connection.ws && connection.ws.readyState === WebSocket.OPEN) {
        connection.ws.close()
      }
      connection.ws = null

      if (connection.reconnectTimeout) {
        clearTimeout(connection.reconnectTimeout)
        connection.reconnectTimeout = null
      }
    }
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      for (const [, connection] of connectionsRef.current) {
        if (connection.ws) {
          connection.ws.close()
        }
        if (connection.reconnectTimeout) {
          clearTimeout(connection.reconnectTimeout)
        }
      }
      connectionsRef.current.clear()
    }
  }, [])

  // Derived state: split memos by status
  const { processingMemos, completedMemos } = useMemo(() => {
    const processing: MemoStateItem[] = []
    const completed: MemoStateItem[] = []

    for (const memo of Object.values(state.memos)) {
      if (memo.status === 'pending' || memo.status === 'processing') {
        processing.push(memo)
      } else {
        completed.push(memo)
      }
    }

    return { processingMemos: processing, completedMemos: completed }
  }, [state.memos])

  const contextValue: MemoStatusContextType = {
    state,
    dispatch,
    processingMemos,
    completedMemos,
    isLoadingInitial: isLoadingInitialMemos,
    startMonitoring,
    stopMonitoring,
  }

  return (
    <MemoStatusContext.Provider value={contextValue}>
      {children}
    </MemoStatusContext.Provider>
  )
}
