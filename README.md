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
- **User Isolation** - Per-user task management with authentication
- **Asynchronous Processing** - Non-blocking uploads, background workflow processing
- **Serverless** - Built on Cloudflare Workers, D1, R2, Workflows, and Queues

## Tech Stack

- **Runtime:** Cloudflare Workers
- **Database:** Cloudflare D1 (SQLite)
- **Storage:** Cloudflare R2
- **Task Queue:** Cloudflare Queues
- **Workflows:** Cloudflare Workflows (async processing)
- **AI Models:** Cloudflare Workers AI (Whisper, Llama 3)

## Architecture

```
User Upload
    ↓
Worker (POST /api/v1/memo)
    ├→ Stream to R2 (voice-memos bucket)
    ├→ Insert task record in D1
    └→ Send message to Queue
         ↓
    Queue Consumer
         ↓
    Workflow Trigger
         ├→ Fetch audio from R2
         ├→ Whisper AI (Transcription)
         ├→ Llama AI (Task Extraction)
         └→ Llama AI (Content Generation)
              ↓
         Update D1 with Results
              ↓
    User queries via GET /api/v1/memo/{taskId}
         ↓
    Response with Transcription + Tasks
```

## Project Structure

```
├── src/
│   ├── index.ts                    # Main worker & queue consumer
│   ├── handlers/
│   │   ├── memo.ts                 # POST /api/v1/memo (upload)
│   │   ├── memo-get.ts             # GET /api/v1/memo/{taskId}
│   │   └── memo-audio.ts           # GET /api/v1/memo/audio/{taskId}
│   ├── workflow/
│   │   ├── transcribe.ts           # Whisper AI integration
│   │   ├── extract.ts              # Llama task extraction
│   │   └── generate.ts             # Llama content generation
│   ├── workflow.ts                 # Workflow orchestration
│   ├── workflow-handler.ts         # Workflow entry point
│   ├── queue-consumer.ts           # Queue message handler
│   ├── db.ts                       # D1 database utilities
│   └── r2.ts                       # R2 storage utilities
├── __tests__/
│   ├── memo.test.ts                # Unit tests (upload handler)
│   ├── memo-get.test.ts            # Unit tests (get handler)
│   ├── memo-audio.test.ts          # Unit tests (audio handler)
│   ├── workflow.test.ts            # Unit tests (workflow)
│   └── memo.integration.test.ts    # Integration tests
├── migrations/
│   └── 001_init_schema.sql         # Database schema
├── scripts/
│   ├── setup-cloudflare.sh         # Automated setup script
│   ├── cleanup-data.sh             # Data cleanup script
│   ├── e2e-deploy-test.sh          # E2E test script (bash)
│   └── e2e-deploy-test.ts          # E2E test script (typescript)
├── wrangler.toml                   # Cloudflare configuration
└── package.json                    # Dependencies
```

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
