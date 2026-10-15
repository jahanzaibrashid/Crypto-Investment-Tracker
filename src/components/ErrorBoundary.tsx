import { Component, type ErrorInfo, type ReactNode } from 'react'
import { ErrorState } from './ui/ErrorState'

interface State {
  error: Error | null
}

/** Last-resort boundary: shows a friendly message instead of a blank screen. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Log the error type/stack only; never log user data.
    console.error('Unhandled UI error', error.name, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen items-center justify-center">
          <ErrorState
            title="Something went wrong"
            message="An unexpected error occurred. Reload the page to continue — your saved data is safe."
            onRetry={() => window.location.reload()}
          />
        </div>
      )
    }
    return this.props.children
  }
}
