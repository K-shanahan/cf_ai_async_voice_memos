import type { MockWorkerContext } from '../test-utils';

/**
 * Step 2: Transcribe audio using Whisper
 */
export async function transcribeAudio(
  audioBuffer: ArrayBuffer | Buffer,
  context: MockWorkerContext
): Promise<string> {
  // In a real implementation, this would call Workers AI Whisper model
  // For testing, we return a mock transcription
  if (!audioBuffer) {
    throw new Error('Audio buffer is required for Whisper transcription');
  }

  // Check if buffer has content (ArrayBuffer has byteLength, Buffer has length)
  const size = (audioBuffer as any).byteLength || (audioBuffer as any).length;
  if (size === 0 || size === undefined) {
    throw new Error('Audio buffer is empty for Whisper transcription');
  }

  // Mock implementation for testing
  return 'Remind me to email the client tomorrow about the new proposal and draft a quick outline for it.';
}
