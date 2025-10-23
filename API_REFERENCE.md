# API Reference

Complete documentation of all exposed HTTP endpoints.

**Base URL:** `https://voice-memo-task-manager-production.YOUR_SUBDOMAIN.workers.dev`

---

## Overview

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v1/memo` | `POST` | Upload audio file for processing |
| `/api/v1/memo/{taskId}` | `GET` | Get task status and results |
| `/api/v1/memo/audio/{taskId}` | `GET` | Download original audio file |

All endpoints **require** the `X-User-Id` header for authentication.

---

## 1️⃣ POST /api/v1/memo

**Upload an audio file for transcription and task extraction.**

### Request

```bash
curl -X POST https://voice-memo-task-manager-production.workers.dev/api/v1/memo \
  -H "X-User-Id: user-123" \
  -F "audio=@voice-memo.webm"
```

### Headers

| Header | Required | Description |
|--------|----------|-------------|
| `X-User-Id` | ✅ Yes | User identifier for isolation and tracking |
| `Content-Type` | Auto | Must be `multipart/form-data` |

### Body (Form Data)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `audio` | File | ✅ Yes | Audio file (WebM or MP3) |

### Accepted Audio Formats

- **WebM** (`audio/webm`) - Recommended, modern, efficient
- **MP3** (`audio/mpeg`) - Universal compatibility

### File Constraints

- **Max size:** 50 MB
- **Min size:** > 0 bytes
- **Encoding:** Must be valid audio file

### Response: 202 Accepted

Immediately returned when upload is queued for processing.

```json
{
  "taskId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "pending",
  "statusUrl": "/api/v1/memo/550e8400-e29b-41d4-a716-446655440000"
}
```

**Response Headers:**
```
HTTP/1.1 202 Accepted
Content-Type: application/json
```

### Fields

| Field | Type | Description |
|-------|------|-------------|
| `taskId` | UUID | Unique task identifier (use to check status) |
| `status` | String | Initial status: `"pending"` |
| `statusUrl` | String | Relative URL to poll for results |

---

### Error Responses

#### 400 Bad Request - Missing Audio

```bash
curl -X POST https://voice-memo-task-manager-production.workers.dev/api/v1/memo \
  -H "X-User-Id: user-123" \
  -F "empty="  # Missing 'audio' field
```

**Response:**
```json
{
  "error": "Bad Request",
  "message": "No audio file provided. Expected field: audio"
}
```

#### 400 Bad Request - Empty File

```bash
# Upload file with 0 bytes
```

**Response:**
```json
{
  "error": "Bad Request",
  "message": "Audio file is empty"
}
```

#### 400 Bad Request - Wrong Content-Type

```bash
curl -X POST https://voice-memo-task-manager-production.workers.dev/api/v1/memo \
  -H "X-User-Id: user-123" \
  -H "Content-Type: application/json" \
  -d '{"audio": "data"}'
```

**Response:**
```json
{
  "error": "Bad Request",
  "message": "Content-Type must be multipart/form-data"
}
```

#### 401 Unauthorized - Missing Auth

```bash
curl -X POST https://voice-memo-task-manager-production.workers.dev/api/v1/memo \
  -F "audio=@voice-memo.webm"  # No X-User-Id header
```

**Response:**
```json
{
  "error": "Unauthorized",
  "message": "User ID not found. Please authenticate."
}
```

#### 413 Payload Too Large

```bash
# Upload file > 50 MB
```

**Response:**
```json
{
  "error": "Payload Too Large",
  "message": "Audio file exceeds maximum size of 50MB"
}
```

#### 415 Unsupported Media Type

```bash
curl -X POST https://voice-memo-task-manager-production.workers.dev/api/v1/memo \
  -H "X-User-Id: user-123" \
  -F "audio=@image.png;type=image/png"
