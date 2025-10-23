# Deployment Checklist

Complete this checklist to ensure your system is correctly deployed and configured.

---

## Prerequisites

- [ ] Cloudflare account with Workers, D1, R2, and AI enabled
- [ ] Wrangler CLI installed: `wrangler --version`
- [ ] Cloudflare API token: `wrangler whoami`
- [ ] Test audio file exists: `ls -lh test.webm`
- [ ] Node.js 18+ installed: `node --version`

---

## Phase 1: Create Cloudflare Resources

### Create D1 Database

```bash
wrangler d1 create task_manager --remote
```

- [ ] Command completed without errors
- [ ] Note the **Database ID** from output
- [ ] Database ID: `________________________`

**Verify:**
```bash
wrangler d1 list
# Should show: task_manager | xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx | Database
```

### Create R2 Bucket

```bash
wrangler r2 bucket create voice-memos
```

- [ ] Command completed without errors

**Verify:**
```bash
wrangler r2 bucket list
# Should show: voice-memos
```

### Get Account ID

```bash
wrangler whoami
# Look for: Account ID
```

- [ ] Account ID: `________________________`

---

## Phase 2: Update Configuration

### Update wrangler.toml

Edit `wrangler.toml`:

- [ ] Add `account_id = "YOUR_ACCOUNT_ID"`
- [ ] Add D1 `database_id` (from Phase 1)
- [ ] Verify `bucket_name = "voice-memos"`
- [ ] Verify `[[workflows]]` section exists
- [ ] Verify `[ai]` section exists

**File check:**
```bash
grep "account_id\|database_id\|bucket_name\|AI" wrangler.toml
```

Expected output:
```
account_id = "xxxxx"
database_id = "xxxxx"
bucket_name = "voice-memos"
binding = "AI"
```

---

## Phase 3: Deploy to Cloudflare

### Build and Deploy

```bash
wrangler deploy --env production
```

- [ ] Deployment completed without errors
- [ ] Note the **Worker URL** from output
- [ ] Worker URL: `________________________`

Expected output format:
```
✨ Uploaded voice-memo-task-manager successfully
https://voice-memo-task-manager.YOUR_SUBDOMAIN.workers.dev
```

**Verify Worker is live:**
```bash
curl -s https://voice-memo-task-manager.YOUR_SUBDOMAIN.workers.dev/api/v1/memo
```

- [ ] Returns JSON with error or 404 (means Worker is running)
- [ ] Does NOT return "Connection refused" or timeout

### Create Database Schema

```bash
wrangler d1 execute task_manager --remote --file migrations/001_init_schema.sql
```

- [ ] Command completed without errors

**Verify schema:**
```bash
wrangler d1 execute task_manager --remote --command "SELECT name FROM sqlite_master WHERE type='table';"
```

- [ ] Output shows: `tasks`
- [ ] Command succeeds without errors

---

## Phase 4: Configure R2 Event Notifications (CRITICAL!)

This is the step that enables automatic workflow triggering.

### Option A: Cloudflare Dashboard (Recommended)

1. [ ] Open https://dash.cloudflare.com
2. [ ] Go to **R2** → **Buckets** → **voice-memos**
3. [ ] Click **Settings** tab
4. [ ] Scroll to **Event Notifications**
5. [ ] Click **Create Notification Rule**
6. [ ] Fill in:
   - [ ] Rule name: `workflow-trigger`
   - [ ] Event type: `Object Created`
   - [ ] Destination type: `Cloudflare Workflow`
   - [ ] Workflow: `audio-processing`
7. [ ] Click **Create**

**Verify in Dashboard:**
- [ ] Go to R2 → voice-memos → Settings
- [ ] See "Event Notifications" with your rule listed

### Option B: Via API

```bash
# Set these variables
ACCOUNT_ID="your_account_id"
WORKFLOW_ID="audio-processing"

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
```

- [ ] curl command completed
- [ ] Response contains `"success": true`

**Verify via API:**
```bash
curl -s "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/r2/buckets/voice-memos/event-notifications" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" | jq '.result[0].rules[0].actions'

# Should show your workflow_id
```

---

## Phase 5: End-to-End Test

### Run the Test Script

```bash
./scripts/e2e-deploy-test.sh \
  https://voice-memo-task-manager.YOUR_SUBDOMAIN.workers.dev \
  ./test.webm
```

Or using npm:

