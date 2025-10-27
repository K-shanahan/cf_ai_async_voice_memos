# Voice Memo Task Manager

A serverless system that transcribes voice memos and automatically extracts actionable tasks using AI.

### Live Demo: https://master.voice-memo-frontend.pages.dev/ 

> **📦 Monorepo Structure**: This project is organized as a **pnpm workspaces monorepo** with three packages:
> - **`@project/shared`** - Shared types, API client, and utilities
> - **`@project/backend`** - Cloudflare Workers REST API
> - **`@project/frontend`** - React web application
>

**Upload audio → Transcribe (Whisper) → Extract Tasks (Llama) → Generate Content (Llama) → View Results**

## Features

- **Voice Memo Upload** - Upload WebM or MP3 audio files
- **AI Transcription** - Automatic transcription using Whisper
- **Task Extraction** - AI-powered task extraction from transcriptions
- **Content Generation** - AI generates detailed content for generative tasks
- **Real-time Updates** - Live progress tracking via WebSockets with automatic reconnection
- **User Isolation** - Per-user task management with authentication
- **Asynchronous Processing** - Non-blocking uploads, background workflow processing
- **Serverless** - Built on Cloudflare Workers, D1, R2, Workflows, and Queues

## Tech Stack

**Backend:**
- **Runtime:** Cloudflare Workers
- **Database:** Cloudflare D1 (SQLite)
- **Storage:** Cloudflare R2
- **Task Queue:** Cloudflare Queues
- **Workflows:** Cloudflare Workflows (async processing)
- **Real-time:** Cloudflare Durable Objects (WebSocket management)
- **AI Models:** Cloudflare Workers AI (Whisper, Llama 3)

**Frontend:**
- **Framework:** React with TypeScript
- **HTTP Client:** Tanstack Query (React Query)
- **Authentication:** Clerk
- **Real-time Updates:** Native WebSockets with automatic reconnection
- **Deployment:** Cloudflare Pages

## Architecture

### Backend Architecture

```
User Upload (REST API)
    ↓
Worker (POST /api/v1/memo)
    ├→ Stream to R2 (voice-memos bucket)
    ├→ Insert task record in D1
    └→ Send message to Queue
         ↓
    Queue Consumer
         ├→ Publishes: "workflow_started" to Durable Object
         └→ Triggers Workflow
              ↓
         Workflow Orchestration
         ├→ Fetch audio from R2
         ├→ Whisper AI (Transcription) → Publish status update
         ├→ Llama AI (Task Extraction) → Publish status update
         ├→ Llama AI (Content Generation) → Publish status update
         └→ Update D1 with Results → Publish completion
              ↓
    Task Status Durable Object
    ├→ Maintains WebSocket connections
    ├→ Broadcasts status updates to connected clients
    └→ Maintains history of last 20 updates
```

### Frontend Architecture

```
React Application
    ↓
MemoStatusProvider (Global Context)
    └→ Manages WebSocket connections per task
         ↓
    useWebSocketMemo Hook (Per-task real-time updates)
    ├→ Connects to: GET /ws/task/:taskId
    ├→ Handles: Reconnection with exponential backoff
    └→ Receives: StatusUpdate messages with stage progress
         ↓
    Components (Real-time UI)
    ├→ WorkflowProgressIndicator (Shows 4-stage timeline)
    ├→ ConnectionStatusBadge (Displays connection status)
    ├→ ErrorLogPanel (Shows workflow errors)
    └→ MemoDetail (Displays final results)
         ↓
    React Query Cache (Synced on completion)
```

