/**
 * API Client for Voice Memo Task Manager
 * Handles HTTP requests to the backend with automatic auth token injection
 */

import type {
  CreateMemoResponse,
  GetMemoResponse,
  GetMemosResponse,
  ErrorResponse,
} from '../types/index';

export interface ApiClientConfig {
  baseUrl: string;
  getAuthToken?: () => Promise<string> | string;
}

export class ApiClient {
  private baseUrl: string;
  private getAuthToken?: () => Promise<string> | string;

  constructor(config: ApiClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.getAuthToken = config.getAuthToken;
  }

  private async getHeaders(): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.getAuthToken) {
      const token = await this.getAuthToken();
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    }

    return headers;
  }

  private async handleResponse<T>(response: Response): Promise<T> {
    const contentType = response.headers.get('content-type');

    // Handle non-JSON responses (like binary audio)
    if (!contentType?.includes('application/json')) {
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return response as any;
    }

    // Handle JSON responses
    const data = await response.json();

    if (!response.ok) {
      const error = data as ErrorResponse;
      throw new ApiError(error.message, response.status, error);
    }

    return data;
  }

  /**
   * Upload a new voice memo
   */
  async uploadMemo(audioBlob: Blob): Promise<CreateMemoResponse> {
    const formData = new FormData();
    formData.append('audio', audioBlob);

    const headers: Record<string, string> = {};
    if (this.getAuthToken) {
      const token = await this.getAuthToken();
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    }

    const response = await fetch(`${this.baseUrl}/api/v1/memo`, {
      method: 'POST',
      headers,
      body: formData,
    });

    return this.handleResponse<CreateMemoResponse>(response);
  }

  /**
   * Get all memos for the authenticated user
   */
  async getMemos(limit: number = 100, offset: number = 0): Promise<GetMemosResponse> {
    const headers = await this.getHeaders();
    const url = new URL(`${this.baseUrl}/api/v1/memos`);
    url.searchParams.append('limit', limit.toString());
    url.searchParams.append('offset', offset.toString());

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers,
    });

    return this.handleResponse<GetMemosResponse>(response);
  }

  /**
   * Get a specific memo by task ID
   */
  async getMemo(taskId: string): Promise<GetMemoResponse> {
    const headers = await this.getHeaders();

    const response = await fetch(`${this.baseUrl}/api/v1/memo/${taskId}`, {
      method: 'GET',
      headers,
    });

    return this.handleResponse<GetMemoResponse>(response);
  }

  /**
   * Download the original audio file for a memo
   */
  async downloadAudio(taskId: string): Promise<Blob> {
    const headers = await this.getHeaders();

    const response = await fetch(`${this.baseUrl}/api/v1/memo/audio/${taskId}`, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      throw new Error(`Failed to download audio: HTTP ${response.status}`);
    }

    return response.blob();
  }

  /**
   * Delete a memo by task ID
   */
  async deleteMemo(taskId: string): Promise<void> {
    const headers = await this.getHeaders();

    const response = await fetch(`${this.baseUrl}/api/v1/memo/${taskId}`, {
      method: 'DELETE',
      headers,
    });

    if (response.status === 204) {
      return;
    }

    // Handle errors
    if (!response.ok) {
      const data = await response.json();
      const error = data as ErrorResponse;
      throw new ApiError(error.message, response.status, error);
    }
  }
}

/**
 * Custom error class for API errors
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public data: ErrorResponse
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
