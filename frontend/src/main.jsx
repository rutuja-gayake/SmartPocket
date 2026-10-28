import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './components/Toast';

import './styles/theme.css';
import './styles/main.css';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.error('SmartPocket Runtime Error:', error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg, #f8fafc)', padding: '20px' }}>
          <div className="card" style={{ maxWidth: '460px', width: '100%', textAlign: 'center', padding: '32px' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>⚠️</div>
            <h3 style={{ fontSize: '1.25rem', color: 'var(--color-danger, #ef4444)', marginBottom: '8px' }}>Something went wrong</h3>
            <p style={{ fontSize: '0.9rem', color: 'var(--color-text-muted, #64748b)', marginBottom: '20px' }}>
              SmartPocket encountered an unexpected display issue. Please reload to restore your session.
            </p>
            <button className="btn btn-primary" onClick={() => window.location.reload()}>
              🔄 Reload Application
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </AuthProvider>
    </ErrorBoundary>
  </React.StrictMode>
);

