#!/bin/bash

# End-to-End Deployment Test (Bash wrapper)
# Usage: ./scripts/e2e-deploy-test.sh <worker-url> <audio-file>
#
# Example:
#   ./scripts/e2e-deploy-test.sh \
#     https://voice-memo-task-manager.my-app.workers.dev \
#     ./test.webm

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check arguments
if [ $# -lt 2 ]; then
  echo -e "${RED}Error: Missing arguments${NC}"
  echo "Usage: $0 <worker-url> <audio-file> [--timeout 120] [--poll-interval 5]"
  echo ""
  echo "Example:"
  echo "  ./scripts/e2e-deploy-test.sh https://voice-memo-task-manager.workers.dev ./test.webm"
  echo ""
  echo "Arguments:"
  echo "  <worker-url>        Worker URL (e.g., https://voice-memo-task-manager.my-app.workers.dev)"
  echo "  <audio-file>        Path to test audio file (WebM or MP3)"
  echo "  --timeout           Max seconds to wait for completion (default: 120)"
  echo "  --poll-interval     Seconds between status checks (default: 5)"
  exit 1
fi

WORKER_URL=$1
AUDIO_FILE=$2
TIMEOUT=120
POLL_INTERVAL=5

# Parse optional arguments
for i in "${@:3}"; do
  case $i in
    --timeout)
      TIMEOUT="${i#*=}"
      ;;
    --poll-interval)
      POLL_INTERVAL="${i#*=}"
      ;;
  esac
done

echo -e "${BLUE}════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}🚀 End-to-End Deployment Test${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════${NC}"
echo ""
echo "Worker URL:    $WORKER_URL"
echo "Audio File:    $AUDIO_FILE"
echo "Timeout:       ${TIMEOUT}s"
echo "Poll Interval: ${POLL_INTERVAL}s"
echo ""

# Verify audio file exists
if [ ! -f "$AUDIO_FILE" ]; then
  echo -e "${RED}❌ Error: Audio file not found: $AUDIO_FILE${NC}"
  exit 1
fi

# Check file size
FILE_SIZE=$(stat -c%s "$AUDIO_FILE" 2>/dev/null || stat -f%z "$AUDIO_FILE" 2>/dev/null || echo "?")
echo "File Size:     $FILE_SIZE bytes"
echo ""

# Run the TypeScript test
npx ts-node "$(dirname "$0")/e2e-deploy-test.ts" \
  --worker-url "$WORKER_URL" \
  --audio-file "$AUDIO_FILE" \
  --timeout "$TIMEOUT" \
  --poll-interval "$POLL_INTERVAL"

EXIT_CODE=$?

if [ $EXIT_CODE -eq 0 ]; then
  echo ""
  echo -e "${GREEN}════════════════════════════════════════════════════════${NC}"
  echo -e "${GREEN}✅ All tests passed!${NC}"
  echo -e "${GREEN}════════════════════════════════════════════════════════${NC}"
else
  echo ""
  echo -e "${RED}════════════════════════════════════════════════════════${NC}"
  echo -e "${RED}❌ Tests failed (exit code: $EXIT_CODE)${NC}"
  echo -e "${RED}════════════════════════════════════════════════════════${NC}"
  echo ""
  echo "Troubleshooting:"
  echo "  1. Verify R2 event notification is configured"
  echo "  2. Check Cloudflare Dashboard → Workers → audio-processing → Executions"
  echo "  3. View logs with: wrangler tail --env production"
  echo "  4. See DEPLOYMENT.md for detailed troubleshooting"
fi

exit $EXIT_CODE
