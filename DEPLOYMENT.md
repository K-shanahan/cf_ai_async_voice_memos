# Deployment & End-to-End Testing Guide

This guide covers deploying the voice memo system to Cloudflare and testing the complete workflow: **Upload → Transcribe → Extract Tasks → Generate Content → Update Database**.

## Prerequisites

You need:
1. **Cloudflare Account** with Workers, D1, R2, and Workers AI enabled
2. **Wrangler CLI** installed: `npm install -g @cloudflare/wrangler`
3. **Cloudflare API Token** with proper permissions (stored in `~/.wrangler/config.toml` or env var `CLOUDFLARE_API_TOKEN`)
4. **Account ID** from Cloudflare dashboard

## Step 1: Prepare Your Environment

```bash
# Set your Cloudflare credentials
export CLOUDFLARE_API_TOKEN="your_api_token_here"
export CLOUDFLARE_ACCOUNT_ID="your_account_id_here"

# Verify wrangler is authenticated
wrangler whoami
```

## Step 2: Create Cloudflare Resources

### 2a. Create D1 Database (Production)

```bash
# Create the D1 database in production
wrangler d1 create task_manager --remote

# The output will show your database ID. Update wrangler.toml with:
# [env.production]
# [[d1_databases]]
# binding = "DB"
# database_name = "task_manager"
# database_id = "YOUR_DATABASE_ID"  # <-- Use this ID
```

### 2b. Create R2 Bucket (Production)

```bash
# Create the R2 bucket
wrangler r2 bucket create voice-memos

# Verify it exists
wrangler r2 bucket list
```

### 2c. Update wrangler.toml

Update `wrangler.toml` with your real Cloudflare Account ID and Resource IDs:

```toml
# wrangler.toml (existing, but verify these)
name = "voice-memo-task-manager"
main = "src/index.ts"
account_id = "YOUR_ACCOUNT_ID"  # <-- Add this
compatibility_date = "2024-10-22"

[env.production]
vars = { ENVIRONMENT = "production" }
[[d1_databases]]
binding = "DB"
database_name = "task_manager"
database_id = "YOUR_DB_ID"  # <-- From Step 2a

# R2 bucket (same for dev and production)
[[r2_buckets]]
binding = "R2_BUCKET"
bucket_name = "voice-memos"
jurisdiction = "eu"

# Workflow (same for dev and production)
[[workflows]]
name = "audio-processing"
binding = "AUDIO_PROCESSING_WORKFLOW"
class_name = "AudioProcessingWorkflow"

[ai]
binding = "AI"
```

## Step 3: Run Database Migrations

```bash
# Apply migrations to the D1 database
wrangler d1 execute task_manager --remote --file migrations/001_init_schema.sql

# Verify schema was created
wrangler d1 execute task_manager --remote --command "SELECT name FROM sqlite_master WHERE type='table';"
```

## Step 4: Deploy Worker to Cloudflare

```bash
# Build and deploy to production
wrangler deploy --env production

# Output will show your Worker URL like:
# ✨ Uploaded voice-memo-task-manager successfully
# https://voice-memo-task-manager.YOUR_SUBDOMAIN.workers.dev
```

**Important:** Note your Worker URL for testing.

## Step 5: Configure R2 Event Notifications (CRITICAL!)

This is the step that enables the workflow to trigger automatically when files are uploaded.

### Option A: Using Cloudflare Dashboard (Recommended for First Setup)

1. Go to **Cloudflare Dashboard** → **R2** → **Buckets** → **voice-memos**
2. Click the bucket name to open it
3. Go to **Settings** tab
4. Scroll to **Event Notifications**
5. Click **Create Notification Rule**
6. Configure:
   - **Rule name**: `audio-processing-trigger`
   - **Event type**: Select `Object Created`
   - **Destination**: Select **Cloudflare Workflow**
   - **Workflow**: Select `audio-processing` (from your deployed app)
7. Click **Create**

### Option B: Using Wrangler CLI

