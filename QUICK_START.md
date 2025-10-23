# Quick Start Guide - Voice Memo Task Manager Monorepo

## What You Have

A **pnpm workspaces monorepo** with:
- **Backend**: Cloudflare Workers API (fully functional)
- **Frontend**: React app (ready for development)
- **Shared**: Types and utilities (ready to use)

---

## Installation (First Time)

```bash
# Install all dependencies
pnpm install
```

---

## Development Mode

### Terminal 1: Backend (Cloudflare Worker)
```bash
pnpm dev:backend
# Runs on http://localhost:8787
```

### Terminal 2: Frontend (React)
```bash
pnpm dev:frontend
# Runs on http://localhost:5173
```

### Terminal 3: Optional - Run Tests
```bash
pnpm test:backend
```

---

## Build for Production

```bash
# Build all packages
pnpm build

# Or build individual packages
pnpm build:backend      # Prepares worker
pnpm build:frontend     # Prepares React app
pnpm build:shared       # Compiles shared types
```

---

## Project Structure Quick Reference

```
packages/
├── shared/           ← Shared types & API client
│   └── src/
│       ├── types/    ← API type definitions
│       ├── api-client/  ← HTTP client
│       └── utils/    ← Utility functions
├── backend/          ← Cloudflare Workers
│   └── src/
│       ├── handlers/  ← API endpoints
│       ├── workflow/  ← AI processing
│       └── db.ts, r2.ts  ← Storage
└── frontend/         ← React app
    └── src/
        ├── pages/    ← Page components (build here)
        ├── components/  ← React components (build here)
        └── hooks/    ← Custom hooks
```

---

## Common Tasks

### Add a Frontend Dependency
```bash
pnpm --filter @project/frontend add react-hook-form
```

### Add a Backend Dependency
```bash
pnpm --filter @project/backend add uuid
```

### Run Backend Tests
```bash
pnpm test:backend
```

### See Test Coverage
```bash
pnpm test:coverage
```

### Type Check Everything
```bash
pnpm --filter @project/shared type-check
pnpm --filter @project/backend type-check
pnpm --filter @project/frontend type-check
```

---

## Development Workflow

### 1. Frontend Components
Create components in `packages/frontend/src/components/`:
- `RecordButton.tsx` - Record audio using Web Audio API
- `MemoList.tsx` - Display all user memos
- `MemoDetail.tsx` - Show memo details with polling

### 2. Use the API Client
```typescript
// In frontend components
import { ApiClient } from '@project/shared'

const client = new ApiClient({
  baseUrl: import.meta.env.VITE_WORKER_URL,
  getAuthToken: async () => {
    // Get Clerk token
  }
})

// Use it
const memos = await client.getMemos()
```

### 3. Use Shared Types
```typescript
import type { Task, ExtractedTask, GetMemoResponse } from '@project/shared'
```

### 4. Run Tests (Backend)
```bash
pnpm test:backend
# All backend tests will pass (existing functionality intact)
```

---

## Deployment

### Backend (Cloudflare Workers)
See: `packages/backend/DEPLOYMENT.md`
```bash
pnpm deploy
```

### Frontend (Cloudflare Pages)
See: `packages/frontend/DEPLOYMENT.md`
1. Push to GitHub
2. Connect to Cloudflare Pages
3. Set environment variables
4. Auto-deploys on push

---

## Environment Variables

### Frontend (.env.local)
```
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
VITE_WORKER_URL=http://localhost:8787  (dev) or https://... (prod)
```

### Backend
Set in `wrangler.toml` or Cloudflare dashboard

---

## Helpful Commands Reference

| Command | Purpose |
|---------|---------|
| `pnpm install` | Install all dependencies |
| `pnpm dev` | Run all dev servers |
| `pnpm dev:backend` | Run backend only |
| `pnpm dev:frontend` | Run frontend only |
| `pnpm build` | Build all packages |
| `pnpm test` | Run all tests |
| `pnpm test:backend` | Run backend tests |
| `pnpm deploy` | Deploy backend |

---

## What's Working Now

✅ Backend API (Cloudflare Workers)
- `POST /api/v1/memo` - Upload audio
- `GET /api/v1/memo/{id}` - Get status/results
- `GET /api/v1/memo/audio/{id}` - Download audio
- All tests passing

✅ Shared Package
- Types for all API endpoints
- API client with auth support
- Utility functions

✅ Frontend Project
- React with TypeScript
- Clerk authentication ready
- TanStack Query configured
- Tailwind CSS ready
- Project structure ready for component development

---

## Next Steps

### Option A: Build Frontend
1. Create RecordButton component using Web Audio API
2. Create MemoList component
3. Create MemoDetail component with polling
4. Integrate with ApiClient
5. Deploy to Cloudflare Pages

### Option B: Update Backend
1. Add GET /memos endpoint (list all)
2. Add DELETE /memo/{id} endpoint
3. Update auth to use Clerk JWT (instead of X-User-Id)

### Option C: Deploy Now
See deployment guides:
- Backend: `packages/backend/DEPLOYMENT.md`
- Frontend: `packages/frontend/DEPLOYMENT.md`

---

## Need Help?

1. **Monorepo usage**: See `MONOREPO_STRUCTURE.md`
2. **Backend deployment**: See `packages/backend/DEPLOYMENT.md`
3. **Frontend deployment**: See `packages/frontend/DEPLOYMENT.md`
4. **API endpoints**: See `API_REFERENCE.md`
5. **Full migration details**: See `MONOREPO_MIGRATION.md`

---

## Quick Test

To verify everything is set up:

```bash
# Install
pnpm install

# Build shared package
pnpm build:shared

# Should output TypeScript declaration files
ls packages/shared/dist/

# Build backend
pnpm build:backend

# Run backend tests
pnpm test:backend

# Should show "All tests passed"
```

---

**Ready to start developing!** 🚀
