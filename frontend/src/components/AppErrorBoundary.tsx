import React from 'react';

interface AppErrorBoundaryState {
  error: Error | null;
}

class AppErrorBoundary extends React.Component<React.PropsWithChildren, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = {
    error: null,
  };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Application render failed:', error, errorInfo);
  }

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
        <div className="w-full max-w-2xl rounded-[1.75rem] border border-red-200 bg-white p-6 shadow-xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-600">App Error</p>
          <h1 className="mt-2 text-2xl font-semibold text-slate-900">MyProPlanner hit an unexpected error</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            The app failed while rendering. Refresh the page, and if this keeps happening, share the message below.
          </p>

          <pre className="mt-4 overflow-auto rounded-2xl bg-slate-950 px-4 py-3 text-sm text-slate-100">
            {this.state.error.message || String(this.state.error)}
          </pre>

          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-5 inline-flex items-center rounded-full bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            Reload app
          </button>
        </div>
      </div>
    );
  }
}

export default AppErrorBoundary;
