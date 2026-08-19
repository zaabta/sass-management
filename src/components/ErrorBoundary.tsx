import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

/**
 * Top-level error boundary — a runtime error shows a friendly reload panel
 * instead of a white screen / React unmount cascade.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(err: unknown): State {
    return { hasError: true, message: err instanceof Error ? err.message : String(err) };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[VCFO] uncaught render error:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="page-loading" style={{ minHeight: '100vh' }}>
          <div className="card card-pad" style={{ maxWidth: 440, textAlign: 'center' }}>
            <div style={{ fontSize: 30, marginBottom: 8 }}>⚠️</div>
            <h2 style={{ marginBottom: 6 }}>Something went wrong</h2>
            <p className="muted" style={{ fontSize: 13 }}>
              {this.state.message}
            </p>
            <button
              className="btn btn-primary"
              onClick={() => {
                this.setState({ hasError: false, message: '' });
                window.location.reload();
              }}
            >
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
