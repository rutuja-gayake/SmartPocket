import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { formatINR, calculateGoalProgress } from '../services/calculations';
import { useToast } from '../components/Toast';

export default function GoalsPage({ onOpenAddGoal, onOpenMovement }) {
  const { showToast } = useToast();
  const [goals, setGoals] = useState([]);
  const [movements, setMovements] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    setLoading(true);
    try {
      const [gRes, mRes] = await Promise.all([
        api.goals.list().catch(() => ({ goals: [] })),
        api.goals.allMovements().catch(() => ({ movements: [] }))
      ]);
      setGoals(gRes.goals || []);
      setMovements(mRes.movements || []);
    } catch (err) {
      showToast(err.message || 'Failed to load savings goals.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleDeleteGoal = async (id) => {
    if (!window.confirm('Are you sure you want to delete this savings goal?')) return;
    try {
      await api.goals.delete(id);
      showToast('Savings goal deleted successfully.', 'info');
      setGoals(prev => prev.filter(g => g.id !== id));
    } catch (err) {
      showToast(err.message || 'Failed to delete goal.', 'error');
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', color: 'var(--color-primary)' }}>Savings Goals Tracker</h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
            Allocate money toward student milestones without counting deposits as expenses.
          </p>
        </div>
        <button className="btn btn-primary" onClick={onOpenAddGoal}>+ Create New Goal</button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <div className="auth-loading-spinner" style={{ margin: '0 auto 12px' }}></div>
          <p style={{ color: 'var(--color-text-muted)' }}>Loading savings goals...</p>
        </div>
      ) : goals.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '48px', marginBottom: '24px' }}>
          <p style={{ fontSize: '1rem', color: 'var(--color-text-muted)', marginBottom: '16px' }}>
            No savings goals yet. Save for semester books, an internship laptop, or college fest trips!
          </p>
          <button className="btn btn-primary" onClick={onOpenAddGoal}>+ Create Your First Goal</button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px', marginBottom: '32px' }}>
          {goals.map(g => {
            const analysis = g.analysis || calculateGoalProgress(g, new Date());
            const pct = analysis.progressPct;
            const remaining = analysis.remainingPaise;
            const isDone = g.status === 'completed' || pct >= 100;

            return (
              <div key={g.id} className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                  <div>
                    <h3 style={{ fontSize: '1.15rem', color: 'var(--color-primary)' }}>{g.title}</h3>
                    <p style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                      Target: {formatINR(g.target_amount_paise)} {g.target_date ? `• By ${g.target_date}` : ''}
                    </p>
                  </div>
                  <span className={`status-badge ${isDone ? 'healthy' : 'near_limit'}`}>
                    {isDone ? 'Completed' : 'Active'}
                  </span>
                </div>

                {/* Progress Bar */}
                <div style={{ backgroundColor: 'var(--color-mint)', borderRadius: '999px', height: '10px', overflow: 'hidden', marginBottom: '8px' }}>
                  <div style={{ backgroundColor: 'var(--color-savings)', height: '100%', width: `${pct}%`, transition: 'width 0.4s ease' }}></div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: '10px' }}>
                  <span>Saved: <strong style={{ color: 'var(--color-primary)' }}>{formatINR(g.current_saved_paise)}</strong> ({pct}%)</span>
                  <span>Remaining: <strong>{formatINR(remaining)}</strong></span>
                </div>

                {/* Milestone Pills */}
                <div style={{ display: 'flex', gap: '6px', fontSize: '0.75rem', marginBottom: '14px' }}>
                  <span style={{ padding: '2px 8px', borderRadius: '4px', background: pct >= 25 ? 'var(--color-mint)' : '#f3f4f6', color: pct >= 25 ? 'var(--color-savings)' : '#9ca3af', fontWeight: 600 }}>25%</span>
                  <span style={{ padding: '2px 8px', borderRadius: '4px', background: pct >= 50 ? 'var(--color-mint)' : '#f3f4f6', color: pct >= 50 ? 'var(--color-savings)' : '#9ca3af', fontWeight: 600 }}>50%</span>
                  <span style={{ padding: '2px 8px', borderRadius: '4px', background: pct >= 75 ? 'var(--color-mint)' : '#f3f4f6', color: pct >= 75 ? 'var(--color-savings)' : '#9ca3af', fontWeight: 600 }}>75%</span>
                  <span style={{ padding: '2px 8px', borderRadius: '4px', background: pct >= 100 ? 'var(--color-mint)' : '#f3f4f6', color: pct >= 100 ? 'var(--color-savings)' : '#9ca3af', fontWeight: 600 }}>100%</span>
                </div>

                {analysis.suggestedWeeklyPaise && !isDone && (
                  <p style={{ fontSize: '0.82rem', color: 'var(--color-primary)', marginBottom: '16px' }}>
                    💡 Suggested pace: Save <strong>{formatINR(analysis.suggestedWeeklyPaise)}/week</strong> to reach target on time.
                  </p>
                )}

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button className="btn btn-primary btn-sm" onClick={() => onOpenMovement(g, 'deposit')}>+ Deposit</button>
                  <button className="btn btn-secondary btn-sm" onClick={() => onOpenMovement(g, 'withdrawal')}>- Withdraw</button>
                  <button className="btn btn-secondary btn-sm" style={{ marginLeft: 'auto', color: 'var(--color-danger)' }} onClick={() => handleDeleteGoal(g.id)}>Delete</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Savings Movement History Ledger */}
      <div className="card">
        <h3 style={{ fontSize: '1.15rem', color: 'var(--color-primary)', marginBottom: '16px' }}>Savings Transfer Activity Ledger</h3>
        {movements.length === 0 ? (
          <p style={{ fontSize: '0.88rem', color: 'var(--color-text-muted)', textAlign: 'center', padding: '20px' }}>
            No savings deposits or withdrawals yet.
          </p>
        ) : (
          <div className="table-responsive">
            <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border)', textAlign: 'left', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
                  <th style={{ padding: '8px' }}>Date</th>
                  <th style={{ padding: '8px' }}>Goal</th>
                  <th style={{ padding: '8px' }}>Movement Type</th>
                  <th style={{ padding: '8px', textAlign: 'right' }}>Amount</th>
                  <th style={{ padding: '8px' }}>Note</th>
                </tr>
              </thead>
              <tbody>
                {movements.map(m => (
                  <tr key={m.id} style={{ borderBottom: '1px solid var(--color-border)', fontSize: '0.88rem' }}>
                    <td style={{ padding: '10px 8px' }}>{m.created_at ? m.created_at.slice(0, 10) : '-'}</td>
                    <td style={{ padding: '10px 8px', fontWeight: 600 }}>{m.goal_title || 'Goal'}</td>
                    <td style={{ padding: '10px 8px' }}>
                      <span className="badge-tag" style={{ backgroundColor: 'var(--color-mint)', color: m.amount_paise >= 0 ? 'var(--color-primary)' : 'var(--color-savings)', fontWeight: 600 }}>
                        {m.amount_paise >= 0 ? '+ Deposit' : '- Withdrawal'}
                      </span>
                    </td>
                    <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 700, color: m.amount_paise >= 0 ? 'var(--color-primary)' : 'var(--color-savings)' }}>
                      {m.amount_paise >= 0 ? '+' : '-'}{formatINR(Math.abs(m.amount_paise))}
                    </td>
                    <td style={{ padding: '10px 8px', color: 'var(--color-text-muted)' }}>{m.note || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

