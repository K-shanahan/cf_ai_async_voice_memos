import { vi, Vitest } from 'vitest';

/**
 * Strongly-typed mock context for testing
 */
export interface MockD1Database {
  prepare: Vitest['fn'];
}

export interface MockR2Bucket {
  put: Vitest['fn'];
  get: Vitest['fn'];
  delete: Vitest['fn'];
}

export interface MockWorkerContext {
  env: {
    DB: MockD1Database;
    R2_BUCKET: MockR2Bucket;
  };
  data: {
    userId?: string;
  };
}

/**
 * Create a mock Cloudflare Worker context with proper typing
 */
export function createMockContext(): MockWorkerContext {
  const prepareMock = vi.fn();
  const bindMock = vi.fn();
  const runMock = vi.fn().mockResolvedValue({ success: true });
  const firstMock = vi.fn().mockResolvedValue(null);
  const allMock = vi.fn().mockResolvedValue([]);

  // Chain the mocks properly
  bindMock.mockReturnValue({
    run: runMock,
    first: firstMock,
    all: allMock,
  });

  prepareMock.mockReturnValue({
    bind: bindMock,
    run: runMock,
  });

  return {
    env: {
      DB: {
        prepare: prepareMock,
      },
      R2_BUCKET: {
        put: vi.fn().mockResolvedValue({ key: '' }),
        get: vi.fn().mockResolvedValue(null),
        delete: vi.fn().mockResolvedValue(undefined),
      },
    },
    data: {
      userId: 'test-user-123',
    },
  };
}

/**
 * Create a request with FormData containing an audio file
 */
export function createAudioRequest(
  audioData: Buffer | Blob = Buffer.from('mock audio data'),
  filename: string = 'test.webm',
  mimeType: string = 'audio/webm'
): Request {
  const formData = new FormData();
  const blob = audioData instanceof Buffer
    ? new Blob([audioData], { type: mimeType })
    : audioData;
  formData.append('audio', blob, filename);

  return new Request('http://localhost/api/v1/memo', {
    method: 'POST',
    body: formData,
  });
}