```bash
npx ts-node scripts/e2e-deploy-test.ts \
  --worker-url https://voice-memo-task-manager.YOUR_SUBDOMAIN.workers.dev \
  --audio-file ./test.webm \
  --timeout 120
```

- [ ] Test script runs without errors
- [ ] Test completes within 120 seconds

### Verify Test Results

Expected output should show:

- [ ] Step 1: Upload successful (202 status)
- [ ] Task ID received and is valid UUID
- [ ] Step 2: Polling shows workflow completion
- [ ] Step 3: Transcription appears in output
- [ ] Processed tasks array is not empty
- [ ] Final message: "✅✅✅ END-TO-END TEST PASSED!"

### If Test Fails: Diagnose

**Test error: "Still pending" after 120 seconds**

1. [ ] Check Cloudflare Dashboard → Workers → audio-processing → Executions
   - [ ] Should see recent workflow runs
   - [ ] If empty: R2 event trigger not firing

2. [ ] Verify R2 event was created (use Dashboard or API check above)

3. [ ] Check if file actually uploaded to R2:
   ```bash
   wrangler r2 object list voice-memos --recursive
   ```
   - [ ] Should show `uploads/` directory with files

**Test error: Workflow failed with error message**

Get the error:
```bash
curl -s https://voice-memo-task-manager.YOUR_SUBDOMAIN.workers.dev/api/v1/memo/TASK_ID \
  -H "X-User-Id: YOUR_USER_ID" | jq '.error'
```

- [ ] If "Failed to transcribe": Audio file may be corrupt or unsupported format
- [ ] If "Cloudflare Workers AI not available": AI binding issue
- [ ] If "Audio file not found in R2": R2 upload problem

---

## Phase 6: Production Verification

### Monitor Workflow Executions

```bash
# Watch logs in real-time
wrangler tail --env production
```

- [ ] Logs show incoming requests and workflow triggers
- [ ] No error messages appearing

### Query Database for Completed Tasks

```bash
wrangler d1 execute task_manager --remote --command \
  "SELECT taskId, status, transcription FROM tasks WHERE status='completed' ORDER BY createdAt DESC LIMIT 5;"
```

- [ ] Shows at least one completed task
- [ ] Transcription field is not empty
- [ ] processedTasks field contains valid JSON

### Verify R2 Bucket Contents

```bash
# List all uploaded files
wrangler r2 object list voice-memos --recursive

# Download a file for verification
wrangler r2 object download voice-memos/uploads/YOUR_USER_ID/TASK_ID.webm --file downloaded.webm
```

- [ ] Files are stored in correct path: `uploads/{userId}/{taskId}.webm`
- [ ] Downloaded file is the same size as uploaded

---

## Final Verification Checklist

### System Is Working If:

- [ ] Audio upload returns 202 Accepted
- [ ] Task ID is generated as valid UUID
- [ ] Task appears in database with status = 'pending'
- [ ] R2 event fires and triggers workflow (see in Executions dashboard)
- [ ] Workflow updates task status to 'completed'
- [ ] Transcription text appears in response
- [ ] Processed tasks array contains extracted tasks
- [ ] No errors in `wrangler tail` logs
- [ ] Database queries return correct data

### If Any Check Fails:

1. [ ] Review corresponding section in `DEPLOYMENT.md`
2. [ ] Check `wrangler tail` output for specific errors
3. [ ] Verify all credentials and resource IDs match
4. [ ] Check Cloudflare Dashboard for workflow execution logs
5. [ ] Verify R2 bucket event notification is active

---

## Troubleshooting Quick Links

| Issue | Solution |
|-------|----------|
| "Cannot connect to worker" | Check Worker URL, verify `wrangler deploy` succeeded |
| "Task not found" | Verify D1 database connection, check database migration ran |
| "Still pending after 2min" | Check R2 event notification is configured (Phase 4) |
| "Workflow failed: AI not available" | Verify `[ai]` section in wrangler.toml |
| "Failed to transcribe" | Check audio file format (WebM or MP3), verify file not corrupt |
| "No tasks extracted" | Audio may not have clear speech, check Whisper transcription |

---

## Success Sign-Off

Date completed: _______________

- [ ] All phases completed
- [ ] End-to-end test passed
- [ ] System is in production
- [ ] Ready for real user traffic

**Next Steps:**
1. Monitor `wrangler tail` for 24 hours
2. Test with various audio files and content
3. Set up Cloudflare alerting for workflow failures
4. Plan for R2 bucket lifecycle policies (auto-delete old files)
5. Set up database backups and retention policies