```

## Project Structure

```
packages/
├── backend/
│   ├── src/
│   │   ├── index.ts                           # Main worker & WebSocket route handler
│   │   ├── handlers/
│   │   │   ├── memo.ts                        # POST /api/v1/memo (upload)
│   │   │   ├── memo-get.ts                    # GET /api/v1/memo/{taskId}
│   │   │   └── memo-audio.ts                  # GET /api/v1/memo/audio/{taskId}
│   │   ├── durable-objects/
│   │   │   └── task-status-do.ts              # WebSocket management & status broadcasting
│   │   ├── workflow/
│   │   │   ├── transcribe.ts                  # Whisper AI integration
│   │   │   ├── extract.ts                     # Llama task extraction
│   │   │   └── generate.ts                    # Llama content generation
│   │   ├── workflow.ts                        # Workflow orchestration & status publishing
│   │   ├── workflow-handler.ts                # Workflow entry point
│   │   ├── queue-consumer.ts                  # Queue message handler & workflow trigger
│   │   ├── db.ts                              # D1 database utilities
│   │   └── r2.ts                              # R2 storage utilities
│   ├── __tests__/                             # Test suite
│   ├── migrations/
│   │   └── 001_init_schema.sql                # Database schema
│   ├── wrangler.toml                          # Cloudflare Workers configuration
│   └── package.json
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── WorkflowProgressIndicator.tsx  # Real-time progress timeline
│   │   │   ├── ConnectionStatusBadge.tsx      # WebSocket connection status
│   │   │   ├── ErrorLogPanel.tsx              # Workflow error display
│   │   │   └── MemoDetail.tsx                 # Memo details with real-time updates
│   │   ├── hooks/
│   │   │   └── useWebSocketMemo.ts            # WebSocket connection per task
│   │   ├── context/
│   │   │   ├── MemoStatusProvider.tsx         # Global context for WebSocket management
│   │   │   └── memoStatusReducer.ts           # State management for memo status
│   │   ├── types/
│   │   │   └── websocket.ts                   # TypeScript types for WebSocket messages
│   │   └── index.tsx                          # React app entry point
│   ├── wrangler.toml                          # Cloudflare Pages configuration
│   └── package.json
│
└── shared/
    ├── src/
    │   ├── types/                             # Shared API types
    │   ├── api-client.ts                      # REST API client
    │   └── utils.ts                           # Shared utilities
    └── package.json
```

## Real-time Updates with WebSockets

This application uses **Cloudflare Durable Objects** and **native WebSockets** to provide real-time updates as voice memos are processed.

### How It Works

1. **Backend Publishing**: Each stage of the workflow (transcription, task extraction, content generation) publishes status updates to a Durable Object
2. **Durable Object Broadcasting**: The Task Status Durable Object maintains WebSocket connections and broadcasts updates to all connected clients
3. **Frontend Subscription**: The React frontend establishes a WebSocket connection (`GET /ws/task/:taskId`) and receives live status updates
4. **Automatic Reconnection**: If the connection drops, the client automatically reconnects with exponential backoff (up to 30 seconds)
5. **History Recovery**: New connections receive the last 20 status updates, allowing clients to recover from temporary disconnections

### Status Updates Include

- **Stage**: Current processing stage (workflow, transcribe, extract, generate, db_update)
- **Status**: Whether the stage started, completed, or failed
- **Timestamp**: When the update occurred
- **Duration**: How long the stage took (when completed)
- **Errors**: Error messages if a stage fails
- **Transcription**: Full transcript text when transcription completes

### Components

- **WorkflowProgressIndicator**: Displays a 4-stage timeline with real-time progress
- **ConnectionStatusBadge**: Shows WebSocket connection status (only visible when disconnected)
- **ErrorLogPanel**: Displays any errors that occur during processing
- **useWebSocketMemo Hook**: Custom React hook managing per-task WebSocket connections

## Contributing

Contributions welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Submit a pull request

## License

MIT


## Support

- **Issues:** [GitHub Issues](https://github.com/YOUR_USERNAME/cf_ai_async_voice_memos/issues)
- **Cloudflare Docs:** [developers.cloudflare.com](https://developers.cloudflare.com)

## Acknowledgments

- [Cloudflare Workers](https://workers.cloudflare.com)
- [Cloudflare D1](https://developers.cloudflare.com/d1/)
- [Cloudflare R2](https://www.cloudflare.com/products/r2/)
- [Cloudflare Workflows](https://developers.cloudflare.com/workflows/)
- [Cloudflare Queues](https://developers.cloudflare.com/queues/)
- [Workers AI](https://developers.cloudflare.com/workers-ai/)

This project was developed with the assistance of AI, including Claude, which helped with architecture design, code generation, and documentation.
