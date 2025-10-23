# Backend Deployment Guide - Cloudflare Workers

This guide explains how to deploy the Voice Memo Task Manager backend to Cloudflare Workers.

## Prerequisites

1. **Cloudflare Account** with Workers plan
2. **Wrangler CLI** installed (`npm install -g wrangler` or use `pnpm`)
3. **Cloudflare Login**: `wrangler login`
4. **Account ID and Zone ID** from Cloudflare dashboard

## Configuration Files

### wrangler.toml

Located at `packages/backend/wrangler.toml` (or root for main config):

```toml
name = "voice-memo-task-manager"
main = "src/index.ts"
account_id = "YOUR_ACCOUNT_ID"
compatibility_date = "2024-10-22"

[env.production]
vars = { ENVIRONMENT = "production" }

[[env.production.d1_databases]]
binding = "DB"
database_name = "task_manager"
database_id = "YOUR_DATABASE_ID"

[[env.production.r2_buckets]]
binding = "R2_BUCKET"
bucket_name = "voice-memos"

[[env.production.workflows]]
name = "audio-processing"
binding = "AUDIO_PROCESSING_WORKFLOW"
class_name = "AudioProcessingWorkflow"

[env.production.ai]
binding = "AI"

[[env.production.queues.producers]]
binding = "VOICE_MEMO_QUEUE"
queue = "voice-memo-events"

[[env.production.queues.consumers]]
queue = "voice-memo-events"
max_batch_size = 10
max_batch_timeout = 30
max_retries = 3
dead_letter_queue = "voice-memo-events-dlq"
```

## Step-by-Step Deployment

### 1. Setup Cloudflare Resources

If using the automated setup script:

```bash
./scripts/setup-cloudflare.sh
```

This script creates:
- D1 Database (`task_manager`)
- R2 Bucket (`voice-memos`)
- Cloudflare Queue (`voice-memo-events`)
- Workflow configuration

### 2. Update wrangler.toml

Replace placeholders with your values:

```bash
# Get your account ID
wrangler whoami

# Update wrangler.toml with:
# - account_id: YOUR_ACCOUNT_ID (from whoami output)
# - database_id: YOUR_DATABASE_ID (from Cloudflare dashboard)
```

### 3. Run Database Migrations

```bash
# From backend directory
wrangler d1 migrations apply task_manager --remote

# Or locally for testing
wrangler d1 migrations apply task_manager
```

This creates the `tasks` table with the proper schema.

### 4. Deploy to Production

```bash
# From root directory
pnpm deploy

# Or from backend directory
cd packages/backend
pnpm deploy

# Or using wrangler directly
wrangler publish --env production
```

### 5. Verify Deployment

Test the endpoint:

```bash
# Replace YOUR_WORKER_URL with your deployed worker URL
curl -X GET https://your-worker.dev/api/v1/memos \
  -H "X-User-Id: test-user-123"

# Expected response:
# { "memos": [], "total": 0, "hasMore": false }
```

## Environment-Specific Deployment

### Development Environment

```bash
wrangler dev
```

Runs locally on `http://localhost:8787`

### Production Environment

```bash
wrangler publish --env production
```

Deploys to production URL.

## Managing Resources

### Database Management

```bash
# List databases
wrangler d1 list

# Backup database
wrangler d1 backup create task_manager

# Run SQL query
wrangler d1 execute task_manager --command "SELECT COUNT(*) FROM tasks;"

# Access DB locally
wrangler d1 execute task_manager --local --command "SELECT * FROM tasks LIMIT 5;"
```

### R2 Bucket Management

```bash
# List buckets
wrangler r2 bucket list

# Upload a file (for testing)
wrangler r2 object put voice-memos/test.webm ./test.webm

# List objects in bucket
wrangler r2 object list voice-memos

# Delete an object
wrangler r2 object delete voice-memos/test.webm
```

### Queue Management

```bash
# List queues
wrangler queues list

# Purge queue (clear all messages)
wrangler queues purge voice-memo-events

# Monitor queue (doesn't exist yet, use logs instead)
wrangler tail  # Shows real-time logs
```

## Monitoring & Logging

### Real-time Logs

```bash
# Stream logs from production
wrangler tail --env production

# Stream logs from local dev
wrangler dev --remote  # Then run your app
```

### Cloudflare Dashboard

1. Go to **Workers & Pages > Overview**
2. Select your worker
3. View **Logs**, **Analytics**, **Exceptions**

## Scaling & Performance

### Auto-scaling

Cloudflare Workers automatically scales - no configuration needed.

### Request Limits

- Default: 100,000 requests/day on free plan
- Upgrade to paid plan for higher limits

### Database Connections

D1 has built-in connection pooling. No additional setup needed.

## Troubleshooting

### Worker Won't Deploy

**Error**: `Authentication failed`
**Solution**:
```bash
wrangler logout
wrangler login
# Re-run deploy
```

### Database Migrations Fail

**Error**: `Migration table already exists`
**Solution**:
```bash
# Check existing migrations
wrangler d1 migrations list

# If stuck, create new database
wrangler d1 create task_manager_v2
# Update wrangler.toml with new database_id
```

### R2 Bucket Permission Denied

**Error**: `Access Denied` when writing to bucket
**Solution**:
1. Check bucket policy in Cloudflare dashboard
2. Ensure worker has `R2_BUCKET` binding
3. Verify bucket name in wrangler.toml

### Queue Messages Not Processing

**Check**:
1. Queue consumer is deployed
2. Queue binding exists in wrangler.toml
3. Messages are being published

**Debug**:
```bash
wrangler tail  # View consumer logs
```

### Workflow Not Triggering

**Check**:
1. Workflow class is exported from index.ts
2. Class name in wrangler.toml matches
3. R2 event is configured

**Debug**:
```bash
# View workflow status
wrangler workflows view audio-processing
```

## Cost Optimization

### Reduce Database Usage
- Use pagination with LIMIT/OFFSET
- Index frequently queried columns
- Archive old data regularly

### Reduce R2 Storage
- Delete audio after processing (optional)
- Compress older audio files
- Archive to cheaper storage

### Reduce Queue Usage
- Batch messages if possible
- Set appropriate batch timeouts
- Monitor dead letter queue

## Production Checklist

- [ ] Database migrations applied
- [ ] R2 bucket created and accessible
- [ ] Queue configured with dead letter queue
- [ ] Workflow class exported and configured
- [ ] Environment variables set (.env.production)
- [ ] Authentication configured (Clerk JWT)
- [ ] CORS headers configured if needed
- [ ] Logging and monitoring enabled
- [ ] Database backups configured
- [ ] API endpoints tested with real data
- [ ] Error handling tested
- [ ] Load tested with expected traffic
- [ ] Monitoring alerts configured

## Rollback

If you need to rollback to a previous version:

```bash
# List deployments
wrangler rollback --list

# Rollback to specific version
wrangler rollback --version VERSION_ID

# Or manually deploy previous code
git checkout <previous-commit>
wrangler publish --env production
```

## Additional Resources

- **Wrangler Docs**: https://developers.cloudflare.com/workers/wrangler/
- **Workers Docs**: https://developers.cloudflare.com/workers/
- **D1 Docs**: https://developers.cloudflare.com/d1/
- **R2 Docs**: https://developers.cloudflare.com/r2/
- **Queues Docs**: https://developers.cloudflare.com/queues/
- **Workflows Docs**: https://developers.cloudflare.com/workflows/

---

See `../MONOREPO_STRUCTURE.md` for information about the project structure and other packages.