```bash
# First, list your R2 buckets and get the bucket ID
wrangler r2 bucket list

# Configure event notification (requires JSON config)
# This sends R2 "Object Created" events to the workflow
wrangler r2 event-notification create \
  --bucket voice-memos \
  --event-type object-created \
  --destination-type workflow \
  --destination-id your-workflow-id
```

### Option C: Using Cloudflare API (Manual)

```bash
# Get your account ID and workflow ID first
ACCOUNT_ID="your_account_id"
WORKFLOW_ID="your_workflow_id"  # Get from dashboard

# Create the event notification
curl -X POST \
  https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/r2/buckets/voice-memos/event-notifications \
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
```

**Verify it's configured:**
```bash
# Check the R2 bucket event notifications
curl -X GET \
  https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/r2/buckets/voice-memos/event-notifications \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN"
```

## Step 6: Run the End-to-End Test

Create a test script or use curl to verify the complete flow:

```bash
#!/bin/bash

# Configuration
WORKER_URL="https://voice-memo-task-manager.YOUR_SUBDOMAIN.workers.dev"
TEST_USER_ID="deploy-test-$(date +%s)"
TEST_AUDIO_FILE="./test.webm"  # Use your test audio file

echo "🚀 Starting end-to-end deployment test"
echo "User ID: $TEST_USER_ID"
echo "Worker URL: $WORKER_URL"

# Step 1: Upload audio file
echo -e "\n📤 Step 1: Uploading audio file..."
UPLOAD_RESPONSE=$(curl -X POST \
  -H "X-User-Id: $TEST_USER_ID" \
  -F "audio=@$TEST_AUDIO_FILE" \
  "$WORKER_URL/api/v1/memo")

echo "Response: $UPLOAD_RESPONSE"

# Extract taskId from response
TASK_ID=$(echo $UPLOAD_RESPONSE | jq -r '.taskId')
if [ "$TASK_ID" == "null" ] || [ -z "$TASK_ID" ]; then
  echo "❌ Upload failed - no taskId returned"
  exit 1
fi

echo "✅ Upload successful! Task ID: $TASK_ID"

# Step 2: Poll for workflow completion
echo -e "\n⏳ Step 2: Waiting for workflow to process (this may take 30-60 seconds)..."

POLL_INTERVAL=5
MAX_WAIT=120  # 2 minutes timeout
ELAPSED=0

while [ $ELAPSED -lt $MAX_WAIT ]; do
  STATUS_RESPONSE=$(curl -s -X GET \
    -H "X-User-Id: $TEST_USER_ID" \
    "$WORKER_URL/api/v1/memo/$TASK_ID")

  STATUS=$(echo $STATUS_RESPONSE | jq -r '.status')

  case $STATUS in
    "completed")
      echo "✅ Workflow completed!"

      # Extract results
      TRANSCRIPTION=$(echo $STATUS_RESPONSE | jq -r '.transcription')
      PROCESSED_TASKS=$(echo $STATUS_RESPONSE | jq -r '.processedTasks')

      echo -e "\n📝 Transcription:"
      echo "$TRANSCRIPTION"

      echo -e "\n✅ Processed Tasks:"
      echo $PROCESSED_TASKS | jq '.'

      # Step 3: Verify database has the data
      echo -e "\n🔍 Step 3: Verifying database records..."

      # (Database verification requires direct access - see Step 6b below)

      echo -e "\n✅✅✅ END-TO-END TEST PASSED!"
      exit 0
      ;;

    "pending")
      echo "⏳ Still pending... ($ELAPSED/$MAX_WAIT seconds)"
      ;;

    "failed")
      ERROR=$(echo $STATUS_RESPONSE | jq -r '.error')
      echo "❌ Workflow failed: $ERROR"
      exit 1
      ;;

    *)
      echo "❓ Unknown status: $STATUS"
      ;;
  esac

  sleep $POLL_INTERVAL
  ELAPSED=$((ELAPSED + POLL_INTERVAL))
done

echo "❌ Timeout waiting for workflow completion ($MAX_WAIT seconds)"
exit 1
```

