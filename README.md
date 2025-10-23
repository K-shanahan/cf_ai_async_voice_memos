# Voice Memo Task Manager

A serverless system that transcribes voice memos and automatically extracts actionable tasks using AI.

> **📦 Monorepo Structure**: This project is organized as a **pnpm workspaces monorepo** with three packages:
> - **`@project/shared`** - Shared types, API client, and utilities
> - **`@project/backend`** - Cloudflare Workers REST API
> - **`@project/frontend`** - React web application
>
> See [MONOREPO_STRUCTURE.md](./MONOREPO_STRUCTURE.md) for detailed information about the project layout and how to work with it.

**Upload audio → Transcribe (Whisper) → Extract Tasks (Llama) → Generate Content (Llama) → View Results**

## Features

- 🎙️ **Voice Memo Upload** - Upload WebM or MP3 audio files
- 🤖 **AI Transcription** - Automatic transcription using Whisper
- ✅ **Task Extraction** - AI-powered task extraction from transcriptions
- 📝 **Content Generation** - AI generates detailed content for generative tasks
- 🔐 **User Isolation** - Per-user task management with authentication
- 📦 **Asynchronous Processing** - Non-blocking uploads, background workflow processing
- 🌍 **Serverless** - Built on Cloudflare Workers, D1, R2, Workflows, and Queues

## Tech Stack

- **Runtime:** Cloudflare Workers
- **Database:** Cloudflare D1 (SQLite)
- **Storage:** Cloudflare R2
- **Task Queue:** Cloudflare Queues
- **Workflows:** Cloudflare Workflows (async processing)
- **AI Models:** Cloudflare Workers AI (Whisper, Llama 3)

## Quick Start

### Option A: Automated Setup (Recommended)

```bash
# 1. Clone the repository
git clone https://github.com/YOUR_USERNAME/cf_ai_async_voice_memos.git
cd cf_ai_async_voice_memos

# 2. Install dependencies
npm install

# 3. Login to Cloudflare
wrangler login

# 4. Run the setup script (creates all resources automatically)
./scripts/setup-cloudflare.sh

# 5. Test the deployment
./scripts/e2e-deploy-test.sh <worker-url> ./test.webm
```

**That's it!** Your system is running.

### Option B: Manual Setup

See [FRESH_DEPLOYMENT.md](FRESH_DEPLOYMENT.md) for step-by-step instructions.

## Documentation

- **[FRESH_DEPLOYMENT.md](FRESH_DEPLOYMENT.md)** - Complete guide for fresh deployments
- **[QUICK_START_DEPLOYMENT.md](QUICK_START_DEPLOYMENT.md)** - 5-step quick reference
- **[DEPLOYMENT.md](DEPLOYMENT.md)** - Detailed deployment & configuration
- **[DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md)** - Verification checklist

## API Endpoints

### Upload Audio
```bash
curl -X POST https://your-worker.workers.dev/api/v1/memo \
  -H "X-User-Id: user-123" \
  -F "audio=@voice-memo.webm"
```

**Response (202 Accepted):**
```json
{
  "taskId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "pending",
  "statusUrl": "/api/v1/memo/550e8400-e29b-41d4-a716-446655440000"
}
```

### Get Task Status & Results
```bash
curl https://your-worker.workers.dev/api/v1/memo/550e8400-e29b-41d4-a716-446655440000 \
  -H "X-User-Id: user-123"
```

**Response (200 OK):**
```json
{
  "taskId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "completed",
  "transcription": "Remind me to plan out how I'm going to revise my modules this week.",
  "processedTasks": [
    {
      "task": "Plan out revision of modules",
      "due": null,
      "generative_task_prompt": "Plan out a strategy for revising modules",
      "generated_content": "Here's a comprehensive strategy..."
    }
  ],
  "originalAudioUrl": "/api/v1/memo/audio/550e8400-e29b-41d4-a716-446655440000"
}
```

