/**
 * TanStack Query hooks for memo API operations
 * Handles all backend API communication with caching and polling
 * Token is obtained fresh from Clerk for each request
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@clerk/clerk-react'
import { apiRequest, uploadFile, downloadFile } from '../utils/apiClient'
import {
  MemoListResponse,
  MemoDetailResponse,
  UploadMemoResponse,
  MemoSummary,
  ApiError,
} from '../types/api'

// Query keys for TanStack Query
export const MEMO_QUERY_KEYS = {
  all: ['memos'] as const,
  lists: () => [...MEMO_QUERY_KEYS.all, 'list'] as const,
  list: (limit: number, offset: number) => [...MEMO_QUERY_KEYS.lists(), { limit, offset }] as const,
  details: () => [...MEMO_QUERY_KEYS.all, 'detail'] as const,
  detail: (taskId: string) => [...MEMO_QUERY_KEYS.details(), taskId] as const,
}

// ============================================================================
// Query Hooks (Data Fetching)
// ============================================================================

/**
 * Fetch list of all memos for current user
 * Polls with staleTime: 30 seconds
 * Gets fresh token from Clerk for each request
 */
export function useMemoList(limit: number = 100, offset: number = 0) {
  const { getToken, isLoaded, isSignedIn } = useAuth()

  return useQuery<MemoSummary[], ApiError>({
    queryKey: MEMO_QUERY_KEYS.list(limit, offset),
    queryFn: async () => {
      const token = await getToken()
      if (!token) {
        throw new Error('No authentication token available')
      }
      const response = await apiRequest<MemoListResponse>(
        `/api/v1/memos?limit=${limit}&offset=${offset}`,
        {},
        token
      )
      return response.memos
    },
    // Only fetch when Clerk is loaded and user is signed in
    enabled: isLoaded && isSignedIn,
    staleTime: 30000, // 30 seconds
    retry: 2,
    // Don't refetch on window focus in this MVP
  })
}

/**
 * Fetch single memo with polling support
 * Auto-stops polling when status is no longer 'pending'
 * Gets fresh token from Clerk for each request
 */
export function useMemoDetail(taskId: string) {
  const { getToken, isLoaded, isSignedIn } = useAuth()

  const memoDetail = useQuery<MemoDetailResponse, ApiError>({
    queryKey: MEMO_QUERY_KEYS.detail(taskId),
    queryFn: async () => {
      const token = await getToken()
      if (!token) {
        throw new Error('No authentication token available')
      }
      return apiRequest<MemoDetailResponse>(`/api/v1/memo/${taskId}`, {}, token)
    },
    // Polling: refetch every 5 seconds
    refetchInterval: 5000,
    // Stop polling when memo is completed or failed
    refetchIntervalInBackground: true,
    retry: 2,
    // Only fetch when Clerk is loaded, user is signed in, and taskId exists
    enabled: isLoaded && isSignedIn && taskId !== undefined,
  })

  // Disable polling when status is completed or failed
  const shouldStopPolling = memoDetail.data && memoDetail.data.status !== 'pending'

  return {
    ...memoDetail,
    // Override refetchInterval to be conditional
    refetchInterval: shouldStopPolling ? false : 5000,
  }
}

// ============================================================================
// Mutation Hooks (Data Modification)
// ============================================================================

/**
 * Upload new memo audio file
 * Returns taskId for polling
 */
export function useUploadMemo() {
  const queryClient = useQueryClient()
  const { getToken } = useAuth()

  return useMutation<UploadMemoResponse, ApiError, Blob>({
    mutationFn: async (audioBlob: Blob) => {
      const token = await getToken()
      if (!token) {
        throw new Error('No authentication token available')
      }
      return uploadFile('/api/v1/memo', 'audio', audioBlob, token)
    },
    onSuccess: (data) => {
      // Invalidate memo list to refetch updated list
      queryClient.invalidateQueries({
        queryKey: MEMO_QUERY_KEYS.lists(),
      })

      // Prefetch the new memo detail so it's ready when polling starts
      queryClient.prefetchQuery({
        queryKey: MEMO_QUERY_KEYS.detail(data.taskId),
        queryFn: async () => {
          const token = await getToken()
          if (!token) {
            throw new Error('No authentication token available')
          }
          return apiRequest<MemoDetailResponse>(`/api/v1/memo/${data.taskId}`, {}, token)
        },
      })
    },
    onError: (error) => {
      console.error('Upload failed:', error)
    },
  })
}

/**
 * Delete memo and its audio file
 */
export function useDeleteMemo() {
  const queryClient = useQueryClient()
  const { getToken } = useAuth()

  return useMutation<void, ApiError, string>({
    mutationFn: async (taskId: string) => {
      const token = await getToken()
      if (!token) {
        throw new Error('No authentication token available')
      }
      await apiRequest(`/api/v1/memo/${taskId}`, {
        method: 'DELETE',
      }, token)
    },
    onSuccess: (_, taskId) => {
      // Remove detail query for deleted memo
      queryClient.removeQueries({
        queryKey: MEMO_QUERY_KEYS.detail(taskId),
      })

      // Invalidate list to refetch
      queryClient.invalidateQueries({
        queryKey: MEMO_QUERY_KEYS.lists(),
      })
    },
    onError: (error) => {
      console.error('Delete failed:', error)
    },
  })
}

/**
 * Download original audio file
 * Returns blob that can be played or downloaded
 */
export function useDownloadAudio() {
  const { getToken } = useAuth()

  return useMutation<Blob, ApiError, string>({
    mutationFn: async (taskId: string) => {
      const token = await getToken()
      if (!token) {
        throw new Error('No authentication token available')
      }
      return downloadFile(`/api/v1/memo/audio/${taskId}`, token)
    },
    onError: (error) => {
      console.error('Download failed:', error)
    },
  })
}