```

**Response:**
```json
{
  "error": "Unsupported Media Type",
  "message": "Audio file type 'image/png' is not supported. Supported formats: WebM (audio/webm) and MP3 (audio/mpeg)"
}
```

#### 500 Internal Server Error

If R2 upload or database insertion fails.

**Response:**
```json
{
  "error": "Internal Server Error",
  "message": "[Specific error details]"
}
```

---

### Usage Example (App Flow)

```typescript
// 1. Upload audio file
const formData = new FormData();
formData.append('audio', audioBlob, 'voice-memo.webm');

const uploadResponse = await fetch('/api/v1/memo', {
  method: 'POST',
  headers: {
    'X-User-Id': 'user-123'
  },
  body: formData
});

const { taskId, status } = await uploadResponse.json();
console.log(`Task created: ${taskId}`);
console.log(`Initial status: ${status}`); // "pending"

// 2. Poll for results (use taskId from above)
const statusUrl = `/api/v1/memo/${taskId}`;
```

---

## 2️⃣ GET /api/v1/memo/{taskId}

**Retrieve task status and results (transcription, extracted tasks).**

### Request

```bash
curl -H "X-User-Id: user-123" \
  https://voice-memo-task-manager-production.workers.dev/api/v1/memo/550e8400-e29b-41d4-a716-446655440000
```

### Headers

| Header | Required | Description |
|--------|----------|-------------|
| `X-User-Id` | ✅ Yes | Must match the user who uploaded the file |

### URL Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `taskId` | UUID | ✅ Yes | Task ID from upload response |

### Response: 200 OK - Pending

**When task is still processing:**

```json
{
  "taskId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "pending",
  "createdAt": "2025-10-23T15:33:49.929Z",
  "updatedAt": "2025-10-23T15:33:50.100Z"
}
```

### Response: 200 OK - Completed

**When workflow has finished processing:**

```json
{
  "taskId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "completed",
  "createdAt": "2025-10-23T15:33:49.929Z",
  "updatedAt": "2025-10-23T15:34:25.518Z",
  "transcription": "Remind me to email Jonathan about when he would be free to meet.",
  "processedTasks": [
    {
      "task": "Email Jonathan about meeting availability",
      "due": null,
      "generative_task_prompt": null
    },
    {
      "task": "Schedule follow-up",
      "due": "2025-10-24T09:00:00Z",
      "generative_task_prompt": "Draft a professional meeting request email",
      "generated_content": "Dear Jonathan,\n\nI hope this email finds you well..."
    }
  ],
  "originalAudioUrl": "/api/v1/memo/audio/550e8400-e29b-41d4-a716-446655440000"
}
```

### Response: 200 OK - Failed

**When workflow encountered an error:**

```json
{
  "taskId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "failed",
  "createdAt": "2025-10-23T15:33:49.929Z",
  "updatedAt": "2025-10-23T15:35:10.500Z",
  "error": "Failed to transcribe audio: Audio file is corrupt or too quiet"
}
```

### Response Fields

#### Always Present

| Field | Type | Description |
|-------|------|-------------|
| `taskId` | UUID | Task identifier |
| `status` | String | One of: `pending`, `processing`, `completed`, `failed` |
| `createdAt` | ISO 8601 | When task was created |
| `updatedAt` | ISO 8601 | When task was last updated |

#### Present When `status: "completed"`

| Field | Type | Description |
|-------|------|-------------|
| `transcription` | String | AI transcription of audio |
| `processedTasks` | Array | Extracted tasks (see below) |
| `originalAudioUrl` | String | URL to download original audio |

#### Present When `status: "failed"`

| Field | Type | Description |
|-------|------|-------------|
| `error` | String | Error message from workflow |

### Processed Tasks Array

Each task in `processedTasks` has:

```json
{
  "task": "Email Jonathan about meeting availability",
  "due": "2025-10-24T09:00:00Z" | null,
  "generative_task_prompt": "Draft a professional email" | null,
  "generated_content": "..." | undefined
}
```

| Field | Type | Description |
|-------|------|-------------|
| `task` | String | Clear description of the task |
| `due` | ISO 8601 \| null | Deadline if mentioned, otherwise null |
| `generative_task_prompt` | String \| null | Prompt for AI content generation, null if not needed |
| `generated_content` | String \| undefined | AI-generated content (only if prompt was provided) |

---

### Error Responses

#### 404 Not Found - Task Doesn't Exist

```bash
curl -H "X-User-Id: user-123" \
  https://voice-memo-task-manager-production.workers.dev/api/v1/memo/00000000-0000-0000-0000-000000000000
