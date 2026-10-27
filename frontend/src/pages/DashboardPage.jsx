import React, { useEffect, useState, useMemo } from 'react';
import { api } from '../services/api';
import { useToast } from '../components/Toast';
import {
  formatINR,
  calculateAvailableBalance,
  calculateAvailableToSpend,
  calculateSafeDailySpending,
  calculate503020Metrics,
  calculateGoalProgress
} from '../services/calculations';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { Line, Doughnut } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

export default function DashboardPage({ currentPeriod, onOpenAddTx, onOpenMovement }) {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState([]);
  const [budget, setBudget] = useState(null);
  const [goals, setGoals] = useState([]);
  const [allowanceDetails, setAllowanceDetails] = useState(null);
  const [isAllowanceModalOpen, setIsAllowanceModalOpen] = useState(false);
  const [allowanceInput, setAllowanceInput] = useState('');
  const [allowanceNotes, setAllowanceNotes] = useState('');
  const [allowanceSaving, setAllowanceSaving] = useState(false);
  const [error, setError] = useState(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [txRes, bRes, gRes, allowRes] = await Promise.all([
        api.transactions.list(`period=${currentPeriod}`).catch(() => ({ transactions: [] })),
        api.budgets.get(currentPeriod).catch(() => ({ budget: null })),
        api.goals.list().catch(() => ({ goals: [] })),
        api.allowances.get(currentPeriod).catch(() => null)
      ]);

      setTransactions(txRes.transactions || []);
      setBudget(bRes.budget || null);
      setGoals(gRes.goals || []);
      setAllowanceDetails(allowRes);
    } catch (err) {
      setError(err.message || 'Failed to load dashboard data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [currentPeriod]);

  // Financial calculations
  const metrics = useMemo(() => {
    let incomePaise = 0;
    let expensePaise = 0;
    let netSavingsPaise = 0;

    transactions.forEach(tx => {
      if (tx.type === 'income') {
        incomePaise += tx.amount_paise;
      } else if (tx.type === 'expense') {
        expensePaise += tx.amount_paise;
      } else if (tx.type === 'transfer_savings') {
        netSavingsPaise += tx.amount_paise;
      }
    });

    const availablePaise = calculateAvailableBalance({
      totalIncomePaise: incomePaise,
      totalExpensePaise: expensePaise,
      netSavingsTransfersPaise: netSavingsPaise
    });

    const budgetPaise = budget ? budget.total_budget_paise : 0;
    const monthlyAllowancePaise = allowanceDetails?.monthlyAllowancePaise || 0;
    const availableToSpendPaise = allowanceDetails?.availableToSpendPaise !== undefined
      ? allowanceDetails.availableToSpendPaise
      : Math.max(0, monthlyAllowancePaise - expensePaise - netSavingsPaise);

    const safeDaily = calculateSafeDailySpending({
      availableBalancePaise: availablePaise,
      availableToSpendPaise,
      monthlyAllowancePaise,
      monthlyBudgetPaise: budgetPaise,
      currentMonthExpensePaise: expensePaise,
      currentDate: new Date(),
      totalTransactionCount: transactions.length
    });

    const rule503020 = calculate503020Metrics({
      totalIncomePaise: incomePaise,
      transactions,
      budgetRule: budget || { needs_target_pct: 50, wants_target_pct: 30, savings_target_pct: 20 }
    });

    // Chart Data Preparation: Daily Spending Trend
    const daysInMonth = new Date(parseInt(currentPeriod.slice(0, 4), 10), parseInt(currentPeriod.slice(5, 7), 10), 0).getDate();
    const dayLabels = Array.from({ length: daysInMonth }, (_, i) => String(i + 1));
    const dayTotals = Array(daysInMonth).fill(0);

    transactions.forEach(tx => {
      if (tx.type === 'expense' && tx.date && tx.date.startsWith(currentPeriod)) {
        const day = parseInt(tx.date.slice(8, 10), 10);
        if (day >= 1 && day <= daysInMonth) {
          dayTotals[day - 1] += tx.amount_paise / 100;
        }
      }
    });

    // Category Distribution
    const catMap = {};
    transactions.forEach(tx => {
      if (tx.type === 'expense') {
        const name = tx.category_name || 'Other';
        catMap[name] = (catMap[name] || 0) + (tx.amount_paise / 100);
      }
    });

    return {
      incomePaise,
      expensePaise,
      netSavingsPaise,
      availablePaise,
      budgetPaise,
      safeDaily,
      rule503020,
      trendData: {
        labels: dayLabels,
        datasets: [{
          label: 'Daily Spent (₹)',
          data: dayTotals,
          borderColor: '#059669',
          backgroundColor: 'rgba(5, 150, 105, 0.12)',
          fill: true,
          tension: 0.3
        }]
      },
      catData: {
        labels: Object.keys(catMap).length > 0 ? Object.keys(catMap) : ['No Expenses'],
        datasets: [{
          data: Object.keys(catMap).length > 0 ? Object.values(catMap) : [1],
          backgroundColor: [
            '#059669', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#6b7280'
          ]
        }]
      }
    };
  }, [transactions, budget, allowanceDetails, currentPeriod]);

  const openAllowanceModal = () => {
    if (allowanceDetails?.allowance) {
      setAllowanceInput(String(allowanceDetails.allowance.amount_paise / 100));
      setAllowanceNotes(allowanceDetails.allowance.notes || '');
    } else {
      setAllowanceInput('');
      setAllowanceNotes('');
    }
    setIsAllowanceModalOpen(true);
  };

  const handleAllowanceSubmit = async (e) => {
    e.preventDefault();
    if (!allowanceInput || isNaN(Number(allowanceInput)) || Number(allowanceInput) < 0) {
      showToast('Please enter a valid positive allowance amount.', 'error');
      return;
    }

    setAllowanceSaving(true);
    try {
      const res = await api.allowances.save(currentPeriod, {
        amount: Number(allowanceInput),
        notes: allowanceNotes
      });
      setAllowanceDetails(res.details);
      showToast(`Monthly allowance for ${currentPeriod} saved successfully!`, 'success');
      setIsAllowanceModalOpen(false);
      loadData();
    } catch (err) {
      showToast(err.message || 'Failed to save allowance.', 'error');
    } finally {
      setAllowanceSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 20px' }}>
        <div className="auth-loading-spinner" style={{ margin: '0 auto 16px' }}></div>
        <p style={{ color: 'var(--color-text-muted)' }}>Calculating student balances & daily allowances...</p>
      </div>
    );
  }

  const badgeClass =
    metrics.safeDaily.status === 'HEALTHY' ? 'healthy' :
    metrics.safeDaily.status === 'CAUTION' ? 'caution' :
    metrics.safeDaily.status === 'CRITICAL' ? 'critical' : 'near_limit';

  return (
    <div>
      {error && (
        <div style={{ padding: '12px', background: 'rgba(239,68,68,0.1)', color: '#ef4444', borderRadius: '8px', marginBottom: '16px' }}>
          {error}
        </div>
      )}

      {/* Safe Daily Spending Highlight Banner */}
      <div className="safe-daily-banner">
        <div>
          <h2>Safe Daily Spending Allowance</h2>
          <div className="safe-daily-figure">
            {formatINR(metrics.safeDaily.safeDailyPaise)}
          </div>
          <div className="safe-daily-desc">
            {metrics.safeDaily.message} ({metrics.safeDaily.remainingDays} days remaining this month)
          </div>
        </div>
        <div>
          <span className={`status-badge ${badgeClass}`}>
            {metrics.safeDaily.status.replace('_', ' ')}
          </span>
        </div>
      </div>

      {/* Monthly Allowance Interactive Widget */}
      <div className="card" style={{ marginBottom: '24px', borderLeft: '4px solid var(--color-primary)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
          <div>
            <h3 style={{ fontSize: '1.2rem', color: 'var(--color-primary)', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
              <span>💵</span> Monthly Pocket Money Allowance
            </h3>
            <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
              Period: {currentPeriod}
            </span>
          </div>
          <button
            className="btn btn-secondary btn-sm"
            onClick={openAllowanceModal}
          >
            {allowanceDetails?.hasAllowance ? '✏️ Edit Allowance' : '+ Set Monthly Allowance'}
          </button>
        </div>

        {!allowanceDetails?.hasAllowance ? (
          <div style={{ textAlign: 'center', padding: '24px 16px', background: 'var(--color-surface-subtle)', borderRadius: '8px' }}>
            <p style={{ color: 'var(--color-text-muted)', marginBottom: '12px' }}>
              No monthly allowance set for {currentPeriod}. Setting your expected allowance gives you realistic "Available to Spend" tracking and smart daily spend recommendations.
            </p>
            <button className="btn btn-primary btn-sm" onClick={openAllowanceModal}>
              + Set Monthly Allowance
            </button>
          </div>
        ) : (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '16px' }}>
              <div style={{ padding: '12px', background: 'var(--color-surface-subtle)', borderRadius: '8px' }}>
                <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Monthly Allowance</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-text-main)', marginTop: '4px' }}>
                  {formatINR(allowanceDetails.monthlyAllowancePaise)}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '2px' }}>Original allocation</div>
              </div>

              <div style={{ padding: '12px', background: 'var(--color-surface-subtle)', borderRadius: '8px' }}>
                <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Monthly Spent</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-danger, #ef4444)', marginTop: '4px' }}>
                  {formatINR(allowanceDetails.monthlySpentPaise)}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '2px' }}>Actual expenses</div>
              </div>

              <div style={{ padding: '12px', background: 'var(--color-surface-subtle)', borderRadius: '8px' }}>
                <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Savings Allocated</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-savings)', marginTop: '4px' }}>
                  {formatINR(allowanceDetails.netSavingsAllocatedPaise)}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '2px' }}>Net saved in goals</div>
              </div>

              <div style={{ padding: '12px', background: allowanceDetails.isOverspent ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)', borderRadius: '8px', border: allowanceDetails.isOverspent ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid rgba(16, 185, 129, 0.3)' }}>
                <div style={{ fontSize: '0.78rem', color: allowanceDetails.isOverspent ? 'var(--color-danger)' : 'var(--color-primary)', textTransform: 'uppercase', fontWeight: 600 }}>Available to Spend</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: allowanceDetails.isOverspent ? 'var(--color-danger)' : 'var(--color-primary)', marginTop: '4px' }}>
                  {formatINR(allowanceDetails.availableToSpendPaise)}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                  Allowance − Spent − Savings
                </div>
              </div>
            </div>

            {/* Segmented Consumption Bar */}
            <div style={{ marginTop: '8px', marginBottom: '8px' }}>
              <div style={{ display: 'flex', height: '10px', borderRadius: '999px', overflow: 'hidden', background: '#e2e8f0' }}>
                <div
                  style={{
                    width: `${Math.min(100, Math.round((allowanceDetails.monthlySpentPaise / allowanceDetails.monthlyAllowancePaise) * 100))}%`,
                    backgroundColor: '#ef4444',
                    transition: 'width 0.3s'
                  }}
                  title={`Spent: ${formatINR(allowanceDetails.monthlySpentPaise)}`}
                />
                <div
                  style={{
                    width: `${Math.min(100 - Math.min(100, Math.round((allowanceDetails.monthlySpentPaise / allowanceDetails.monthlyAllowancePaise) * 100)), Math.round((Math.max(0, allowanceDetails.netSavingsAllocatedPaise) / allowanceDetails.monthlyAllowancePaise) * 100))}%`,
                    backgroundColor: '#059669',
                    transition: 'width 0.3s'
                  }}
                  title={`Savings: ${formatINR(allowanceDetails.netSavingsAllocatedPaise)}`}
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.82rem', color: 'var(--color-text-muted)' }}>
              <span>
                {allowanceDetails.isOverspent
                  ? `Over allowance by ${formatINR(Math.abs(allowanceDetails.rawRemainingAllowancePaise))}`
                  : `${formatINR(allowanceDetails.availableToSpendPaise)} remaining (${100 - allowanceDetails.consumptionPct}% available)`}
              </span>
              {budget && (
                <span>
                  Budget Cap: {formatINR(budget.total_budget_paise)} ({formatINR(allowanceDetails.remainingBudgetPaise)} left)
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Top 4 Financial Overview Cards */}
      <div className="grid-cards-3" style={{ marginBottom: '24px' }}>
        <div className="card">
          <div className="card-title">Available Pocket Cash</div>
          <div className="card-value" style={{ color: metrics.availablePaise >= 0 ? 'var(--color-primary)' : 'var(--color-danger)' }}>
            {formatINR(metrics.availablePaise)}
          </div>
          <p style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)' }}>
            Funds − Expenses − Net Savings
          </p>
        </div>

        <div className="card">
          <div className="card-title">Monthly Expenses</div>
          <div className="card-value" style={{ color: 'var(--color-danger, #ef4444)' }}>
            {formatINR(metrics.expensePaise)}
          </div>
          <p style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)' }}>
            {metrics.budgetPaise > 0
              ? `${((metrics.expensePaise / metrics.budgetPaise) * 100).toFixed(0)}% of ₹${(metrics.budgetPaise / 100).toFixed(0)} budget`
              : 'No budget set for this month'}
          </p>
        </div>

        <div className="card">
          <div className="card-title">Pocket Money / Income</div>
          <div className="card-value" style={{ color: 'var(--color-primary)' }}>
            {formatINR(metrics.incomePaise)}
          </div>
          <p style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)' }}>
            Allocated & allowance received
          </p>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid-cards-2" style={{ marginBottom: '24px' }}>
        <div className="card">
          <h3 style={{ fontSize: '1.05rem', color: 'var(--color-primary)', marginBottom: '16px' }}>
            Daily Spending Trend ({currentPeriod})
          </h3>
          <div style={{ height: '220px' }}>
            <Line
              data={metrics.trendData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { y: { beginAtZero: true } }
              }}
            />
          </div>
        </div>

        <div className="card">
          <h3 style={{ fontSize: '1.05rem', color: 'var(--color-primary)', marginBottom: '16px' }}>
            Expense Breakdown by Category
          </h3>
          <div style={{ height: '220px', display: 'flex', justifyContent: 'center' }}>
            <Doughnut
              data={metrics.catData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'right' } }
              }}
            />
          </div>
        </div>
      </div>

      {/* Savings Goals Preview */}
      <div className="card" style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ fontSize: '1.15rem', color: 'var(--color-primary)' }}>Active Savings Goals</h3>
          <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
            {goals.length} {goals.length === 1 ? 'goal' : 'goals'} tracked
          </span>
        </div>

        {goals.length === 0 ? (
          <p style={{ fontSize: '0.88rem', color: 'var(--color-text-muted)', textAlign: 'center', padding: '24px' }}>
            No savings goals set yet. Go to the Savings Goals tab to create your first target!
          </p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
            {goals.map(g => {
              const analysis = g.analysis || calculateGoalProgress(g, new Date());
              const pct = analysis.progressPct;
              return (
                <div key={g.id} style={{ border: '1px solid var(--color-border)', borderRadius: '8px', padding: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <strong>{g.title}</strong>
                    <span style={{ color: 'var(--color-savings)', fontWeight: 600 }}>{pct}%</span>
                  </div>
                  {/* Progress bar */}
                  <div style={{ background: 'var(--color-mint)', borderRadius: '999px', height: '8px', overflow: 'hidden', marginBottom: '8px' }}>
                    <div style={{ background: 'var(--color-savings)', height: '100%', width: `${pct}%`, transition: 'width 0.3s' }}></div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', color: 'var(--color-text-muted)', marginBottom: '12px' }}>
                    <span>{formatINR(g.current_saved_paise)} saved</span>
                    <span>Target: {formatINR(g.target_amount_paise)}</span>
                  </div>
                  <button
                    className="btn btn-primary btn-sm"
                    style={{ width: '100%' }}
                    onClick={() => onOpenMovement(g, 'deposit')}
                  >
                    + Deposit Money
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Quick Recent Transactions Preview */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ fontSize: '1.15rem', color: 'var(--color-primary)' }}>Recent Transactions</h3>
          <button className="btn btn-secondary btn-sm" onClick={onOpenAddTx}>+ Add New</button>
        </div>

        {transactions.length === 0 ? (
          <p style={{ fontSize: '0.88rem', color: 'var(--color-text-muted)', textAlign: 'center', padding: '20px' }}>
            No transactions found for {currentPeriod}. Click "+ Add Transaction" above!
          </p>
        ) : (
          <div className="table-responsive">
            <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border)', textAlign: 'left', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
                  <th style={{ padding: '8px' }}>Date</th>
                  <th style={{ padding: '8px' }}>Description</th>
                  <th style={{ padding: '8px' }}>Category</th>
                  <th style={{ padding: '8px', textAlign: 'right' }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {transactions.slice(0, 5).map(tx => (
                  <tr key={tx.id} style={{ borderBottom: '1px solid var(--color-border)', fontSize: '0.88rem' }}>
                    <td style={{ padding: '10px 8px' }}>{tx.date || '-'}</td>
                    <td style={{ padding: '10px 8px', fontWeight: 600 }}>{tx.description || tx.category_name}</td>
                    <td style={{ padding: '10px 8px' }}>
                      <span className="badge-tag" style={{ background: 'var(--color-surface-subtle)' }}>
                        {tx.category_name}
                      </span>
                    </td>
                    <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 700, color: tx.type === 'income' ? 'var(--color-primary)' : tx.type === 'transfer_savings' ? 'var(--color-savings)' : 'var(--color-danger)' }}>
                      {tx.type === 'income' ? '+' : '-'}{formatINR(tx.amount_paise)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal: Set / Edit Monthly Allowance */}
      {isAllowanceModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-content" style={{ maxWidth: '440px' }}>
            <div className="modal-header">
              <h3>{allowanceDetails?.hasAllowance ? 'Edit Monthly Allowance' : 'Set Monthly Allowance'}</h3>
              <button className="btn-close" onClick={() => setIsAllowanceModalOpen(false)}>×</button>
            </div>
            <form onSubmit={handleAllowanceSubmit}>
              <div className="form-group">
                <label className="form-label">Applicable Period</label>
                <input type="text" className="form-control" value={currentPeriod} disabled style={{ background: '#f8fafc' }} />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="allowance-amount">Monthly Allowance (₹)</label>
                <input
                  id="allowance-amount"
                  type="number"
                  step="any"
                  min="0"
                  className="form-control"
                  required
                  placeholder="e.g. 5000"
                  value={allowanceInput}
                  onChange={(e) => setAllowanceInput(e.target.value)}
                  autoFocus
                />
                <small style={{ color: 'var(--color-text-muted)', fontSize: '0.78rem' }}>
                  The total pocket money or allowance expected for this month.
                </small>
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="allowance-notes">Notes (Optional)</label>
                <input
                  id="allowance-notes"
                  type="text"
                  className="form-control"
                  placeholder="e.g. Allowance from parents"
                  value={allowanceNotes}
                  onChange={(e) => setAllowanceNotes(e.target.value)}
                />
              </div>
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '20px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setIsAllowanceModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={allowanceSaving}>
                  {allowanceSaving ? 'Saving...' : 'Save Allowance'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

