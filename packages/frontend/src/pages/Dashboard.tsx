/**
 * Dashboard - Main page for managing voice memos
 * To be implemented with:
 * - RecordButton component
 * - MemoList component
 * - MemoDetail view
 */

export function Dashboard() {
  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="text-center">
        <h2 className="text-3xl font-bold text-white mb-2">Dashboard</h2>
        <p className="text-slate-300 mb-8">
          The dashboard UI will be implemented here with recording, memos list, and memo details
        </p>

        <div className="bg-slate-700/50 border border-slate-600 rounded-lg p-8 text-slate-300">
          <p className="mb-4">Frontend implementation in progress...</p>
          <p className="text-sm">
            Next steps:
            <ul className="mt-4 space-y-2 text-left inline-block">
              <li>✓ Create project structure</li>
              <li>✓ Setup React with TypeScript</li>
              <li>✓ Setup Clerk authentication</li>
              <li>✓ Setup TanStack Query</li>
              <li>○ Create API client integration</li>
              <li>○ Build record button component</li>
              <li>○ Build memo list component</li>
              <li>○ Build memo detail view</li>
              <li>○ Integrate with backend API</li>
              <li>○ Deploy to Cloudflare Pages</li>
            </ul>
          </p>
        </div>
      </div>
    </main>
  )
}