```

**Response:**
```json
{
  "error": "Not Found",
  "message": "Task not found"
}
```

*Note: Also returns 404 if the task belongs to a different user (doesn't leak task existence)*

#### 401 Unauthorized - Missing Auth

```bash
curl https://voice-memo-task-manager-production.workers.dev/api/v1/memo/550e8400-e29b-41d4-a716-446655440000
```

**Response:**
```json
{
  "error": "Unauthorized",
  "message": "User ID not found. Please authenticate."
}
```

#### 500 Internal Server Error

**Response:**
```json
{
  "error": "Internal Server Error",
  "message": "[Specific error details]"
}
```

---

### Status Lifecycle

```
Upload (POST) → 202
       ↓
    [Queue message sent]
       ↓
Poll (GET) → 200 with status: "pending"
       ↓
    [Queue consumer processes]
       ↓
Poll (GET) → 200 with status: "processing"
       ↓
    [Workflow: transcribe → extract → generate]
       ↓
    [D1 updated with results]
       ↓
Poll (GET) → 200 with status: "completed" + results
```

---

### Usage Example (App Flow)

```typescript
// Poll for results every 5 seconds
async function pollForResults(taskId: string) {
  let isComplete = false;
  let attempts = 0;

  while (!isComplete && attempts < 120) {
    const response = await fetch(`/api/v1/memo/${taskId}`, {
      headers: {
        'X-User-Id': 'user-123'
      }
    });

    const task = await response.json();

    if (task.status === 'completed') {
      console.log('Transcription:', task.transcription);
      console.log('Tasks:', task.processedTasks);
      isComplete = true;
    } else if (task.status === 'failed') {
      console.error('Error:', task.error);
      isComplete = true;
    } else {
      console.log(`Status: ${task.status}... waiting`);
      await new Promise(r => setTimeout(r, 5000)); // Wait 5 seconds
    }

    attempts++;
  }
}
```

---

## 3️⃣ GET /api/v1/memo/audio/{taskId}

**Download the original audio file that was uploaded.**

### Request

```bash
curl -H "X-User-Id: user-123" \
  https://voice-memo-task-manager-production.workers.dev/api/v1/memo/audio/550e8400-e29b-41d4-a716-446655440000 \
  -o downloaded-audio.webm
```

### Headers

| Header | Required | Description |
|--------|----------|-------------|
| `X-User-Id` | ✅ Yes | Must match the user who uploaded the file |

### URL Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `taskId` | UUID | ✅ Yes | Task ID from upload response |

### Response: 200 OK

**Returns the original audio file with appropriate headers:**

```
HTTP/1.1 200 OK
Content-Type: audio/webm
Content-Length: 45303
Cache-Control: public, max-age=31536000, immutable
```

**Body:** Binary audio file data

---

### Error Responses

#### 404 Not Found - Task Doesn't Exist

```bash
curl -H "X-User-Id: user-123" \
  https://voice-memo-task-manager-production.workers.dev/api/v1/memo/audio/00000000-0000-0000-0000-000000000000
