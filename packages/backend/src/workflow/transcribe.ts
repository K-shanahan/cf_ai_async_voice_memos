/**
 * Step 1: Transcribe audio using Cloudflare Workers AI (Whisper)
 */

import type { Ai } from '@cloudflare/workers-types';

interface AIEnv {
  AI?: Ai;
}

export async function transcribeAudio(
  audioBuffer: ArrayBuffer | ArrayBufferView,
  env: AIEnv
): Promise<string> {
  if (!env.AI) {
    throw new Error('Cloudflare Workers AI not available. Please configure AI binding in wrangler.toml');
  }
  let finalBuffer: ArrayBuffer;

  if (audioBuffer instanceof ArrayBuffer) {
    finalBuffer = audioBuffer;
  } else if (ArrayBuffer.isView(audioBuffer)) {
    const underlyingBuffer = audioBuffer.buffer;
    if (underlyingBuffer instanceof ArrayBuffer) {
      finalBuffer = underlyingBuffer.slice(
        audioBuffer.byteOffset,
        audioBuffer.byteOffset + audioBuffer.byteLength
      );
    } else if (underlyingBuffer instanceof SharedArrayBuffer) {
      finalBuffer = (underlyingBuffer.slice(
        audioBuffer.byteOffset,
        audioBuffer.byteOffset + audioBuffer.byteLength
      ) as unknown) as ArrayBuffer;
    } else {
      throw new Error('Unsupported buffer type found in ArrayBufferView');
    }
  } else {
    throw new Error('Audio input is not a valid ArrayBuffer or TypedArray');
  }
  if (finalBuffer.byteLength === 0) {
    throw new Error('Audio buffer is empty for Whisper transcription');
  }
  try {
    console.log(`Transcribing audio buffer of size ${finalBuffer.byteLength} bytes using Whisper`);
    const totalStartTime = performance.now();

    // Measure base64 encoding time
    const encodeStartTime = performance.now();
    const uint8Array = new Uint8Array(finalBuffer);
    let binaryString = '';
    // Process in chunks to avoid stack overflow with large arrays
    const chunkSize = 8192;
    for (let i = 0; i < uint8Array.length; i += chunkSize) {
      binaryString += String.fromCharCode(...uint8Array.subarray(i, i + chunkSize));
    }
    const audioBase64 = btoa(binaryString);
    const encodeTime = performance.now() - encodeStartTime;
    console.log(`[Timing] Base64 encoding: ${encodeTime.toFixed(2)}ms`);

    // Measure AI model call time
    const aiCallStartTime = performance.now();
    const response = await env.AI.run('@cf/openai/whisper-large-v3-turbo', {
      audio: audioBase64,
    });
    const aiCallTime = performance.now() - aiCallStartTime;
    console.log(`[Timing] AI.run() (inference + network): ${aiCallTime.toFixed(2)}ms`);

    if (!response || !response.text) {
      throw new Error('Whisper returned empty transcription');
    }

    const totalTime = performance.now() - totalStartTime;
    console.log(`[Timing] Transcription total: ${totalTime.toFixed(2)}ms, text length: ${response.text.length}`);
    return response.text;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Whisper transcription failed: ${message}`, { cause: error });
  }
}
