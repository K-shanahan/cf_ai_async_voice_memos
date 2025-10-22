/**
 * R2 storage utility functions
 */

/**
 * Upload an audio file to R2
 */
export async function uploadAudioToR2(
  bucket: R2Bucket,
  userId: string,
  taskId: string,
  audioData: ReadableStream<Uint8Array> | ArrayBuffer,
  filename: string
): Promise<string> {
  const fileExtension = getFileExtension(filename);
  const r2Key = `uploads/${userId}/${taskId}${fileExtension}`;

  await bucket.put(r2Key, audioData, {
    httpMetadata: {
      contentType: getMimeType(fileExtension),
    },
    customMetadata: {
      uploadedAt: new Date().toISOString(),
      originalName: filename,
      taskId,
      userId,
    },
  });

  return r2Key;
}

/**
 * Retrieve an audio file from R2
 */
export async function getAudioFromR2(
  bucket: R2Bucket,
  r2Key: string
): Promise<R2ObjectBody | null> {
  return await bucket.get(r2Key);
}

/**
 * Delete an audio file from R2
 */
export async function deleteAudioFromR2(bucket: R2Bucket, r2Key: string): Promise<void> {
  await bucket.delete(r2Key);
}

/**
 * Get file extension from filename
 */
function getFileExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.');
  if (lastDot === -1) return '.webm';
  return filename.substring(lastDot);
}

/**
 * Get MIME type based on file extension
 */
function getMimeType(extension: string): string {
  const mimeTypes: Record<string, string> = {
    '.webm': 'audio/webm',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.m4a': 'audio/mp4',
    '.flac': 'audio/flac',
    '.ogg': 'audio/ogg',
  };

  return mimeTypes[extension.toLowerCase()] || 'audio/webm';
}
