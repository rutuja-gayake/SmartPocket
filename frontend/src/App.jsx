import React, { useState } from 'react';
import { useAuth } from './context/AuthContext';
import { getCurrentPeriod } from './services/calculations';

// Components & Modals
import Sidebar from './components/Sidebar';
import Topbar from './components/Topbar';
import AddTransactionModal from './components/AddTransactionModal';
import GoalMovementModal from './components/GoalMovementModal';
import AddGoalModal from './components/AddGoalModal';

// Pages
import AuthPage from './pages/AuthPage';
import DashboardPage from './pages/DashboardPage';
import TransactionsPage from './pages/TransactionsPage';
import BudgetsPage from './pages/BudgetsPage';
import GoalsPage from './pages/GoalsPage';
import AdvisorPage from './pages/AdvisorPage';
import SecurityPage from './pages/SecurityPage';

export default function App() {
  const { authStatus, authError, retryAuth, proceedToAuth } = useAuth();
  const [activeView, setActiveView] = useState('dashboard');
  const [currentPeriod, setCurrentPeriod] = useState(getCurrentPeriod());

  // Modal states
  const [isAddTxOpen, setIsAddTxOpen] = useState(false);
  const [isAddGoalOpen, setIsAddGoalOpen] = useState(false);
  const [movementModalGoal, setMovementModalGoal] = useState(null);
  const [movementModalType, setMovementModalType] = useState('deposit');
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const triggerRefresh = () => setRefreshTrigger(prev => prev + 1);

  // 1. Loading Session Verification State
  if (authStatus === 'loading') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg)' }}>
        <div style={{ textAlign: 'center', padding: '32px', maxWidth: '420px', width: '100%' }}>
          <div className="auth-loading-spinner" style={{ width: '42px', height: '42px', border: '3px solid var(--color-border)', borderTopColor: 'var(--color-primary)', borderRadius: '50%', margin: '0 auto 16px', animation: 'spin 0.8s linear infinite' }}></div>
          <div style={{ fontWeight: 600, fontSize: '1.1rem', color: 'var(--color-text-main)', marginBottom: '6px' }}>Verifying Session...</div>
          <div style={{ fontSize: '0.88rem', color: 'var(--color-text-muted)' }}>Securing your SmartPocket wallet</div>
        </div>
      </div>
    );
  }

  // 2. Server Error / Offline Fallback State
  if (authStatus === 'error') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg)', padding: '20px' }}>
        <div className="card" style={{ maxWidth: '440px', width: '100%', textAlign: 'center', padding: '32px' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>⚠️</div>
          <h3 style={{ fontSize: '1.2rem', color: 'var(--color-danger, #ef4444)', marginBottom: '8px' }}>Unable to Connect to Server</h3>
          <p style={{ fontSize: '0.88rem', color: 'var(--color-text-muted)', marginBottom: '24px' }}>
            {authError || "We couldn't reach the SmartPocket backend. Please make sure the server is running or check your network connection."}
          </p>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button className="btn btn-primary btn-sm" onClick={retryAuth}>
              🔄 Retry Connection
            </button>
            <button className="btn btn-secondary btn-sm" onClick={proceedToAuth}>
              Proceed to Sign In
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 3. Unauthenticated State -> Show Auth (Login/Register)
  if (authStatus === 'unauthenticated') {
    return <AuthPage />;
  }

  // 4. Authenticated Application Shell
  return (
    <div className="app-layout">
      {/* Persistent Sidebar */}
      <Sidebar activeView={activeView} setActiveView={setActiveView} />

      {/* Main Content Wrapper */}
      <div className="main-wrapper">
        <Topbar
          activeView={activeView}
          currentPeriod={currentPeriod}
          setCurrentPeriod={setCurrentPeriod}
          onOpenAddTx={() => setIsAddTxOpen(true)}
        />

        <main className="content-body" key={refreshTrigger}>
          {activeView === 'dashboard' && (
            <DashboardPage
              currentPeriod={currentPeriod}
              onOpenAddTx={() => setIsAddTxOpen(true)}
              onOpenMovement={(goal, type) => {
                setMovementModalGoal(goal);
                setMovementModalType(type);
              }}
            />
          )}

          {activeView === 'transactions' && (
            <TransactionsPage
              currentPeriod={currentPeriod}
              onOpenAddTx={() => setIsAddTxOpen(true)}
            />
          )}

          {activeView === 'budgets' && (
            <BudgetsPage
              currentPeriod={currentPeriod}
              setCurrentPeriod={setCurrentPeriod}
            />
          )}

          {activeView === 'goals' && (
            <GoalsPage
              onOpenAddGoal={() => setIsAddGoalOpen(true)}
              onOpenMovement={(goal, type) => {
                setMovementModalGoal(goal);
                setMovementModalType(type);
              }}
            />
          )}

          {activeView === 'advisor' && (
            <AdvisorPage currentPeriod={currentPeriod} />
          )}

          {activeView === 'security' && (
            <SecurityPage />
          )}
        </main>

        {/* Mobile Navigation Bar */}
        <nav className="mobile-nav">
          <button className={`mobile-nav-item ${activeView === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveView('dashboard')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>
            Home
          </button>
          <button className={`mobile-nav-item ${activeView === 'transactions' ? 'active' : ''}`} onClick={() => setActiveView('transactions')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M16 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8Z"/><path d="M15 3v5h5"/><path d="m9 14 2 2 4-4"/></svg>
            Tx
          </button>
          <button className={`mobile-nav-item ${activeView === 'goals' ? 'active' : ''}`} onClick={() => setActiveView('goals')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>
            Goals
          </button>
          <button className={`mobile-nav-item ${activeView === 'advisor' ? 'active' : ''}`} onClick={() => setActiveView('advisor')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 2a8 8 0 0 0-8 8c0 3 2 5.5 5 7v3h6v-3c3-1.5 5-4 5-7a8 8 0 0 0-8-8z"/><path d="M9 22h6"/></svg>
            Advisor
          </button>
          <button className={`mobile-nav-item ${activeView === 'security' ? 'active' : ''}`} onClick={() => setActiveView('security')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            Security
          </button>
        </nav>
      </div>

      {/* Global Modals */}
      <AddTransactionModal
        isOpen={isAddTxOpen}
        onClose={() => setIsAddTxOpen(false)}
        onSuccess={triggerRefresh}
      />

      <GoalMovementModal
        isOpen={Boolean(movementModalGoal)}
        onClose={() => setMovementModalGoal(null)}
        goal={movementModalGoal}
        defaultType={movementModalType}
        onSuccess={triggerRefresh}
      />

      <AddGoalModal
        isOpen={isAddGoalOpen}
        onClose={() => setIsAddGoalOpen(false)}
        onSuccess={triggerRefresh}
      />
    </div>
  );
}