**Run the test:**
```bash
chmod +x e2e-test.sh
./e2e-test.sh
```

### Step 6b: Verify Database Directly

```bash
# Query the database to verify the task was recorded
wrangler d1 execute task_manager --remote --command "
  SELECT taskId, status, transcription, processedTasks
  FROM tasks
  ORDER BY createdAt DESC
  LIMIT 1;
"
```

### Step 6c: Verify R2 File Was Uploaded

```bash
# List files in R2 bucket
wrangler r2 object list voice-memos --recursive

# Download and verify a specific file
wrangler r2 object download voice-memos/uploads/$TEST_USER_ID/$TASK_ID.webm --file downloaded.webm
```

## Troubleshooting

### ❌ Upload Returns 202 but Task Never Completes

**Cause:** R2 event notifications not configured or workflow not triggered.

**Debug:**
1. Check Cloudflare Dashboard → Workers → audio-processing workflow → Recent Runs
   - If no runs show up, the trigger isn't firing

2. Verify R2 bucket event notification:
```bash
curl -s https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/r2/buckets/voice-memos/event-notifications \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" | jq .
```

3. Manually trigger the workflow (for testing):
```bash
# Get a taskId and r2Key from the database
TASK_ID="xxx"
USER_ID="xxx"
R2_KEY="uploads/$USER_ID/$TASK_ID.webm"

# Manually invoke the workflow
curl -X POST \
  https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/workflows/audio-processing/dispatch \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"bucket\": \"voice-memos\", \"key\": \"$R2_KEY\", \"eventName\": \"object-created\", \"eventTimestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}"
```

### ❌ Workflow Runs but Task Stays "failed"

**Check the error message:**
```bash
curl -s -X GET \
  -H "X-User-Id: YOUR_USER_ID" \
  "https://your-worker-url/api/v1/memo/TASK_ID" | jq '.error'
```

**Common causes:**
- Transcription failed: Check if audio file is valid format (WebM/MP3)
- Task extraction failed: Check if Llama AI is available in your account
- Missing AI binding: Verify `[ai]` section in wrangler.toml

### ❌ "Database or R2 bucket not configured"

Your `wrangler.toml` bindings don't match your deployed resources. Verify:
1. `database_id` matches the real D1 database ID
2. `bucket_name` matches the real R2 bucket name
3. Account ID is correct

```bash
# Verify resources exist
wrangler d1 list
wrangler r2 bucket list
```

## Monitoring & Observability

### View Worker Logs

```bash
# Real-time logs from your deployed Worker
wrangler tail --env production
```

### View Workflow Execution Logs

Go to **Cloudflare Dashboard** → **Workers** → **audio-processing** → **Executions**

Click on a recent execution to see:
- Input data (R2 event)
- Step-by-step execution
- Any errors encountered

### Query Completed Tasks

```bash
wrangler d1 execute task_manager --remote --command "
  SELECT
    taskId,
    userId,
    status,
    transcription,
    processedTasks,
    errorMessage,
    createdAt
  FROM tasks
  WHERE status = 'completed'
  ORDER BY createdAt DESC;
"
```

## Quick Reference: Full Deployment Command Sequence

```bash
# 1. Create resources
wrangler d1 create task_manager --remote
wrangler r2 bucket create voice-memos

# 2. Get IDs and update wrangler.toml (manual step)

# 3. Deploy
wrangler deploy --env production

# 4. Setup database
wrangler d1 execute task_manager --remote --file migrations/001_init_schema.sql

# 5. Setup R2 event notification (via Dashboard or API - see Step 5)

# 6. Test with e2e-test.sh
./e2e-test.sh
```

## Next Steps

Once the end-to-end test passes:

1. **Monitor in production**: Check `wrangler tail` for any errors
2. **Set up alerts**: Use Cloudflare alerting for workflow failures
3. **Load test**: Upload multiple files to verify scalability
4. **Backup**: Set up R2 bucket versioning and lifecycle policies
