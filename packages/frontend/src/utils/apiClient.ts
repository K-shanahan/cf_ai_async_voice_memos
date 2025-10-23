/**
 * HTTP client wrapper with Clerk token injection and error handling
 * Token is obtained fresh from Clerk for each request
 */

import { ApiError } from '../types/api'

const API_BASE_URL = import.meta.env.VITE_WORKER_URL || 'http://localhost:8787'

export interface ClientOptions {
  method?: string
  headers?: Record<string, string>
  body?: BodyInit | null
  token?: string
}

export async function apiRequest<T>(
  endpoint: string,
  options: ClientOptions = {},
  token?: string
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`

  const headers: Record<string, string> = {
    ...options.headers,
  }

  // Use provided token
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
    console.debug(`[API] ${options.method || 'GET'} ${endpoint} - Token attached`)
  } else {
    console.warn(`[API] ${options.method || 'GET'} ${endpoint} - NO TOKEN! This will fail with 401`)
  }

  // If no Content-Type specified and body exists, assume JSON
  if (options.body && !headers['Content-Type'] && typeof options.body === 'string') {
    headers['Content-Type'] = 'application/json'
  }

  const response = await fetch(url, {
    ...options,
    headers,
  })

  // Handle non-2xx responses
  if (!response.ok) {
    let errorData: any = {}
    try {
      errorData = await response.json()
    } catch {
      // Response wasn't JSON, that's okay
    }

    const error: ApiError = {
      message: errorData.message || `HTTP ${response.status}`,
      status: response.status,
      code: errorData.code,
    }

    // 401/403 means auth failed - might need to re-authenticate
    if (response.status === 401 || response.status === 403) {
      error.message = 'Authentication failed. Please sign in again.'
    }

    throw error
  }

  // Parse response
  if (response.status === 204) {
    // No content response (e.g., DELETE)
    return undefined as any
  }

  const contentType = response.headers.get('content-type')
  if (contentType?.includes('application/json')) {
    return response.json()
  }

  return response as any
}

/**
 * Upload file with form data
 */
export async function uploadFile(
  endpoint: string,
  fileField: string,
  blob: Blob,
  token?: string
): Promise<any> {
  const url = `${API_BASE_URL}${endpoint}`

  const formData = new FormData()
  formData.append(fileField, blob)

  const headers: Record<string, string> = {}
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  } else {
    console.warn('Upload made without authentication token')
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: formData,
  })

  if (!response.ok) {
    let errorData: any = {}
    try {
      errorData = await response.json()
    } catch {
      // Response wasn't JSON
    }

    const error: ApiError = {
      message: errorData.message || `HTTP ${response.status}`,
      status: response.status,
    }

    if (response.status === 401 || response.status === 403) {
      error.message = 'Authentication failed. Please sign in again.'
    }

    throw error
  }

  const contentType = response.headers.get('content-type')
  if (contentType?.includes('application/json')) {
    return response.json()
  }

  return response
}

/**
 * Download binary file (like audio)
 */
export async function downloadFile(endpoint: string, token?: string): Promise<Blob> {
  const url = `${API_BASE_URL}${endpoint}`

  const headers: Record<string, string> = {}
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  } else {
    console.warn('Download made without authentication token')
  }

  const response = await fetch(url, {
    headers,
  })

  if (!response.ok) {
    const error: ApiError = {
      message: `Failed to download file: HTTP ${response.status}`,
      status: response.status,
    }
    throw error
  }

  return response.blob()
}
