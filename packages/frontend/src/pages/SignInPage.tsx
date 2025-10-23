import { SignIn } from '@clerk/clerk-react'

export function SignInPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">🎙️ Voice Memo Manager</h1>
          <p className="text-slate-300">Record, transcribe, and organize your thoughts</p>
        </div>

        <SignIn
          appearance={{
            elements: {
              rootBox: 'w-full',
              card: 'shadow-2xl',
            },
          }}
          redirectUrl="/"
          afterSignUpUrl="/"
        />
      </div>
    </div>
  )
}
