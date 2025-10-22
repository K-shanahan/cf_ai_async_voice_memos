import { v4 as uuidv4 } from 'uuid';
import { createTask } from '../db';
import { uploadAudioToR2, deleteAudioFromR2 } from '../r2';

interface WorkerContext {
  env: {
    DB: D1Database;
    R2_BUCKET: R2Bucket;
  };
  data: {
    userId?: string;
  };
}

const ALLOWED_MIME_TYPES = [
  'audio/webm',
  'audio/mpeg',
  'audio/wav',
  'audio/mp4',
  'audio/flac',
  'audio/ogg',
];
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

/**
 * Handler for POST /api/v1/memo
 * Uploads a voice memo and returns a task ID
 */
export async function handlePostMemo(
  request: Request,
  context: WorkerContext
): Promise<Response> {
  let uploadedR2Key: string | null = null;

  try {
    // 1. Authenticate user
    const userId = context.data.userId;
    if (!userId) {
      return new Response(
        JSON.stringify({
          error: 'Unauthorized',
          message: 'User ID not found. Please authenticate.',
        }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // 2. Validate content type
    const contentType = request.headers.get('content-type') || '';
    if (!contentType.includes('multipart/form-data')) {
      return new Response(
        JSON.stringify({
          error: 'Bad Request',
          message: 'Content-Type must be multipart/form-data',
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // 3. Parse FormData
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return new Response(
        JSON.stringify({
          error: 'Bad Request',
          message: 'Invalid FormData',
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // 4. Extract audio file
    const audioFile = formData.get('audio');
    if (!audioFile || !(audioFile instanceof File)) {
      return new Response(
        JSON.stringify({
          error: 'Bad Request',
          message: 'No audio file provided. Expected field: audio',
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // 5. Validate file is not empty
    if (audioFile.size === 0) {
      return new Response(
        JSON.stringify({
          error: 'Bad Request',
          message: 'Audio file is empty',
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // 6. Validate file size
    if (audioFile.size > MAX_FILE_SIZE) {
      return new Response(
        JSON.stringify({
          error: 'Payload Too Large',
          message: `Audio file exceeds maximum size of ${MAX_FILE_SIZE / 1024 / 1024}MB`,
        }),
        {
          status: 413,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // 7. Validate file MIME type
    if (!ALLOWED_MIME_TYPES.includes(audioFile.type)) {
      return new Response(
        JSON.stringify({
          error: 'Unsupported Media Type',
          message: `Audio file type '${audioFile.type}' is not supported. Supported types: ${ALLOWED_MIME_TYPES.join(', ')}`,
        }),
        {
          status: 415,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // 8. Generate task ID
    const taskId = uuidv4();

    // 9. Validate services are available
    const { DB: db, R2_BUCKET: r2Bucket } = context.env;

    if (!db || !r2Bucket) {
      return new Response(
        JSON.stringify({
          error: 'Internal Server Error',
          message: 'Database or R2 bucket not configured',
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // 10. Upload to R2
    const audioBuffer = await audioFile.arrayBuffer();

    uploadedR2Key = await uploadAudioToR2(
      r2Bucket,
      userId,
      taskId,
      audioBuffer,
      audioFile.name || 'audio.webm'
    );

    // 11. Create database record
    try {
      await createTask(db, taskId, userId, uploadedR2Key);
    } catch (dbError) {
      // Cleanup: Delete orphaned R2 file
      console.error('Database insert failed, cleaning up R2 file:', uploadedR2Key);
      try {
        await deleteAudioFromR2(r2Bucket, uploadedR2Key);
      } catch (cleanupError) {
        console.error('Failed to cleanup R2 file:', cleanupError);
      }
      throw dbError;
    }

    // 12. Return 202 Accepted response
    return new Response(
      JSON.stringify({
        taskId,
        status: 'pending',
        statusUrl: `/api/v1/memo/${taskId}`,
      }),
      {
        status: 202,
        statusText: 'Accepted',
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error in handlePostMemo:', error);

    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';

    return new Response(
      JSON.stringify({
        error: 'Internal Server Error',
        message: errorMessage,
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}
