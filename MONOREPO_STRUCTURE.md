# Monorepo Structure - Voice Memo Task Manager

## Overview

This is a **pnpm workspaces** monorepo containing both the backend (Cloudflare Workers) and frontend (React) for the Voice Memo Task Manager application.

## Directory Layout

```
cf_ai_async_voice_memos/                 (Monorepo Root)
├── packages/
│   ├── shared/                          (Shared utilities, types, API client)
│   │   ├── src/
│   │   │   ├── types/                   (Shared API types)
│   │   │   ├── api-client/              (HTTP client for API communication)
│   │   │   └── utils/                   (Shared utility functions)
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── backend/                         (Cloudflare Workers backend)
│   │   ├── src/                         (Worker code)
│   │   │   ├── handlers/                (API route handlers)
│   │   │   ├── workflow/                (AI processing workflow)
│   │   │   ├── db.ts                    (Database operations)
│   │   │   ├── r2.ts                    (R2 bucket operations)
│   │   │   ├── queue-consumer.ts        (Queue message handler)
│   │   │   └── index.ts                 (Main worker entry point)
│   │   ├── migrations/                  (Database migrations)
│   │   ├── __tests__/                   (Backend tests)
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── vitest.config.ts
│   │   └── wrangler.toml                (Cloudflare Workers config)
│   │
│   └── frontend/                        (React frontend)
│       ├── src/
│       │   ├── components/              (React components - to be built)
│       │   ├── hooks/                   (Custom React hooks)
│       │   ├── pages/                   (Page components)
│       │   ├── types/                   (Frontend-specific types)
│       │   ├── context/                 (React Context)
│       │   ├── utils/                   (Frontend utilities)
│       │   ├── styles/                  (CSS/Tailwind)
│       │   ├── main.tsx                 (React entry point)
│       │   └── App.tsx                  (Root component)
│       ├── public/                      (Static assets)
│       ├── index.html                   (HTML template)
│       ├── package.json
│       ├── tsconfig.json
│       ├── vite.config.ts
│       ├── tailwind.config.js
│       ├── postcss.config.js
│       └── .env.example
│
├── pnpm-workspace.yaml                  (Workspace configuration)
├── package.json                         (Root package.json with scripts)
├── wrangler.toml                        (Cloudflare Workers config - at root)
├── tsconfig.json                        (Shared TypeScript config)
├── .npmrc                               (pnpm configuration)
├── .gitignore
└── Documentation/
    ├── README.md
    ├── PROJECT_SUMMARY.md
    ├── API_REFERENCE.md
    ├── DEPLOYMENT_SUMMARY.md
    ├── FRESH_DEPLOYMENT.md
    ├── DEPLOYMENT_CHECKLIST.md
    └── MONOREPO_STRUCTURE.md            (This file)
```

## Workspace Packages

### 1. `@project/shared` (Shared Package)

**Purpose**: Shared code used by both backend and frontend.

