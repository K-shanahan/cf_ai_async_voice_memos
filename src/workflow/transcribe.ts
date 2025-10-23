/**
 * Step 1: Transcribe audio using Cloudflare Workers AI (Whisper)
 */

interface AIEnv {
  AI?: Ai;
}

export async function transcribeAudio(
  audioBuffer: ArrayBuffer | ArrayBufferView,
  env: AIEnv
): Promise<string> {
  // Validate AI is available
  if (!env.AI) {
    throw new Error('Cloudflare Workers AI not available. Please configure AI binding in wrangler.toml');
  }

  // Normalize input to a single, known ArrayBuffer type
  let finalBuffer: ArrayBuffer;

  if (audioBuffer instanceof ArrayBuffer) {
    // Already an ArrayBuffer
    finalBuffer = audioBuffer;
  } else if (ArrayBuffer.isView(audioBuffer)) {
    const underlyingBuffer = audioBuffer.buffer;

    if (underlyingBuffer instanceof ArrayBuffer) {
      // It's a regular ArrayBuffer
      finalBuffer = underlyingBuffer.slice(
        audioBuffer.byteOffset,
        audioBuffer.byteOffset + audioBuffer.byteLength
      );
    } else if (underlyingBuffer instanceof SharedArrayBuffer) {
      // It's a SharedArrayBuffer. .slice() will create a
      // non-shared ArrayBuffer copy, which is what we want.
      // TypeScript doesn't recognize SharedArrayBuffer.slice() returns ArrayBuffer,
      // so we cast it explicitly through unknown first.
      finalBuffer = (underlyingBuffer.slice(
        audioBuffer.byteOffset,
        audioBuffer.byteOffset + audioBuffer.byteLength
      ) as unknown) as ArrayBuffer;
    } else {
      // This case should be unreachable if TS is correct,
      // but it's good for exhaustive checking.
      throw new Error('Unsupported buffer type found in ArrayBufferView');
    }
  } else {
    // TypeScript should prevent this, but be explicit for safety
    throw new Error('Audio input is not a valid ArrayBuffer or TypedArray');
  }

  // Check the size of the normalized buffer
  if (finalBuffer.byteLength === 0) {
    throw new Error('Audio buffer is empty for Whisper transcription');
  }

  try {
    console.log(`Transcribing audio buffer of size ${finalBuffer.byteLength} bytes using Whisper`);

    // Call Whisper model via Workers AI
    // Cast finalBuffer to any because the Ai type expects string but we pass ArrayBuffer
    const response = await env.AI.run('@cf/openai/whisper-large-v3-turbo', {
      audio: finalBuffer as any,
    }) as { text: string };

    if (!response || !response.text) {
      throw new Error('Whisper returned empty transcription');
    }

    console.log(`Transcription completed, text length: ${response.text.length}`);
    return response.text;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Whisper transcription failed: ${message}`, { cause: error });
  }
}
