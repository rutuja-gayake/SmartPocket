import React from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from './Toast';

export default function Sidebar({ activeView, setActiveView }) {
  const { currentUser, logout } = useAuth();
  const { showToast } = useToast();

  const navItems = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>
      )
    },
    {
      id: 'transactions',
      label: 'Transactions',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M16 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8Z"/><path d="M15 3v5h5"/><path d="m9 14 2 2 4-4"/></svg>
      )
    },
    {
      id: 'budgets',
      label: 'Budgets & 50/30/20',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/></svg>
      )
    },
    {
      id: 'goals',
      label: 'Savings Goals',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>
      )
    },
    {
      id: 'advisor',
      label: 'Pocket AI Advisor',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 2a8 8 0 0 0-8 8c0 3 2 5.5 5 7v3h6v-3c3-1.5 5-4 5-7a8 8 0 0 0-8-8z"/><path d="M9 22h6"/></svg>
      )
    },
    {
      id: 'security',
      label: 'Security & 2FA',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
      )
    }
  ];

  const handleLogout = async () => {
    await logout();
    showToast('Signed out successfully.', 'info');
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <img src="/icon.svg" alt="SmartPocket" className="brand-icon" />
        <div>
          <div className="brand-title">SmartPocket</div>
          <div className="brand-subtitle">Student Advisor (React+Vite)</div>
        </div>
      </div>

      <nav className="sidebar-nav">
        {navItems.map(item => (
          <button
            key={item.id}
            className={`nav-item ${activeView === item.id ? 'active' : ''}`}
            onClick={() => setActiveView(item.id)}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </nav>

      <div className="sidebar-footer">
        {currentUser && (
          <div className="user-profile-badge" style={{ display: 'flex' }}>
            <div className="avatar">
              {currentUser.fullName ? currentUser.fullName.charAt(0).toUpperCase() : 'S'}
            </div>
            <div className="user-info">
              <div className="user-name">{currentUser.fullName}</div>
              <div className="user-email">{currentUser.email}</div>
            </div>
          </div>
        )}
        <button
          className="btn btn-secondary btn-sm btn-logout"
          style={{ width: '100%', marginTop: '10px' }}
          onClick={handleLogout}
        >
          Sign Out
        </button>
      </div>
    </aside>
  );
}
