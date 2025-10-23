# Quick Start: Deployment & Testing (5 Steps)

**Goal:** Upload audio → Trigger workflow → Process with LLM → Verify in database

**Time Required:** ~20 minutes

---

## Prerequisites Check

```bash
# 1. Verify wrangler is installed
wrangler --version

# 2. Verify you have a test audio file
ls -lh test.webm

# 3. Verify Cloudflare credentials
wrangler whoami
```

If any of these fail, see troubleshooting at bottom.

---

## Step 1: Create Cloudflare Resources (5 min)

```bash
# Get your account ID (will see in output)
ACCOUNT_ID=$(wrangler whoami | grep 'Account ID' | awk '{print $NF}')
echo "Your Account ID: $ACCOUNT_ID"

# Create D1 database
wrangler d1 create task_manager --remote

# Note the database ID from output, you'll need it in next step
# It will look like: task_manager (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)

# Create R2 bucket
wrangler r2 bucket create voice-memos
```

**Save these IDs:**
- Account ID: ___________________
- Database ID: ___________________

---

## Step 2: Update wrangler.toml (2 min)

Open `wrangler.toml` and update with your IDs:

```toml
name = "voice-memo-task-manager"
main = "src/index.ts"
account_id = "YOUR_ACCOUNT_ID_HERE"  # <-- PASTE YOUR ACCOUNT ID
compatibility_date = "2024-10-22"

[env.production]
vars = { ENVIRONMENT = "production" }

# Database
[[d1_databases]]
binding = "DB"
database_name = "task_manager"
database_id = "YOUR_DATABASE_ID_HERE"  # <-- PASTE YOUR DATABASE ID

# R2 Bucket
[[r2_buckets]]
binding = "R2_BUCKET"
bucket_name = "voice-memos"
jurisdiction = "eu"
preview_bucket_name = "voice-memos-preview"

# Workflow
[[workflows]]
name = "audio-processing"
binding = "AUDIO_PROCESSING_WORKFLOW"
class_name = "AudioProcessingWorkflow"

# AI
[ai]
binding = "AI"
```

---

## Step 3: Deploy & Setup Database (3 min)

```bash
# Build and deploy to production
wrangler deploy --env production

# You'll see output like:
# ✨ Uploaded voice-memo-task-manager successfully
# https://voice-memo-task-manager.YOUR_SUBDOMAIN.workers.dev

# SAVE YOUR WORKER URL
WORKER_URL="https://voice-memo-task-manager.YOUR_SUBDOMAIN.workers.dev"

# Apply database migrations
wrangler d1 execute task_manager --remote --file migrations/001_init_schema.sql

# Verify database is ready
wrangler d1 execute task_manager --remote --command "SELECT name FROM sqlite_master WHERE type='table';"
# Should output: tasks
```

---

## Step 4: Configure R2 Event Trigger (3 min) - CRITICAL STEP

### Option A: Dashboard (Easiest)

