import { Component, type CSSProperties, type ErrorInfo, type ReactNode } from 'react'

type ErrorBoundaryProps = {
  children: ReactNode
  fallback?: ReactNode
}

type ErrorBoundaryState = {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
}

const containerStyle: CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '24px',
  backgroundColor: '#111827',
  color: '#f9fafb',
  fontFamily: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
}

const panelStyle: CSSProperties = {
  width: '100%',
  maxWidth: '640px',
  padding: '24px',
  borderRadius: '12px',
  border: '1px solid #374151',
  backgroundColor: '#1f2937',
  boxShadow: '0 16px 40px rgba(0, 0, 0, 0.35)',
}

const titleStyle: CSSProperties = {
  margin: '0 0 12px',
  fontSize: '1.5rem',
  fontWeight: 700,
}

const messageStyle: CSSProperties = {
  margin: '0 0 20px',
  lineHeight: 1.6,
  color: '#d1d5db',
}

const buttonStyle: CSSProperties = {
  padding: '10px 16px',
  border: 'none',
  borderRadius: '8px',
  backgroundColor: '#2563eb',
  color: '#ffffff',
  fontSize: '0.95rem',
  fontWeight: 600,
  cursor: 'pointer',
}

const detailsStyle: CSSProperties = {
  marginTop: '20px',
  padding: '16px',
  borderRadius: '8px',
  backgroundColor: '#0f172a',
  color: '#e5e7eb',
  overflowX: 'auto',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = {
    hasError: false,
    error: null,
    errorInfo: null,
  }

  public static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return {
      hasError: true,
      error,
    }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo })
    console.error('ErrorBoundary caught an error:', error, errorInfo)
  }

  public render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children
    }

    if (this.props.fallback) {
      return this.props.fallback
    }

    return (
      <div style={containerStyle}>
        <div style={panelStyle}>
          <h1 style={titleStyle}>Something went wrong</h1>
          <p style={messageStyle}>
            The app hit an unexpected problem. Please reload the page and try again.
          </p>
          <button
            type="button"
            style={buttonStyle}
            onClick={() => {
              window.location.reload()
            }}
          >
            Reload
          </button>

          {import.meta.env.DEV ? (
            <details style={detailsStyle}>
              <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Error details</summary>
              <div style={{ marginTop: '12px' }}>
                <strong>Message:</strong>
                <div>{this.state.error?.message ?? 'Unknown error'}</div>
              </div>
              {this.state.error?.stack ? (
                <div style={{ marginTop: '12px' }}>
                  <strong>Stack:</strong>
                  <div>{this.state.error.stack}</div>
                </div>
              ) : null}
              {this.state.errorInfo?.componentStack ? (
                <div style={{ marginTop: '12px' }}>
                  <strong>Component stack:</strong>
                  <div>{this.state.errorInfo.componentStack}</div>
                </div>
              ) : null}
            </details>
          ) : null}
        </div>
      </div>
    )
  }
}

export default ErrorBoundary
