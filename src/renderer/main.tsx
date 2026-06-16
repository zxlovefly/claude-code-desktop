import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/global.css'

// Error boundary for renderer crashes
class ErrorFallback extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false, error: null }
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          height: '100vh', background: '#0d1117', color: '#e6edf3',
          fontFamily: 'monospace', padding: '2rem',
        }}>
          <div>
            <h1 style={{ color: '#f85149', fontSize: '1.5rem' }}>App Error</h1>
            <pre style={{
              marginTop: '1rem', padding: '1rem', background: '#161b22',
              borderRadius: '8px', fontSize: '0.875rem', maxWidth: '600px',
              overflow: 'auto', whiteSpace: 'pre-wrap',
            }}>
              {this.state.error?.message || 'Unknown error'}
            </pre>
            <p style={{ marginTop: '1rem', fontSize: '0.75rem', color: '#8b949e' }}>
              Check DevTools (Ctrl+Shift+I) for full stack trace
            </p>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

// Verify preload API
if (!window.electron) {
  document.getElementById('root')!.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:center;height:100vh;background:#0d1117;color:#e6edf3;font-family:monospace">
      <div style="text-align:center">
        <h1 style="color:#f85149">Preload Failed</h1>
        <p style="color:#8b949e;margin-top:1rem">window.electron is not available</p>
        <p style="color:#8b949e;font-size:0.75rem">Check that preload script is accessible</p>
      </div>
    </div>
  `
  // Show error in-place — don't throw (React hasn't mounted yet)
  // Don't attempt to mount React
} else {

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorFallback>
      <App />
    </ErrorFallback>
  </React.StrictMode>,
)
}
