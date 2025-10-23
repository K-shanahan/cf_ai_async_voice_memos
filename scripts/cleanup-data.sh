#!/bin/bash

# Cleanup Data Script
# Clears all data from D1 and R2 buckets while keeping the infrastructure intact
# Useful for: restarting with clean data, testing fresh deployments
#
# Usage: ./scripts/cleanup-data.sh
# This will prompt for confirmation before deleting anything

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}════════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}🧹 Data Cleanup Script${NC}"
echo -e "${YELLOW}════════════════════════════════════════════════════════${NC}"
echo ""
echo "This script will:"
echo "  1. Delete ALL tasks from D1 database (tasks table)"
echo "  2. Delete ALL files from R2 bucket (voice-memos)"
echo ""
echo "⚠️  This action CANNOT be undone!"
echo ""

# Confirmation
read -p "Are you sure? (type 'yes' to continue): " confirmation

if [ "$confirmation" != "yes" ]; then
  echo "❌ Cancelled"
  exit 0
fi

echo ""
echo -e "${YELLOW}Proceeding with cleanup...${NC}"
echo ""

# Step 1: Clear D1 Database
echo "🗄️  Step 1: Clearing D1 database..."
echo "     Deleting all rows from tasks table..."

wrangler d1 execute task_manager --remote --command "DELETE FROM tasks;"

# Verify deletion
REMAINING=$(wrangler d1 execute task_manager --remote --command "SELECT COUNT(*) as count FROM tasks;" | jq '.results[0].results[0].count' 2>/dev/null || echo "error")

if [ "$REMAINING" -eq 0 ]; then
  echo -e "     ${GREEN}✅ Database cleared${NC}"
else
  echo -e "     ${RED}❌ Failed to clear database${NC}"
  exit 1
fi

# Step 2: Clear R2 Bucket
echo ""
echo "📦 Step 2: Clearing R2 bucket..."
echo "     Deleting all files from voice-memos..."

# List all files and delete them
FILES=$(wrangler r2 object list voice-memos --recursive --json 2>/dev/null | jq -r '.[].key' 2>/dev/null || true)

if [ -z "$FILES" ]; then
  echo -e "     ${GREEN}✅ Bucket already empty${NC}"
else
  FILE_COUNT=$(echo "$FILES" | wc -l)
  echo "     Found $FILE_COUNT file(s) to delete..."

  echo "$FILES" | while read -r file; do
    if [ -n "$file" ]; then
      wrangler r2 object delete "voice-memos/$file" 2>/dev/null || true
      echo "     Deleted: $file"
    fi
  done

  echo -e "     ${GREEN}✅ Bucket cleared${NC}"
fi

# Summary
echo ""
echo -e "${GREEN}════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}✅ Cleanup Complete!${NC}"
echo -e "${GREEN}════════════════════════════════════════════════════════${NC}"
echo ""
echo "Database status:"
wrangler d1 execute task_manager --remote --command "SELECT COUNT(*) as task_count FROM tasks;" | jq '.results[0].results[0]'

echo ""
echo "R2 bucket status:"
wrangler r2 bucket list | grep voice-memos

echo ""
echo "You can now redeploy or run the e2e test again:"
echo "  ./scripts/e2e-deploy-test.sh <worker-url> ./test.webm"
echo ""