**Contents**:
- **types/**: Common API types (Task, ExtractedTask, API responses, etc.)
- **api-client/**: HTTP client with authentication support
- **utils/**: Utility functions (date formatting, status badges, etc.)

**How to use**:
```typescript
// In backend or frontend
import { ApiClient, Task, formatDate } from '@project/shared'
```

**Building**:
```bash
pnpm --filter @project/shared build
```

---

### 2. `@project/backend` (Cloudflare Workers)

**Purpose**: REST API backend running on Cloudflare Workers.

**Key Files**:
- `src/index.ts` - Main worker with route handling
- `src/handlers/` - API endpoint implementations
- `src/workflow/` - AI processing (transcription, task extraction, content generation)
- `src/db.ts` - D1 database operations
- `src/r2.ts` - R2 storage operations
- `wrangler.toml` - Cloudflare configuration

**API Endpoints**:
- `POST /api/v1/memo` - Upload voice memo
- `GET /api/v1/memos` - List all user memos
- `GET /api/v1/memo/{taskId}` - Get memo status and results
- `GET /api/v1/memo/audio/{taskId}` - Download original audio
- `DELETE /api/v1/memo/{taskId}` - Delete memo

**Development**:
```bash
cd packages/backend
pnpm dev                    # Run local worker
pnpm test                   # Run tests
pnpm test:coverage          # Generate coverage report
```

**Deployment**:
```bash
pnpm deploy                 # Deploy to Cloudflare (from root or backend)
```

---

### 3. `@project/frontend` (React App)

**Purpose**: React web frontend deployed on Cloudflare Pages.

**Key Features** (To be implemented):
- Voice recording with Web Audio API
- Real-time memo status updates (TanStack Query polling)
- Authentication with Clerk
- Memo list and detail views
- Audio download and deletion

**Tech Stack**:
- React 18+ with TypeScript
- Vite (build tool)
- TailwindCSS (styling)
- Clerk (authentication)
- TanStack Query (data fetching & caching)

**Environment Variables** (Create `.env.local`):
```
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
VITE_WORKER_URL=https://your-worker.dev  # Backend URL
```

**Development**:
```bash
cd packages/frontend
pnpm dev                    # Run dev server (port 5173)
pnpm build                  # Build for production
pnpm preview                # Preview production build
```

**Deployment**:
```bash
pnpm build:frontend         # Build from root
# Then deploy via GitHub Actions or manual upload to Cloudflare Pages
```

---

## Working with the Monorepo

### Install Dependencies

```bash
# Install all dependencies across all workspaces
pnpm install
```

### Run Development Servers

```bash
# Run backend worker dev server
pnpm dev:backend

# Run frontend dev server (in another terminal)
pnpm dev:frontend

# Or run both at once (some terminals don't support this)
pnpm dev
```

### Build All Packages

```bash
# Build all packages
pnpm build

# Or build individual packages
pnpm build:shared
pnpm build:backend
pnpm build:frontend
```

### Test

```bash
# Run all tests
pnpm test

# Run backend tests specifically
pnpm test:backend

# Run tests with UI
pnpm test:ui

# Generate coverage report
pnpm test:coverage
```

### Run Type Checking

```bash
# TypeScript type checking for all packages
pnpm --filter @project/shared type-check
pnpm --filter @project/backend type-check
pnpm --filter @project/frontend type-check
```

---

## Dependency Management

### How pnpm Workspaces Works

- **Hoisted dependencies**: Common dependencies are installed once at root
- **Workspace dependencies**: Use `workspace:*` to reference other workspace packages
- **Phantom dependencies**: pnpm prevents accessing unlisted dependencies (good for code quality)

### Adding Dependencies

**To a specific package**:
```bash
pnpm --filter @project/frontend add react-hook-form
```

**To a dev dependency**:
```bash
pnpm --filter @project/backend add -D @vitest/ui
```

**To root (shared dependencies)**:
```bash
pnpm add -w typescript
```

### Removing Dependencies

```bash
pnpm --filter @project/frontend remove react-hook-form
```

---

## Shared Code Between Backend & Frontend

### Types

Define shared API types in `packages/shared/src/types/`:
```typescript
export interface Task {
  taskId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  // ...
}
```

**Import in backend**:
```typescript
import type { Task } from '@project/shared'
```

**Import in frontend**:
```typescript
import type { Task } from '@project/shared'
```

### API Client

The `ApiClient` class in `@project/shared/api-client` is used by the frontend:
```typescript
import { ApiClient } from '@project/shared'

const client = new ApiClient({
  baseUrl: import.meta.env.VITE_WORKER_URL,
  getAuthToken: async () => {
    const token = await getToken()
    return token
  },
})

// Use client
const memos = await client.getMemos()
```

### Utilities

Common utilities are exported from `@project/shared/utils`:
```typescript
import { formatDate, getStatusBadge, formatDuration } from '@project/shared'
```

---

## Deployment

### Backend Deployment (Cloudflare Workers)

```bash
# From root directory
wrangler deploy

# Or from packages/backend
cd packages/backend
wrangler deploy
```

See `DEPLOYMENT_SUMMARY.md` for detailed instructions.

### Frontend Deployment (Cloudflare Pages)

1. **Build**:
```bash
pnpm build:frontend
```

2. **Deploy via GitHub Actions** (recommended):
   - Push code to GitHub
   - Connect repo to Cloudflare Pages
   - Set environment variables in Pages settings
   - Automatic deployment on push

3. **Manual deployment**:
```bash
wrangler pages deploy packages/frontend/dist
```

---

## Troubleshooting

### Node modules issues

If you encounter module resolution errors:
```bash
# Clear pnpm cache and reinstall
rm -rf node_modules
rm pnpm-lock.yaml
pnpm install
```

### Tests failing

```bash
# Run with debug output
pnpm test -- --reporter=verbose

# Run specific test file
pnpm --filter @project/backend test memo.test.ts
```

### Build errors

Ensure you've built dependent packages first:
```bash
pnpm build:shared
pnpm build:backend
pnpm build:frontend
```

---

## Next Steps

1. **Frontend Implementation**:
   - Implement RecordButton component
   - Implement MemoList and MemoCard components
   - Implement MemoDetail view
   - Integrate with API client
   - Add proper error handling and loading states

2. **Backend Updates** (if not yet done):
   - Add GET /api/v1/memos endpoint
   - Add DELETE /api/v1/memo/{taskId} endpoint
   - Update authentication to use Clerk JWT tokens

3. **Deployment**:
   - Setup Cloudflare Pages GitHub integration
   - Configure environment variables
   - Deploy frontend and backend

---

## Additional Resources

- **pnpm Workspaces**: https://pnpm.io/workspaces
- **Cloudflare Workers**: https://developers.cloudflare.com/workers/
- **Cloudflare Pages**: https://developers.cloudflare.com/pages/
- **React**: https://react.dev
- **Vite**: https://vitejs.dev
- **TanStack Query**: https://tanstack.com/query/latest
- **Clerk**: https://clerk.com/docs

---

## FAQ

**Q: Can I run both backend and frontend in development mode?**
A: Yes! In separate terminal windows/tabs:
```bash
# Terminal 1
pnpm dev:backend

# Terminal 2
pnpm dev:frontend
```

**Q: How do I debug backend code?**
A: Use `wrangler dev` with VS Code debugger or add `console.log` statements. Logs appear in the terminal.

**Q: Can I use environment variables in the frontend?**
A: Yes! Create `.env.local` and use `import.meta.env.VITE_*` in code.

**Q: How do I add a new workspace package?**
A: Create a new folder in `packages/`, add `package.json` with a name, and it will be automatically detected by pnpm.

**Q: Can I deploy only the frontend without touching the backend?**
A: Yes! Just run `pnpm build:frontend` and deploy to Pages independently.
