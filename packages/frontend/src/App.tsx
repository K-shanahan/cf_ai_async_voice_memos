import { SignedIn, SignedOut, UserButton } from '@clerk/clerk-react'
import { ErrorBoundary } from './components/ErrorBoundary'
import { SignInPage } from './pages/SignInPage'
import { Dashboard } from './pages/Dashboard'

export default function App() {
  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800">
        <SignedOut>
          <SignInPage />
        </SignedOut>

        <SignedIn>
          <nav className="bg-slate-800 border-b border-slate-700 sticky top-0 z-10">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex justify-between items-center">
              <h1 className="text-2xl font-bold text-white">🎙️ Voice Memo Manager</h1>
              <UserButton afterSignOutUrl="/" />
            </div>
          </nav>

          <Dashboard />
        </SignedIn>
      </div>
    </ErrorBoundary>
  )
}
