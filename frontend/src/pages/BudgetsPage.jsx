import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { formatINR, calculate503020Metrics } from '../services/calculations';
import { useToast } from '../components/Toast';

export default function BudgetsPage({ currentPeriod, setCurrentPeriod }) {
  const { showToast } = useToast();
  const [budget, setBudget] = useState(null);
  const [allowance, setAllowance] = useState(null);
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
      const [bRes, txRes, allowRes] = await Promise.all([
        api.budgets.get(currentPeriod).catch(() => ({ budget: null })),
        api.transactions.list(`period=${currentPeriod}`).catch(() => ({ transactions: [] })),
        api.allowances.get(currentPeriod).catch(() => ({ hasAllowance: false, monthlyAllowancePaise: 0 }))
      ]);

      const b = bRes.budget;
      setBudget(b);
      setTransactions(txRes.transactions || []);
      setAllowance(allowRes);

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
  let needsExpensePaise = 0;
  let wantsExpensePaise = 0;
  let netSavingsPaise = 0;

  transactions.forEach(t => {
    const amt = Number(t.amount_paise || (t.amount ? Math.round(Number(t.amount) * 100) : 0));
    if (t.type === 'income') {
      totalIncomePaise += amt;
    } else if (t.type === 'transfer_savings') {
      netSavingsPaise += amt;
    } else if (t.type === 'expense') {
      totalExpensePaise += amt;
      if (t.classification === 'want') {
        wantsExpensePaise += amt;
      } else if (t.classification === 'savings') {
        netSavingsPaise += amt;
      } else {
        needsExpensePaise += amt;
      }
    }
  });

  const rule503020 = calculate503020Metrics({
    monthlyAllowancePaise: allowance?.monthlyAllowancePaise || 0,
    allocationBasisPaise: allowance?.monthlyAllowancePaise || (budget ? budget.total_budget_paise : 0),
    incomePaise: totalIncomePaise,
    needsPaise: needsExpensePaise,
    wantsPaise: wantsExpensePaise,
    savingsPaise: allowance?.netSavingsAllocatedPaise ?? netSavingsPaise,
    transactions,
    targets: {
      needsPct: Number(needsPct),
      wantsPct: Number(wantsPct),
      savingsPct: Number(savingsPct)
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
        <div>
          <h3 style={{ fontSize: '1.2rem', color: 'var(--color-primary)', margin: 0 }}>
            50/30/20 Student Rule Analysis
          </h3>
          <p style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)', marginTop: '4px' }}>
            Suggested spending & savings allocations based on your {allowance?.monthlyAllowancePaise > 0 ? `₹${(allowance.monthlyAllowancePaise / 100).toFixed(0)} monthly allowance` : (totalIncomePaise > 0 ? `₹${(totalIncomePaise / 100).toFixed(0)} income` : `₹${(budgetPaise / 100).toFixed(0)} spending cap`)}.
          </p>
        </div>
        <span className="badge-tag" style={{ background: 'var(--color-surface-subtle)', fontWeight: 600 }}>
          Basis: {formatINR(rule503020.baseAmountPaise)}
        </span>
      </div>

      <div className="grid-cards-3">
        {/* Needs Card */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <h4 style={{ color: 'var(--color-primary)', margin: 0 }}>Essential Needs ({rule503020.targets.needsPct}%)</h4>
            <span className={`status-badge ${rule503020.needsStatus === 'HEALTHY' ? 'healthy' : rule503020.needsStatus === 'NEAR_LIMIT' ? 'near_limit' : 'budget_exceeded'}`}>
              {rule503020.needsStatus === 'HEALTHY' ? 'Healthy' : rule503020.needsStatus === 'NEAR_LIMIT' ? 'Near Limit' : 'Over Target'}
            </span>
          </div>
          <p style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)', marginBottom: '12px' }}>
            Mess, rent, books, groceries, transport
          </p>
          <div className="card-value" style={{ fontSize: '1.6rem', fontWeight: 800 }}>
            {formatINR(rule503020.actualNeedsPaise)}
          </div>
          <div style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)', marginTop: '4px' }}>
            Target: <strong>{formatINR(rule503020.targetNeedsPaise)}</strong> ({rule503020.targetUsedNeedsPct}% of target used)
          </div>

          {/* Progress bar */}
          <div style={{ background: 'var(--color-surface-subtle)', borderRadius: '999px', height: '8px', overflow: 'hidden', margin: '12px 0 8px' }}>
            <div style={{
              background: rule503020.needsStatus === 'OVER_TARGET' ? 'var(--color-danger)' : rule503020.needsStatus === 'NEAR_LIMIT' ? 'var(--color-warning, #f59e0b)' : 'var(--color-primary)',
              width: `${Math.min(100, rule503020.targetUsedNeedsPct)}%`,
              height: '100%',
              transition: 'width 0.4s ease'
            }}></div>
          </div>

          <div style={{ fontSize: '0.8rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            {rule503020.actualNeedsPaise > rule503020.targetNeedsPaise ? (
              <span style={{ color: 'var(--color-danger)', fontWeight: 600 }}>
                Over target by {formatINR(rule503020.actualNeedsPaise - rule503020.targetNeedsPaise)}
              </span>
            ) : (
              <span style={{ color: 'var(--color-text-muted)' }}>
                {formatINR(rule503020.remainingNeedsPaise)} remaining
              </span>
            )}
            <span style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>
              {rule503020.actual.actualNeedsPct}% of pocket money
            </span>
          </div>
        </div>

        {/* Wants Card */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <h4 style={{ color: '#d97706', margin: 0 }}>Discretionary Wants ({rule503020.targets.wantsPct}%)</h4>
            <span className={`status-badge ${rule503020.wantsStatus === 'HEALTHY' ? 'healthy' : rule503020.wantsStatus === 'NEAR_LIMIT' ? 'near_limit' : 'budget_exceeded'}`}>
              {rule503020.wantsStatus === 'HEALTHY' ? 'Healthy' : rule503020.wantsStatus === 'NEAR_LIMIT' ? 'Near Limit' : 'Over Target'}
            </span>
          </div>
          <p style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)', marginBottom: '12px' }}>
            Cafes, movies, hangouts, subscriptions
          </p>
          <div className="card-value" style={{ fontSize: '1.6rem', fontWeight: 800, color: '#d97706' }}>
            {formatINR(rule503020.actualWantsPaise)}
          </div>
          <div style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)', marginTop: '4px' }}>
            Target: <strong>{formatINR(rule503020.targetWantsPaise)}</strong> ({rule503020.targetUsedWantsPct}% of target used)
          </div>

          {/* Progress bar */}
          <div style={{ background: 'var(--color-surface-subtle)', borderRadius: '999px', height: '8px', overflow: 'hidden', margin: '12px 0 8px' }}>
            <div style={{
              background: rule503020.wantsStatus === 'OVER_TARGET' ? 'var(--color-danger)' : rule503020.wantsStatus === 'NEAR_LIMIT' ? 'var(--color-warning, #f59e0b)' : '#d97706',
              width: `${Math.min(100, rule503020.targetUsedWantsPct)}%`,
              height: '100%',
              transition: 'width 0.4s ease'
            }}></div>
          </div>

          <div style={{ fontSize: '0.8rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            {rule503020.actualWantsPaise > rule503020.targetWantsPaise ? (
              <span style={{ color: 'var(--color-danger)', fontWeight: 600 }}>
                Over target by {formatINR(rule503020.actualWantsPaise - rule503020.targetWantsPaise)}
              </span>
            ) : (
              <span style={{ color: 'var(--color-text-muted)' }}>
                {formatINR(rule503020.remainingWantsPaise)} remaining
              </span>
            )}
            <span style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>
              {rule503020.actual.actualWantsPct}% of pocket money
            </span>
          </div>
        </div>

        {/* Savings Card */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <h4 style={{ color: 'var(--color-savings)', margin: 0 }}>Savings & Goals ({rule503020.targets.savingsPct}%)</h4>
            <span className={`status-badge ${rule503020.savingsStatus === 'ACHIEVED' ? 'healthy' : 'near_limit'}`}>
              {rule503020.savingsStatus === 'ACHIEVED' ? 'Target Achieved' : rule503020.savingsStatus === 'ON_TRACK' ? 'On Track' : 'Building'}
            </span>
          </div>
          <p style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)', marginBottom: '12px' }}>
            Emergency fund, electronics, future trips
          </p>
          <div className="card-value" style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--color-savings)' }}>
            {formatINR(rule503020.actualSavingsPaise)}
          </div>
          <div style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)', marginTop: '4px' }}>
            Target: <strong>{formatINR(rule503020.targetSavingsPaise)}</strong> ({rule503020.targetUsedSavingsPct}% of target saved)
          </div>

          {/* Progress bar */}
          <div style={{ background: 'var(--color-surface-subtle)', borderRadius: '999px', height: '8px', overflow: 'hidden', margin: '12px 0 8px' }}>
            <div style={{
              background: 'var(--color-savings)',
              width: `${Math.min(100, rule503020.targetUsedSavingsPct)}%`,
              height: '100%',
              transition: 'width 0.4s ease'
            }}></div>
          </div>

          <div style={{ fontSize: '0.8rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            {rule503020.actualSavingsPaise >= rule503020.targetSavingsPaise && rule503020.targetSavingsPaise > 0 ? (
              <span style={{ color: 'var(--color-savings)', fontWeight: 600 }}>
                Target met! (+{formatINR(rule503020.actualSavingsPaise - rule503020.targetSavingsPaise)} surplus)
              </span>
            ) : (
              <span style={{ color: 'var(--color-text-muted)' }}>
                {formatINR(Math.max(0, rule503020.remainingSavingsPaise))} to reach target
              </span>
            )}
            <span style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>
              {rule503020.actual.actualSavingsPct}% of pocket money
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

