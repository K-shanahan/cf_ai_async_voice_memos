# Fresh Deployment Guide

Complete guide for deploying this project to a new Cloudflare account or cleaning up an existing deployment.

## Table of Contents

1. [Option A: Automated Setup (Recommended)](#option-a-automated-setup)
2. [Option B: Manual Setup](#option-b-manual-setup)
3. [Option C: Data Cleanup Only](#option-c-data-cleanup-only)
4. [Verification & Testing](#verification--testing)
5. [Troubleshooting](#troubleshooting)

---

## Option A: Automated Setup (Recommended)

**For completely fresh deployments in minutes.**

### Prerequisites

```bash
# 1. Install Wrangler CLI
npm install -g @cloudflare/wrangler

# 2. Install jq (for JSON parsing)
# macOS:
brew install jq
# Linux (Ubuntu/Debian):
sudo apt-get install jq

# 3. Login to Cloudflare
wrangler login

# 4. Have a test audio file
ls -lh test.webm
```

### Run the Setup Script

```bash
# From the project root directory
./scripts/setup-cloudflare.sh
```

**What this script does:**
1. ✅ Validates prerequisites (wrangler, jq, authentication)
2. ✅ Creates D1 database (`task_manager`)
3. ✅ Creates R2 bucket (`voice-memos`)
4. ✅ Creates Cloudflare Queue (`voice-memo-events`)
5. ✅ Updates `wrangler.toml` with all resource IDs
6. ✅ Runs database migrations
7. ✅ Deploys worker to production
8. ✅ Displays worker URL for testing

**Expected output:**
```
✅ D1 Database:    task_manager (6102d562-7162-423d-be9e-47f29fe2f705)
✅ R2 Bucket:      voice-memos
✅ Queue:          voice-memo-events
✅ Worker:         https://voice-memo-task-manager-production.YOUR_SUBDOMAIN.workers.dev

Next Steps:
  1. Run the end-to-end test:
     ./scripts/e2e-deploy-test.sh <worker-url> ./test.webm
```

### Test the Deployment

```bash
# Copy the worker URL from above
./scripts/e2e-deploy-test.sh \
  https://voice-memo-task-manager-production.YOUR_SUBDOMAIN.workers.dev \
  ./test.webm
```

**Expected result:**
```
✅ Upload successful! Status: 202
✅ Workflow completed! (after 35s)
✅ Extracted 1 task(s)
✅✅✅ END-TO-END TEST PASSED!
```

**Done!** Your system is now running. 🎉

---

## Option B: Manual Setup

**If you prefer to understand each step or the script fails.**

### Step 1: Check Authentication

```bash
wrangler whoami
# Output should show your Account ID and account name
```

Save your **Account ID** - you'll need it for `wrangler.toml`.

### Step 2: Create D1 Database

```bash
wrangler d1 create task_manager --use-remote
```

**Note the Database ID** from the output (looks like: `6102d562-7162-423d-be9e-47f29fe2f705`)

Verify it was created:
```bash
wrangler d1 list
# Should show: task_manager | <database-id> | Database
```

### Step 3: Create R2 Bucket

```bash
wrangler r2 bucket create voice-memos
```

Verify:
```bash
wrangler r2 bucket list
# Should show: voice-memos
```

### Step 4: Create Queue

```bash
wrangler queues create voice-memo-events
```

Verify:
```bash
wrangler queues list
# Should show: voice-memo-events with 1 producer and 1 consumer
```

### Step 5: Update wrangler.toml

Edit `wrangler.toml` and add your IDs:

```toml
name = "voice-memo-task-manager"
main = "src/index.ts"
account_id = "YOUR_ACCOUNT_ID_HERE"      # ← From Step 1
compatibility_date = "2024-10-22"

[env.production]
vars = { ENVIRONMENT = "production" }

# D1 Database
[[env.production.d1_databases]]
binding = "DB"
database_name = "task_manager"
database_id = "YOUR_DATABASE_ID_HERE"    # ← From Step 2

# R2 Bucket
[[env.production.r2_buckets]]
binding = "R2_BUCKET"
bucket_name = "voice-memos"

# Workflow
[[env.production.workflows]]
name = "audio-processing"
binding = "AUDIO_PROCESSING_WORKFLOW"
class_name = "AudioProcessingWorkflow"

# Queue
[[env.production.queues.producers]]
binding = "VOICE_MEMO_QUEUE"
queue = "voice-memo-events"

[[env.production.queues.consumers]]
queue = "voice-memo-events"
max_batch_size = 10
max_batch_timeout = 30
max_retries = 3
dead_letter_queue = "voice-memo-events-dlq"

# AI
[env.production.ai]
binding = "AI"
```

### Step 6: Run Database Migrations

```bash
wrangler d1 execute task_manager --remote --file migrations/001_init_schema.sql
```

Verify the schema was created:
```bash
wrangler d1 execute task_manager --remote --command \
  "SELECT name FROM sqlite_master WHERE type='table';"
# Should show: tasks
```

### Step 7: Deploy Worker

```bash
wrangler deploy --env production
```

**Note the Worker URL** from the output (looks like: `https://voice-memo-task-manager-production.k-b-shanahan.workers.dev`)

### Step 8: Test Deployment

```bash
./scripts/e2e-deploy-test.sh \
  https://voice-memo-task-manager-production.YOUR_SUBDOMAIN.workers.dev \
  ./test.webm
```

---

## Option C: Data Cleanup Only

**For resetting an existing deployment without deleting infrastructure.**

### Cleanup Script

```bash
./scripts/cleanup-data.sh
```

**What this does:**
1. ✅ Deletes ALL tasks from D1 database
2. ✅ Deletes ALL files from R2 bucket
3. ✅ Keeps the infrastructure (database, bucket, queue) intact

**Use cases:**
- Start fresh with clean data
- Test from scratch without redeploying
- Reset between test runs

**To redeploy after cleanup:**
```bash
wrangler deploy --env production
./scripts/e2e-deploy-test.sh <worker-url> ./test.webm
```

---

## Verification & Testing

### Verify All Resources Exist

```bash
# D1 Database
wrangler d1 list | grep task_manager

# R2 Bucket
wrangler r2 bucket list | grep voice-memos

# Queue
wrangler queues list | grep voice-memo-events

# Worker deployed
curl https://voice-memo-task-manager-production.YOUR_SUBDOMAIN.workers.dev/api/v1/memo
# Should return 404 (that's OK - means worker is running)
```

### Run the End-to-End Test

```bash
./scripts/e2e-deploy-test.sh \
  https://voice-memo-task-manager-production.YOUR_SUBDOMAIN.workers.dev \
  ./test.webm
```

**Expected flow:**
1. Audio file uploaded to R2 (202 response)
2. Message sent to queue
3. Queue consumer triggers workflow
4. Whisper transcribes audio
5. Llama extracts tasks
6. Llama generates content
7. Results stored in D1
8. API returns transcription + tasks

### Monitor in Real-Time

```bash
wrangler tail --env production
```

Watch logs as the test runs:
- ✅ `Queued workflow trigger for task`
- ✅ `Processing task...`
- ✅ `Extracted X tasks`
- ✅ `Successfully processed task`

### Query Database Directly

```bash
# Check completed tasks
wrangler d1 execute task_manager --remote --command \
  "SELECT taskId, status, transcription FROM tasks WHERE status='completed' LIMIT 5;"

# Check for errors
wrangler d1 execute task_manager --remote --command \
  "SELECT taskId, errorMessage FROM tasks WHERE status='failed';"
```

### Verify R2 Storage

```bash
# List all uploaded files
wrangler r2 object list voice-memos --recursive

# Download a file
wrangler r2 object download voice-memos/uploads/USER_ID/TASK_ID.webm --file downloaded.webm
```

---

## Troubleshooting

### ❌ "wrangler: command not found"

```bash
npm install -g @cloudflare/wrangler
wrangler --version
```

### ❌ "Not authenticated with Cloudflare"

```bash
wrangler login
# Opens browser to authorize Cloudflare
```

### ❌ "D1 database already exists"

If you're redeploying in the same account, the setup script handles this automatically.

To use an **existing database**:
1. Get the database ID: `wrangler d1 list`
2. Update `wrangler.toml` with the existing ID
3. Skip database creation steps

### ❌ "Deploy failed: binding not found"

Make sure all resource IDs in `wrangler.toml` match your actual resources:

```bash
# Check each resource exists
wrangler d1 list
wrangler r2 bucket list
wrangler queues list

# Re-verify wrangler.toml has matching IDs
grep "database_id\|bucket_name\|queue" wrangler.toml
```

### ❌ "Test times out - Still pending after 120s"

The workflow isn't being triggered. Verify:

1. **Queue is working:**
   ```bash
   wrangler queues list
   # Should show: voice-memo-events with 1 producer, 1 consumer
   ```

2. **Worker deployed correctly:**
   ```bash
   wrangler deploy --env production
   # Should show: "Consumer for voice-memo-events"
   ```

3. **Check worker logs:**
   ```bash
   wrangler tail --env production
   # Run test again and watch for "Queued workflow trigger"
   ```

### ❌ "Upload returns 500: no such table"

Database migrations didn't run:

```bash
wrangler d1 execute task_manager --remote --file migrations/001_init_schema.sql
wrangler d1 execute task_manager --remote --command \
  "SELECT name FROM sqlite_master WHERE type='table';"
# Should show: tasks
```

### ❌ "Workflow failed: Cloudflare Workers AI not available"

Workers AI binding is missing. Verify in `wrangler.toml`:

```toml
[env.production.ai]
binding = "AI"
```

Then redeploy:
```bash
wrangler deploy --env production
```

---

## For Other People Deploying This

When sharing this project with others, tell them:

1. **Fork/Clone the repository**
   ```bash
   git clone https://github.com/YOUR_USERNAME/cf_ai_async_voice_memos.git
   cd cf_ai_async_voice_memos
   npm install
   ```

2. **Run the setup script**
   ```bash
   ./scripts/setup-cloudflare.sh
   ```

3. **Test the deployment**
   ```bash
   # Copy worker URL from setup script output
   ./scripts/e2e-deploy-test.sh <worker-url> ./test.webm
   ```

**That's it!** Everything is automated.

---

## Environment-Specific Deployments

To deploy to multiple environments (dev, staging, production):

### Create Environment Configs

```toml
# In wrangler.toml, create different environments:

[env.development]
vars = { ENVIRONMENT = "development" }
[[env.development.d1_databases]]
binding = "DB"
database_name = "task_manager"
database_id = "dev-database-id"

[env.staging]
vars = { ENVIRONMENT = "staging" }
[[env.staging.d1_databases]]
binding = "DB"
database_name = "task_manager"
database_id = "staging-database-id"

[env.production]
vars = { ENVIRONMENT = "production" }
[[env.production.d1_databases]]
binding = "DB"
database_name = "task_manager"
database_id = "prod-database-id"
```

### Deploy to Different Environments

```bash
# Deploy to development
wrangler deploy --env development

# Deploy to staging
wrangler deploy --env staging

# Deploy to production
wrangler deploy --env production
```

---

## Next Steps

- ✅ Deployment complete
- ✅ End-to-end test passed
- ⏭️ **Set up monitoring**: `wrangler tail --env production`
- ⏭️ **Configure backups**: R2 versioning, D1 backups
- ⏭️ **Set up alerts**: Cloudflare dashboard → Notifications
- ⏭️ **Production readiness**: Review DEPLOYMENT.md for production checklist
