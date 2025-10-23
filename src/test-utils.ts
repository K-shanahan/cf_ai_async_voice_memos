import { vi, Vitest } from 'vitest';

/**
 * Mock context for testing
 * Uses 'any' for Cloudflare bindings since mocks don't need to match exact types
 */
export interface MockWorkerContext {
  env: {
    DB: any;
    R2_BUCKET: any;
    AUDIO_PROCESSING_WORKFLOW: any;
    AI: any;
    ENVIRONMENT: string;
  };
  data: {
    userId?: string;
  };
}

/**
 * Create a mock Cloudflare Worker context for testing
 */
export function createMockContext(): MockWorkerContext {
  const prepareMock = vi.fn();
  const bindMock = vi.fn();
  const runMock = vi.fn().mockResolvedValue({ success: true });
  const firstMock = vi.fn().mockResolvedValue(null);
  const allMock = vi.fn().mockResolvedValue([]);

  // Chain the mocks properly for D1
  bindMock.mockReturnValue({
    run: runMock,
    first: firstMock,
    all: allMock,
  });

  prepareMock.mockReturnValue({
    bind: bindMock,
    run: runMock,
  });

  // Create individual service mocks
  const getMock = vi.fn(() => Promise.resolve(null));
  const putMock = vi.fn(() => Promise.resolve({ key: '' }));
  const deleteMock = vi.fn(() => Promise.resolve(undefined));
  const aiRunMock = vi.fn(() => Promise.resolve({ response: 'mock response' }));
  const workflowCreateMock = vi.fn(() => Promise.resolve(undefined));

  return {
    env: {
      DB: {
        prepare: prepareMock,
      } as any,
      R2_BUCKET: {
        put: putMock,
        get: getMock,
        delete: deleteMock,
      } as any,
      AUDIO_PROCESSING_WORKFLOW: {
        create: workflowCreateMock,
      } as any,
      AI: {
        run: aiRunMock,
      } as any,
      ENVIRONMENT: 'development',
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

  // Ensure we have a Blob for the form data
  let blob: Blob;
  if (audioData instanceof Buffer) {
    blob = new Blob([audioData], { type: mimeType });
  } else if (audioData instanceof Blob) {
    blob = audioData;
  } else {
    // Fallback: treat as ArrayBuffer-like
    blob = new Blob([audioData as unknown as ArrayBuffer], { type: mimeType });
  }

  formData.append('audio', blob, filename);

  return new Request('http://localhost/api/v1/memo', {
    method: 'POST',
    body: formData,
  });
}
