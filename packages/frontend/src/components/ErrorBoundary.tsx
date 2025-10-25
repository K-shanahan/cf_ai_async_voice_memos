/**
 * ErrorBoundary - Catches React component errors and displays fallback UI
 */

import { ReactNode, Component, ErrorInfo } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
    }
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
    }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center p-4">
            <div className="max-w-md w-full">
              <div className="bg-slate-800 border border-red-500/30 rounded-lg p-6">
                <h1 className="text-2xl font-bold text-red-400 mb-2">Something went wrong</h1>
                <p className="text-slate-300 mb-4 text-sm">{this.state.error?.message || 'An unexpected error occurred'}</p>
                <button
                  onClick={() => window.location.reload()}
                  className="w-full px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 font-semibold"
                >
                  Refresh Page
                </button>
              </div>
            </div>
          </div>
        )
      )
    }

    return this.props.children
  }
}
