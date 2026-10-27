import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { formatINR, calculate503020Metrics } from '../services/calculations';
import { useToast } from '../components/Toast';

export default function BudgetsPage({ currentPeriod, setCurrentPeriod }) {
  const { showToast } = useToast();
  const [budget, setBudget] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [totalBudget, setTotalBudget] = useState('');
  const [needsPct, setNeedsPct] = useState(50);
  const [wantsPct, setWantsPct] = useState(30);
  const [savingsPct, setSavingsPct] = useState(20);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [bRes, txRes] = await Promise.all([
        api.budgets.get(currentPeriod).catch(() => ({ budget: null })),
        api.transactions.list(`period=${currentPeriod}`).catch(() => ({ transactions: [] }))
      ]);

      const b = bRes.budget;
      setBudget(b);
      setTransactions(txRes.transactions || []);

      if (b) {
        setTotalBudget(String(b.total_budget_paise / 100));
        setNeedsPct(b.needs_target_pct ?? 50);
        setWantsPct(b.wants_target_pct ?? 30);
        setSavingsPct(b.savings_target_pct ?? 20);
      } else {
        setTotalBudget('');
      }
    } catch (err) {
      showToast(err.message || 'Failed to load budget data.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [currentPeriod]);

  const handleSaveBudget = async (e) => {
    e.preventDefault();
    if (!totalBudget || isNaN(Number(totalBudget)) || Number(totalBudget) < 0) {
      showToast('Please enter a valid total budget amount.', 'error');
      return;
    }

    if (Number(needsPct) + Number(wantsPct) + Number(savingsPct) !== 100) {
      showToast('Target percentages must add up to exactly 100%.', 'error');
      return;
    }

    setSaving(true);
    try {
      const res = await api.budgets.save(currentPeriod, {
        total_budget: Number(totalBudget),
        needs_target_pct: Number(needsPct),
        wants_target_pct: Number(wantsPct),
        savings_target_pct: Number(savingsPct)
      });
      setBudget(res.budget);
      showToast(`Budget for ${currentPeriod} saved successfully!`, 'success');
      loadData();
    } catch (err) {
      showToast(err.message || 'Failed to save budget.', 'error');
    } finally {
      setSaving(false);
    }
  };

  let totalIncomePaise = 0;
  let totalExpensePaise = 0;
  transactions.forEach(t => {
    if (t.type === 'income') totalIncomePaise += t.amount_paise;
    if (t.type === 'expense') totalExpensePaise += t.amount_paise;
  });

  const rule503020 = calculate503020Metrics({
    totalIncomePaise,
    transactions,
    budgetRule: budget || {
      needs_target_pct: Number(needsPct),
      wants_target_pct: Number(wantsPct),
      savings_target_pct: Number(savingsPct)
    }
  });

  const budgetPaise = budget ? budget.total_budget_paise : 0;
  const remainingBudgetPaise = budgetPaise > 0 ? budgetPaise - totalExpensePaise : 0;

  return (
    <div>
      <div className="grid-cards-2" style={{ marginBottom: '24px' }}>
        {/* Set Budget Form */}
        <div className="card">
          <h2 style={{ fontSize: '1.25rem', color: 'var(--color-primary)', marginBottom: '16px' }}>
            Set Monthly Budget ({currentPeriod})
          </h2>

          <form onSubmit={handleSaveBudget}>
            <div className="form-group">
              <label className="form-label" htmlFor="bg-total">Total Monthly Spending Budget (₹)</label>
              <input
                id="bg-total"
                type="number"
                step="1"
                min="0"
                className="form-control"
                required
                placeholder="e.g. 8000"
                value={totalBudget}
                onChange={e => setTotalBudget(e.target.value)}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '16px' }}>
              <div className="form-group">
                <label className="form-label">Needs %</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  className="form-control"
                  value={needsPct}
                  onChange={e => setNeedsPct(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Wants %</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  className="form-control"
                  value={wantsPct}
                  onChange={e => setWantsPct(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Savings %</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  className="form-control"
                  value={savingsPct}
                  onChange={e => setSavingsPct(e.target.value)}
                />
              </div>
            </div>

            <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={saving}>
              {saving ? 'Saving Budget...' : 'Save Monthly Budget'}
            </button>
          </form>
        </div>

        {/* Budget Status Overview */}
        <div className="card">
          <h2 style={{ fontSize: '1.25rem', color: 'var(--color-primary)', marginBottom: '16px' }}>
            Budget Performance
          </h2>

          <div style={{ marginBottom: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
              <span>Monthly Budget Cap:</span>
              <strong>{formatINR(budgetPaise)}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
              <span>Actual Expenses:</span>
              <strong style={{ color: 'var(--color-danger)' }}>{formatINR(totalExpensePaise)}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
              <span>Remaining Budget:</span>
              <strong style={{ color: remainingBudgetPaise >= 0 ? 'var(--color-primary)' : 'var(--color-danger)' }}>
                {formatINR(remainingBudgetPaise)}
              </strong>
            </div>

            {/* Progress Bar */}
            <div style={{ background: 'var(--color-surface-subtle)', borderRadius: '999px', height: '10px', overflow: 'hidden' }}>
              <div
                style={{
                  background: remainingBudgetPaise >= 0 ? 'var(--color-primary)' : 'var(--color-danger)',
                  height: '100%',
                  width: `${budgetPaise > 0 ? Math.min(100, (totalExpensePaise / budgetPaise) * 100) : 0}%`,
                  transition: 'width 0.4s ease'
                }}
              ></div>
            </div>
          </div>

          <p style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)' }}>
            {budgetPaise > 0
              ? remainingBudgetPaise >= 0
                ? `You have spent ${((totalExpensePaise / budgetPaise) * 100).toFixed(0)}% of your allowance budget.`
                : 'Warning: You have exceeded your monthly spending limit!'
              : 'Set a monthly budget to monitor your pacing.'}
          </p>
        </div>
      </div>

      {/* 50/30/20 Guidelines Breakdown */}
      <h3 style={{ fontSize: '1.2rem', color: 'var(--color-primary)', marginBottom: '16px' }}>
        50/30/20 Student Rule Analysis
      </h3>

      <div className="grid-cards-3">
        {/* Needs Card */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <h4 style={{ color: 'var(--color-primary)' }}>Essential Needs (50%)</h4>
            <span className={`status-badge ${rule503020.needsStatus === 'HEALTHY' ? 'healthy' : 'caution'}`}>
              {rule503020.needsStatus}
            </span>
          </div>
          <p style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)', marginBottom: '12px' }}>
            Mess, rent, books, groceries, transport
          </p>
          <div className="card-value">{formatINR(rule503020.actualNeedsPaise)}</div>
          <p style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)' }}>
            Target: {formatINR(rule503020.targetNeedsPaise)} ({rule503020.actualNeedsPct}% of pocket money)
          </p>
        </div>

        {/* Wants Card */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <h4 style={{ color: '#f59e0b' }}>Discretionary Wants (30%)</h4>
            <span className={`status-badge ${rule503020.wantsStatus === 'HEALTHY' ? 'healthy' : 'caution'}`}>
              {rule503020.wantsStatus}
            </span>
          </div>
          <p style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)', marginBottom: '12px' }}>
            Cafes, movies, hangouts, subscriptions
          </p>
          <div className="card-value">{formatINR(rule503020.actualWantsPaise)}</div>
          <p style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)' }}>
            Target: {formatINR(rule503020.targetWantsPaise)} ({rule503020.actualWantsPct}% of pocket money)
          </p>
        </div>

        {/* Savings Card */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <h4 style={{ color: 'var(--color-savings)' }}>Savings & Goals (20%)</h4>
            <span className={`status-badge ${rule503020.savingsStatus === 'HEALTHY' ? 'healthy' : 'near_limit'}`}>
              {rule503020.savingsStatus}
            </span>
          </div>
          <p style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)', marginBottom: '12px' }}>
            Emergency fund, electronics, future trips
          </p>
          <div className="card-value">{formatINR(rule503020.actualSavingsPaise)}</div>
          <p style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)' }}>
            Target: {formatINR(rule503020.targetSavingsPaise)} ({rule503020.actualSavingsPct}% of pocket money)
          </p>
        </div>
      </div>
    </div>
  );
}
