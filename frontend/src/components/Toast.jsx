import React, { createContext, useContext, useState, useCallback } from 'react';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const showToast = useCallback((message, type = 'info') => {
    const id = Date.now() + Math.random().toString(36).slice(2, 6);
    setToasts(prev => [...prev, { id, message, type }]);

    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="toast-container" style={{ position: 'fixed', bottom: '24px', right: '24px', zIndex: 9999, display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {toasts.map(t => (
          <div
            key={t.id}
            className={`toast toast-${t.type}`}
            style={{
              padding: '12px 18px',
              borderRadius: '8px',
              backgroundColor: t.type === 'error' ? 'var(--color-danger, #ef4444)' : t.type === 'success' ? 'var(--color-primary, #059669)' : 'var(--color-surface, #ffffff)',
              color: t.type === 'info' ? 'var(--color-text-main, #1f2937)' : '#ffffff',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              border: t.type === 'info' ? '1px solid var(--color-border, #e5e7eb)' : 'none',
              fontSize: '0.9rem',
              fontWeight: 500,
              maxWidth: '380px'
            }}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
}