### Download Original Audio
```bash
curl https://your-worker.workers.dev/api/v1/memo/audio/550e8400-e29b-41d4-a716-446655440000 \
  -H "X-User-Id: user-123" \
  -o voice-memo.webm
```

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

## Testing

### Run End-to-End Test
```bash
./scripts/e2e-deploy-test.sh https://your-worker.workers.dev ./test.webm
```

### Monitor Live Logs
```bash
wrangler tail --env production
```

### Query Database
```bash
wrangler d1 execute task_manager --remote --command \
  "SELECT taskId, status, transcription FROM tasks LIMIT 5;"
```

## Data Cleanup

Reset all data without deleting infrastructure:
```bash
./scripts/cleanup-data.sh
```

This deletes:
- All tasks from D1
- All audio files from R2
- Keeps databases, buckets, and queues intact

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

## Development

### Local Testing
```bash
# Run unit tests
npm test

# Run integration tests (requires `wrangler dev` running)
npm test -- memo.integration.test.ts

# Watch mode
npm test -- --watch
```

### Local Development Server
```bash
wrangler dev
# Worker runs at http://localhost:8787
```

## Environment Variables

Configure via `wrangler.toml` or `.dev.vars`:

```toml
[env.production]
vars = { ENVIRONMENT = "production" }
```

**Bindings (auto-configured):**
- `DB` - D1 Database
- `R2_BUCKET` - R2 Bucket
- `VOICE_MEMO_QUEUE` - Message Queue
- `AUDIO_PROCESSING_WORKFLOW` - Workflow
- `AI` - Workers AI

## Performance

| Operation | Time |
|-----------|------|
| Audio Upload | <1s |
| Queue Processing | ~2-5s |
| Workflow Execution | ~3-5min (depending on audio length) |
| Database Replication | ~30-40s (eventual consistency) |

**Total:** ~3-6 minutes from upload to completion

## Limitations

- Max audio file: 50MB
- Max transcription time: ~5 minutes (Cloudflare timeout)
- Supported formats: WebM, MP3
- Database: SQLite (100GB max per D1)
- R2 storage: Pay-per-use, no limits

## Production Checklist

Before deploying to production:

- [ ] Configure custom domain
- [ ] Set up authentication (OAuth, JWT, etc.)
- [ ] Enable R2 bucket versioning
- [ ] Configure D1 backups
- [ ] Set up Cloudflare alerts
- [ ] Enable WAF rules
- [ ] Configure rate limiting
- [ ] Test with real audio files
- [ ] Monitor costs (Workers, D1, R2, AI)

See [DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md) for details.

## Troubleshooting

### "Task stays pending"
- Check worker logs: `wrangler tail --env production`
- Verify queue consumer: `wrangler queues list`
- Check workflow executions in Cloudflare Dashboard

### "Upload returns 500"
- Verify database migrations: `wrangler d1 list`
- Check R2 bucket exists: `wrangler r2 bucket list`
- Review worker logs for specific errors

### "Test times out"
- Increase timeout: `--timeout 300`
- Monitor logs: `wrangler tail --env production`
- Check D1 replication status

See [FRESH_DEPLOYMENT.md#troubleshooting](FRESH_DEPLOYMENT.md#troubleshooting) for more.

## Contributing

Contributions welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Submit a pull request

## License

MIT

## Support

- **Documentation:** See [FRESH_DEPLOYMENT.md](FRESH_DEPLOYMENT.md)
- **Issues:** [GitHub Issues](https://github.com/YOUR_USERNAME/cf_ai_async_voice_memos/issues)
- **Cloudflare Docs:** [developers.cloudflare.com](https://developers.cloudflare.com)

## Acknowledgments

- [Cloudflare Workers](https://workers.cloudflare.com)
- [Cloudflare D1](https://developers.cloudflare.com/d1/)
- [Cloudflare R2](https://www.cloudflare.com/products/r2/)
- [Cloudflare Workflows](https://developers.cloudflare.com/workflows/)
- [Cloudflare Queues](https://developers.cloudflare.com/queues/)
- [Workers AI](https://developers.cloudflare.com/workers-ai/)
