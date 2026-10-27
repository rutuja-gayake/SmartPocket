import React from 'react';

export default function Topbar({
  activeView,
  currentPeriod,
  setCurrentPeriod,
  onOpenAddTx
}) {
  const titles = {
    dashboard: 'Financial Dashboard',
    transactions: 'Transaction History',
    budgets: 'Budgets & 50/30/20 Analysis',
    goals: 'Savings Goals',
    advisor: 'Pocket AI Advisor',
    security: 'Security & 2FA Settings'
  };

  return (
    <header className="topbar">
      <div className="topbar-left">
        <h1 className="view-heading">{titles[activeView] || 'SmartPocket'}</h1>
      </div>
      <div className="topbar-right" style={{ display: 'flex' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <label htmlFor="period-select" style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>
            Month:
          </label>
          <input
            id="period-select"
            type="month"
            className="form-control"
            value={currentPeriod}
            onChange={(e) => setCurrentPeriod(e.target.value)}
            style={{ padding: '4px 8px', fontSize: '0.85rem', height: '34px', width: 'auto', cursor: 'pointer' }}
            title="Select Month/Year for Dashboard & Transactions"
          />
        </div>

        <div className="sync-pill synced" title="Connected to SmartPocket Backend">
          <span className="sync-dot"></span>
          <span>Online • Synced</span>
        </div>

        <button
          className="btn btn-primary btn-sm"
          onClick={onOpenAddTx}
        >
          + Add Transaction
        </button>
      </div>
    </header>
  );
}