```

**Response:**
```json
{
  "error": "Not Found",
  "message": "Audio file not found"
}
```

#### 401 Unauthorized - Missing Auth

```bash
curl https://voice-memo-task-manager-production.workers.dev/api/v1/memo/audio/550e8400-e29b-41d4-a716-446655440000
```

**Response:**
```json
{
  "error": "Unauthorized",
  "message": "User ID not found. Please authenticate."
}
```

#### 404 Not Found - File Not in R2

**Response:**
```json
{
  "error": "Not Found",
  "message": "Audio file not found in storage"
}
```

---

### Response Headers

| Header | Value | Description |
|--------|-------|-------------|
| `Content-Type` | `audio/webm` \| `audio/mpeg` \| etc | File MIME type based on extension |
| `Content-Length` | Integer | File size in bytes |
| `Cache-Control` | `public, max-age=31536000, immutable` | Cache indefinitely (file never changes) |

---

### Usage Example (App Flow)

```typescript
// Download and play original audio
async function downloadAudio(taskId: string) {
  const response = await fetch(`/api/v1/memo/audio/${taskId}`, {
    headers: {
      'X-User-Id': 'user-123'
    }
  });

  if (!response.ok) {
    const error = await response.json();
    console.error('Download failed:', error.message);
    return;
  }

  // Get audio blob
  const audioBlob = await response.blob();

  // Play in audio element
  const audio = document.createElement('audio');
  audio.src = URL.createObjectURL(audioBlob);
  audio.play();

  // Or download as file
  const url = URL.createObjectURL(audioBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'voice-memo.webm';
  a.click();
}
```

---

## Complete Usage Flow

### Step 1: Upload Audio

```bash
# User records and uploads audio
curl -X POST https://voice-memo-task-manager-production.workers.dev/api/v1/memo \
  -H "X-User-Id: user-123" \
  -F "audio=@voice-memo.webm"

# Response: 202 with taskId
# { "taskId": "550e8400-e29b-41d4-a716-446655440000", "status": "pending" }
```

### Step 2: Poll for Results

```bash
# App shows "Processing..." and polls every 5 seconds
curl -H "X-User-Id: user-123" \
  https://voice-memo-task-manager-production.workers.dev/api/v1/memo/550e8400-e29b-41d4-a716-446655440000

# Response: 200 with status updates
# { "status": "pending" }           # First few polls
# { "status": "processing" }         # Mid-processing
# { "status": "completed", ... }     # Finally done with results
```

### Step 3: Display Results or Download Original

```bash
# Once completed, show transcription and tasks to user
# If user wants to re-listen to original audio:
curl -H "X-User-Id: user-123" \
  https://voice-memo-task-manager-production.workers.dev/api/v1/memo/audio/550e8400-e29b-41d4-a716-446655440000 \
  -o voice-memo.webm

# Play the downloaded audio file
```

---

## Security & Best Practices

### Authentication
- ✅ Always include `X-User-Id` header
- ✅ Use HTTPS only (Cloudflare enforces this)
- ✅ Treat taskId as sensitive (it references user data)

### Data Isolation
- ✅ Users can only see their own tasks (filtered by userId)
- ✅ Users can only download their own audio files
- ✅ API returns 404 for tasks belonging to other users (doesn't leak existence)

### Error Handling
- ✅ All 4xx errors return JSON with `error` and `message` fields
- ✅ 500 errors include error details for debugging
- ✅ No stack traces exposed in production

### Rate Limiting
- ⚠️ Not currently implemented
- ⚠️ Recommended to add before production use
- Cloudflare recommendations: 100 requests per minute per user

### File Safety
- ✅ File type validation (WebM, MP3 only)
- ✅ File size limit (50 MB)
- ✅ Filename sanitization (uses taskId, not user-provided name)

---

## Content-Type Auto-Detection

The audio download endpoint auto-detects MIME type from file extension:

| Extension | MIME Type |
|-----------|-----------|
| `.webm` | `audio/webm` |
| `.mp3` | `audio/mpeg` |
| `.wav` | `audio/wav` |
| `.m4a` | `audio/mp4` |
| `.flac` | `audio/flac` |
| `.ogg` | `audio/ogg` |

---

## Rate Limiting Recommendations

Before deploying to production, add rate limiting:

```bash
# Example: 100 requests per minute per user
# 10 concurrent uploads per user
# 60 second timeout for long-running tasks
```

Configure in Cloudflare Dashboard → Workers → Rate Limiting

---

## Webhook Support (Future)

Currently not implemented, but could be added:
- Event: Task completed
- Event: Task failed
- Payload: Full task result
- Delivery: HTTPS POST to configured URL

---

## Versioning

Current API version: **v1**

Future versions would use:
- `/api/v2/memo` - Hypothetical future endpoint

Backward compatibility guaranteed for v1.
