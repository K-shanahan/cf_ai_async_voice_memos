#!/bin/bash

# Cloudflare Setup Script
# Automates creation of all Cloudflare resources needed for deployment
#
# Usage: ./scripts/setup-cloudflare.sh
#
# This script will:
#   1. Check prerequisites
#   2. Create D1 database
#   3. Create R2 bucket
#   4. Create Queue
#   5. Update wrangler.toml with resource IDs
#   6. Run database migrations
#   7. Deploy worker

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
  echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
  echo -e "${GREEN}✅ $1${NC}"
}

log_error() {
  echo -e "${RED}❌ $1${NC}"
}

log_step() {
  echo ""
  echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${YELLOW}$1${NC}"
  echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

# Step 0: Check prerequisites
log_step "Step 0: Checking Prerequisites"

if ! command -v wrangler &> /dev/null; then
  log_error "wrangler CLI not found. Install with: npm install -g @cloudflare/wrangler"
  exit 1
fi

if ! command -v jq &> /dev/null; then
  log_error "jq not found. Install with: brew install jq (macOS) or apt-get install jq (Linux)"
  exit 1
fi

log_success "wrangler CLI found"
log_success "jq found"

# Check authentication
log_info "Checking Cloudflare authentication..."
if ! WHOAMI=$(wrangler whoami 2>&1); then
  log_error "Not authenticated with Cloudflare. Run: wrangler login"
  exit 1
fi

ACCOUNT_ID=$(echo "$WHOAMI" | grep "Account ID" | awk '{print $NF}')
if [ -z "$ACCOUNT_ID" ]; then
  log_error "Could not extract Account ID from wrangler whoami"
  exit 1
fi

log_success "Authenticated with Cloudflare"
log_info "Account ID: $ACCOUNT_ID"

# Step 1: Create D1 Database
log_step "Step 1: Creating D1 Database"

log_info "Creating database 'task_manager'..."
D1_OUTPUT=$(wrangler d1 create task_manager --use-remote 2>&1 || true)

# Extract database ID from output
D1_ID=$(echo "$D1_OUTPUT" | grep -oP 'database_id = "\K[^"]+' | head -1)

if [ -z "$D1_ID" ]; then
  # Check if database already exists
  if echo "$D1_OUTPUT" | grep -q "already exists"; then
    log_info "Database 'task_manager' already exists"
    # Get ID from list
    D1_ID=$(wrangler d1 list 2>&1 | grep task_manager | awk '{print $2}')
  else
    log_error "Failed to create D1 database"
    echo "$D1_OUTPUT"
    exit 1
  fi
fi

if [ -z "$D1_ID" ]; then
  log_error "Could not determine D1 database ID"
  exit 1
fi

log_success "D1 Database created/found"
log_info "Database ID: $D1_ID"

# Step 2: Create R2 Bucket
log_step "Step 2: Creating R2 Bucket"

log_info "Creating bucket 'voice-memos'..."
if wrangler r2 bucket create voice-memos 2>&1 | grep -q "already exists"; then
  log_info "Bucket 'voice-memos' already exists"
else
  log_success "Bucket 'voice-memos' created"
fi

# Step 3: Create Queue
log_step "Step 3: Creating Cloudflare Queue"

log_info "Creating queue 'voice-memo-events'..."
if wrangler queues create voice-memo-events 2>&1 | grep -q "already exists"; then
  log_info "Queue 'voice-memo-events' already exists"
else
  log_success "Queue 'voice-memo-events' created"
fi

# Step 4: Update wrangler.toml
log_step "Step 4: Updating wrangler.toml"

log_info "Updating configuration file with resource IDs..."

# Backup original
cp wrangler.toml wrangler.toml.backup
log_info "Backup created: wrangler.toml.backup"

# Update account_id if not present
if ! grep -q "^account_id" wrangler.toml; then
  sed -i.tmp "1s/^/account_id = \"$ACCOUNT_ID\"\n/" wrangler.toml
  rm -f wrangler.toml.tmp
  log_info "Added account_id to wrangler.toml"
else
  sed -i.tmp "s/^account_id = .*/account_id = \"$ACCOUNT_ID\"/" wrangler.toml
  rm -f wrangler.toml.tmp
  log_info "Updated account_id in wrangler.toml"
fi

# Update database_id
sed -i.tmp "s/database_id = .*/database_id = \"$D1_ID\"/" wrangler.toml
rm -f wrangler.toml.tmp
log_info "Updated database_id in wrangler.toml"

log_success "wrangler.toml updated"

# Step 5: Run Database Migrations
log_step "Step 5: Running Database Migrations"

log_info "Creating tasks table..."
if wrangler d1 execute task_manager --remote --file migrations/001_init_schema.sql 2>&1 | grep -q "success"; then
  log_success "Database schema created"
else
  log_error "Failed to run migrations"
  exit 1
fi

# Verify schema
log_info "Verifying schema..."
TABLES=$(wrangler d1 execute task_manager --remote --command "SELECT name FROM sqlite_master WHERE type='table';" 2>&1 | jq '.results[0].results[0].name' -r)

if [ "$TABLES" = "tasks" ]; then
  log_success "Schema verified"
else
  log_error "Schema verification failed"
  exit 1
fi

# Step 6: Deploy Worker
log_step "Step 6: Deploying Worker to Cloudflare"

log_info "Building and deploying worker..."
DEPLOY_OUTPUT=$(wrangler deploy --env production 2>&1)

if echo "$DEPLOY_OUTPUT" | grep -q "Uploaded"; then
  WORKER_URL=$(echo "$DEPLOY_OUTPUT" | grep "https://" | head -1 | xargs)
  log_success "Worker deployed successfully"
  log_info "Worker URL: $WORKER_URL"
else
  log_error "Deployment failed"
  echo "$DEPLOY_OUTPUT"
  exit 1
fi

# Summary
log_step "Setup Complete! 🎉"

echo ""
echo "Resources Created:"
echo "  📊 D1 Database:    task_manager ($D1_ID)"
echo "  📦 R2 Bucket:      voice-memos"
echo "  📮 Queue:          voice-memo-events"
echo "  🚀 Worker:         $WORKER_URL"
echo ""
echo "Next Steps:"
echo "  1. Run the end-to-end test:"
echo "     ./scripts/e2e-deploy-test.sh $WORKER_URL ./test.webm"
echo ""
echo "  2. Optionally configure R2 event notifications for external uploads:"
echo "     See DEPLOYMENT.md Step 5 for instructions"
echo ""
