import React from 'react'

interface ErrorBoundaryProps {
  children: React.ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  message: string
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
    message: '',
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message || 'Unknown error',
    }
  }

  componentDidCatch(error: Error) {
    console.error('Admin render error:', error)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
          <div className="w-full max-w-xl rounded-2xl border border-rose-200 bg-white p-6 shadow-sm">
            <h1 className="text-lg font-semibold text-rose-700">管理后台渲染失败</h1>
            <p className="mt-2 text-sm text-slate-600">
              页面没有正常渲染。请刷新一次；如果仍然失败，把下面的错误信息发给我。
            </p>
            <pre className="mt-4 overflow-auto rounded-xl bg-slate-950 p-4 text-xs text-slate-100">
              {this.state.message}
            </pre>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
