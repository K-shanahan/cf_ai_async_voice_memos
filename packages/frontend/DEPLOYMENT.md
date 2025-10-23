# Frontend Deployment Guide - Cloudflare Pages

This guide explains how to deploy the Voice Memo Task Manager frontend to Cloudflare Pages.

## Prerequisites

1. **Cloudflare Account** - Same account as your Workers backend
2. **GitHub Repository** - Frontend code must be in GitHub
3. **Environment Variables**:
   - `VITE_CLERK_PUBLISHABLE_KEY` - Clerk publishable key
   - `VITE_WORKER_URL` - Backend worker URL

## Option 1: GitHub Integration (Recommended)

### Setup Steps

1. **Push code to GitHub** (if not already):
   ```bash
   git add .
   git commit -m "Initial monorepo commit"
   git push origin main
   ```

2. **Connect to Cloudflare Pages**:
   - Go to https://dash.cloudflare.com/
   - Select your domain
   - Navigate to **Pages**
   - Click **Create a project**
   - Select **Connect to Git**
   - Authorize GitHub and select your repository
   - Select your branch (usually `main`)

3. **Configure build settings**:
   - **Build command**: `pnpm build --filter @project/frontend`
   - **Build output directory**: `packages/frontend/dist`
   - **Root directory** (advanced): Leave empty or set to repo root
   - **Node.js version**: 20.x (or latest stable)

4. **Set environment variables**:
   - In Pages settings, go to **Settings > Environment variables**
   - Add production variables:
     - `VITE_CLERK_PUBLISHABLE_KEY`: `pk_test_...` (from Clerk)
     - `VITE_WORKER_URL`: `https://your-worker-name.your-domain.workers.dev`

5. **Deploy**:
   - Click **Save and Deploy**
   - Cloudflare will automatically build and deploy your frontend

### Subsequent Deployments

After the initial setup, every push to your selected branch will automatically trigger a build and deploy. You can monitor deployments in:
- Cloudflare Dashboard > Pages > Your Project > Deployments

---

## Option 2: Manual Deployment via Wrangler

### Build the Frontend

```bash
# From root directory
pnpm build:frontend

# Or from frontend directory
cd packages/frontend
pnpm build
```

### Deploy to Pages

```bash
# Using Wrangler
wrangler pages deploy packages/frontend/dist

# Or specify a specific directory
wrangler pages deploy packages/frontend/dist --project-name=voice-memo-frontend
```

### Environment Variables (Manual)

Set environment variables in Cloudflare Pages:
1. Go to Pages Project Settings
2. Environment variables section
3. Add production variables:
   - `VITE_CLERK_PUBLISHABLE_KEY`
   - `VITE_WORKER_URL`

---

## Environment Variables

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `VITE_CLERK_PUBLISHABLE_KEY` | Clerk OAuth provider key | `pk_test_abc123...` |
| `VITE_WORKER_URL` | Backend worker URL | `https://memo-api.example.com` |

### How to Get These

**Clerk Publishable Key**:
1. Go to https://dashboard.clerk.com/
2. Select your application
3. Go to **API Keys**
4. Copy the **Publishable Key**

**Worker URL**:
- Production: `https://voice-memo-task-manager.your-domain.workers.dev`
- Or your custom domain if configured

---

## Local Development

### Setup

```bash
cd packages/frontend

# Copy environment template
cp .env.example .env.local

# Edit .env.local with your values
# VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
# VITE_WORKER_URL=http://localhost:8787  # or your worker URL
```

### Run Dev Server

```bash
pnpm dev
```

Server will be available at `http://localhost:5173`

---

## Custom Domain

To use a custom domain with your Pages project:

1. **In Cloudflare Dashboard**:
   - Go to Pages > Your Project > Custom Domains
   - Add your domain
   - Follow DNS setup instructions

2. **Example**:
   - Domain: `app.example.com`
   - Your Pages project will be at `https://app.example.com`

---

## Troubleshooting

### Build Fails in Cloudflare

**Check**:
1. Node.js version compatibility (set to 20.x or later)
2. pnpm installation - ensure `pnpm-lock.yaml` is committed
3. Build command - should reference correct filter

**Solution**:
```bash
# Ensure lock file is in git
git add pnpm-lock.yaml
git commit -m "Update pnpm lock file"
git push
```

### Environment Variables Not Loading

**Check**:
1. Variables are prefixed with `VITE_` for frontend
2. Variables are set in Pages Settings, not just locally
3. Redeploy after adding variables

**Solution**:
- Remove the deployment and redeploy
- Or go to Settings and trigger a redeploy

### API Calls Failing

**Check**:
1. `VITE_WORKER_URL` is correct
2. Backend worker is running and accessible
3. CORS headers are properly configured

**Debug**:
```javascript
// In browser console
console.log(import.meta.env.VITE_WORKER_URL)
// Should show your worker URL
```

### Clerk Authentication Not Working

**Check**:
1. Publishable key is correct
2. Clerk dashboard has your app configured
3. Redirect URLs are properly set in Clerk

**Clerk Redirect URLs**:
- Add both: `http://localhost:5173` and `https://your-domain.pages.dev`

---

## Performance Optimization

### Enable Caching

Add caching headers in Pages Function or via Cloudflare UI:
```javascript
// _headers file at root of pages
/*
  Cache-Control: public, max-age=3600
```

### Minification

Vite automatically minifies on build, but you can also:
1. Use Cloudflare's auto-minify feature
2. Enable gzip compression
3. Use Brotli compression

---

## CI/CD with GitHub Actions (Optional)

For more control over deployments, create a GitHub Actions workflow:

```yaml
# .github/workflows/deploy-frontend.yml
name: Deploy Frontend

on:
  push:
    branches: [main]
    paths:
      - 'packages/frontend/**'
      - 'packages/shared/**'
      - 'pnpm-lock.yaml'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v2
        with:
          version: 8

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'

      - run: pnpm install

      - run: pnpm build:frontend

      - uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          command: pages deploy packages/frontend/dist --project-name=voice-memo-frontend
```

---

## Next Steps

1. Set up Clerk authentication
2. Configure GitHub integration with Cloudflare Pages
3. Set environment variables in Pages dashboard
4. Push code and trigger first deployment
5. Test frontend with backend API

See `../MONOREPO_STRUCTURE.md` for more information about the project structure.
