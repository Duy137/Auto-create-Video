import { Component, type ErrorInfo, type ReactNode } from 'react'

import { SystemErrorPanel } from '@/components/SystemErrorReport'

type SystemErrorBoundaryProps = {
  children: ReactNode
  resetKey?: string
}

type SystemErrorBoundaryState = {
  error: Error | null
  info: ErrorInfo | null
}

export class SystemErrorBoundary extends Component<SystemErrorBoundaryProps, SystemErrorBoundaryState> {
  state: SystemErrorBoundaryState = {
    error: null,
    info: null,
  }

  static getDerivedStateFromError(error: Error): Partial<SystemErrorBoundaryState> {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ info })
    console.error('[SystemErrorBoundary]', error, info)
  }

  componentDidUpdate(prevProps: SystemErrorBoundaryProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null, info: null })
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-[60vh] grid place-items-center p-6">
          <SystemErrorPanel
            source="runtime"
            detail={{
              name: this.state.error.name,
              message: this.state.error.message,
              stack: this.state.error.stack,
              componentStack: this.state.info?.componentStack,
            }}
          />
        </div>
      )
    }

    return this.props.children
  }
}