1. Go to **Cloudflare Dashboard** (https://dash.cloudflare.com)
2. Click **R2** in left menu
3. Click **Buckets** → **voice-memos**
4. Go to **Settings** tab
5. Find **Event Notifications** section
6. Click **Create Notification Rule**
7. Fill in:
   - **Rule name**: `workflow-trigger`
   - **Event type**: Select `Object Created`
   - **Destination**: Select **Cloudflare Workflow**
   - **Workflow**: Select `audio-processing`
8. Click **Create**

### Option B: Command Line

```bash
# Get your workflow ID first
ACCOUNT_ID="your_account_id_here"
WORKFLOW_ID="audio-processing"  # Based on wrangler.toml [[workflows]] name

# Create the event notification
curl -X POST \
  "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/r2/buckets/voice-memos/event-notifications" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "rules": [{
      "actions": {
        "workflow_dispatch": {
          "workflow_id": "'$WORKFLOW_ID'"
        }
      },
      "event_types": ["object-created"],
      "filter": {
        "key": {
          "prefix": "uploads/"
        }
      }
    }]
  }'

# Verify it's configured
curl -s "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/r2/buckets/voice-memos/event-notifications" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" | jq .
```

**How to verify it worked:**
- Go to Cloudflare Dashboard → R2 → voice-memos → Settings
- Look for "Event Notifications" section
- Should show your workflow rule

---

## Step 5: Run the End-to-End Test (5 min)

```bash
# Install dependencies if needed
npm install

# Run the test script
# Make sure you use your actual Worker URL from Step 3
npx ts-node scripts/e2e-deploy-test.ts \
  --worker-url https://voice-memo-task-manager.YOUR_SUBDOMAIN.workers.dev \
  --audio-file ./test.webm \
  --timeout 120 \
  --poll-interval 5
```

**What you should see:**

```
🚀 Starting End-to-End Deployment Test
==================================================
Worker URL: https://voice-memo-task-manager.YOUR_SUBDOMAIN.workers.dev
User ID: deploy-test-1729694800000
Audio File: ./test.webm
==================================================

📤 Step 1: Uploading audio file...
   File: ./test.webm
   Size: 12345 bytes
✅ Upload successful! Status: 202
   Task ID: 550e8400-e29b-41d4-a716-446655440000
   Status URL: /api/v1/memo/550e8400-e29b-41d4-a716-446655440000

⏳ Step 2: Polling for workflow completion (timeout: 120s)...
   Polling every 5 seconds...
   ⏳ Still pending... (0/120s)
   ⏳ Still pending... (5/120s)
   🔄 Processing... (10/120s)
✅ Workflow completed!

✅ Step 3: Verifying results...

📝 Transcription:
   Hello, this is my voice memo. Please remind me to email the client.

✅ Extracted 1 task(s):

   Task 1:
      Description: Email the client
      Due: (no due date)
      AI Prompt: (none)

==================================================
✅✅✅ END-TO-END TEST PASSED!
==================================================

✅ Your system is working correctly:
   1. ✅ Audio upload to R2
   2. ✅ Workflow triggered by R2 event
   3. ✅ Transcription (Whisper)
   4. ✅ Task extraction (Llama)
   5. ✅ Content generation (Llama)
   6. ✅ Database update
```

---

## If the Test Fails

### ❌ "Task not found" or "Still pending" after 2 minutes

**Cause:** Workflow probably isn't being triggered. R2 event notification isn't configured.

**Fix:**
1. Go back to Step 4 and verify R2 event is configured
2. Check Cloudflare Dashboard → Workers → audio-processing → Executions
   - Should see recent workflow runs
   - If empty, your trigger isn't firing

**Manual test of workflow:**
```bash
# Check if workflow exists and can be invoked manually
ACCOUNT_ID="your_account_id"
WORKFLOW_ID="audio-processing"

# This manually triggers the workflow (simulates R2 event)
curl -X POST \
  "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/workflows/$WORKFLOW_ID/dispatch" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "bucket": "voice-memos",
    "key": "uploads/test-user/test-task.webm",
    "eventName": "object-created",
    "eventTimestamp": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"
  }'
```

### ❌ "Upload failed" or 401/500 error

**Check:**
```bash
# Verify your Worker is live
curl https://voice-memo-task-manager.YOUR_SUBDOMAIN.workers.dev/api/v1/memo \
  -H "X-User-Id: test" \
  -X GET

# Should return: 404 Not Found (that's OK, means Worker is running)
# If Connection refused: Worker not deployed
# If 500: Check logs with:
wrangler tail --env production
```

### ❌ Workflow runs but task status is "failed"

```bash
# Get the error message
curl -s "https://voice-memo-task-manager.YOUR_SUBDOMAIN.workers.dev/api/v1/memo/YOUR_TASK_ID" \
  -H "X-User-Id: YOUR_USER_ID" | jq '.error'

# Common errors:
# - "Failed to transcribe audio" → Audio file format issue
# - "Cloudflare Workers AI not available" → AI binding missing
# - "Audio file not found in R2" → R2 upload didn't work
```

---

## Success Checklist

- [ ] Cloudflare resources created (D1, R2)
- [ ] wrangler.toml updated with real IDs
- [ ] Worker deployed to production
- [ ] Database migrations applied
- [ ] R2 event notification configured
- [ ] Test script runs successfully
- [ ] Workflow completed in under 2 minutes
- [ ] Transcription appeared in response
- [ ] Processed tasks extracted correctly

---

## Next: Production Monitoring

```bash
# Watch logs in real-time
wrangler tail --env production

# Check recent workflow executions
# Go to: Cloudflare Dashboard → Workers → audio-processing → Executions

# Query completed tasks
wrangler d1 execute task_manager --remote --command \
  "SELECT taskId, status, transcription FROM tasks WHERE status='completed' ORDER BY createdAt DESC LIMIT 5;"
```

---

## Detailed Troubleshooting

See `DEPLOYMENT.md` for:
- Full step-by-step with explanations
- API-based configuration
- Database query examples
- Performance monitoring
- Production deployment checklist
