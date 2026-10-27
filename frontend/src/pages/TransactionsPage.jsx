import React, { useEffect, useState, useMemo } from 'react';
import { api } from '../services/api';
import { formatINR } from '../services/calculations';
import { useToast } from '../components/Toast';

export default function TransactionsPage({ currentPeriod, onOpenAddTx }) {
  const { showToast } = useToast();
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [classFilter, setClassFilter] = useState('');

  const loadTxs = async () => {
    setLoading(true);
    try {
      const res = await api.transactions.list(`period=${currentPeriod}`);
      setTransactions(res.transactions || []);
    } catch (err) {
      showToast(err.message || 'Failed to load transactions.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTxs();
  }, [currentPeriod]);

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this transaction?')) return;
    try {
      await api.transactions.delete(id);
      showToast('Transaction deleted successfully.', 'info');
      setTransactions(prev => prev.filter(t => t.id !== id));
    } catch (err) {
      showToast(err.message || 'Failed to delete transaction.', 'error');
    }
  };

  const filtered = useMemo(() => {
    return transactions.filter(tx => {
      const matchSearch = !search ||
        (tx.description && tx.description.toLowerCase().includes(search.toLowerCase())) ||
        (tx.category_name && tx.category_name.toLowerCase().includes(search.toLowerCase()));
      const matchType = !typeFilter || tx.type === typeFilter;
      const matchClass = !classFilter || tx.classification === classFilter;
      return matchSearch && matchType && matchClass;
    });
  }, [transactions, search, typeFilter, classFilter]);

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', color: 'var(--color-primary)' }}>Transaction Ledger</h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
            Viewing records for {currentPeriod} ({filtered.length} total)
          </p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={onOpenAddTx}>+ Add Transaction</button>
      </div>

      {/* Filters bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '20px' }}>
        <input
          type="text"
          className="form-control"
          placeholder="Search by note or category..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select className="form-control" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
          <option value="">All Types</option>
          <option value="expense">Expense</option>
          <option value="income">Income / Allowance</option>
          <option value="transfer_savings">Savings Transfer</option>
        </select>
        <select className="form-control" value={classFilter} onChange={e => setClassFilter(e.target.value)}>
          <option value="">All 50/30/20 Categories</option>
          <option value="need">Essential Needs (50%)</option>
          <option value="want">Discretionary Wants (30%)</option>
          <option value="savings">Savings Allocation (20%)</option>
        </select>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <div className="auth-loading-spinner" style={{ margin: '0 auto 12px' }}></div>
          <p style={{ color: 'var(--color-text-muted)' }}>Loading transactions...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--color-text-muted)' }}>
          <p>No transactions matching your criteria.</p>
        </div>
      ) : (
        <div className="table-responsive">
          <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-border)', textAlign: 'left', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
                <th style={{ padding: '10px 8px' }}>Date</th>
                <th style={{ padding: '10px 8px' }}>Description</th>
                <th style={{ padding: '10px 8px' }}>Category</th>
                <th style={{ padding: '10px 8px' }}>50/30/20</th>
                <th style={{ padding: '10px 8px', textAlign: 'right' }}>Amount</th>
                <th style={{ padding: '10px 8px', textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(tx => (
                <tr key={tx.id} style={{ borderBottom: '1px solid var(--color-border)', fontSize: '0.88rem' }}>
                  <td style={{ padding: '10px 8px' }}>{tx.date || '-'}</td>
                  <td style={{ padding: '10px 8px', fontWeight: 600 }}>{tx.description || tx.category_name}</td>
                  <td style={{ padding: '10px 8px' }}>
                    <span className="badge-tag" style={{ background: 'var(--color-surface-subtle)' }}>
                      {tx.category_name}
                    </span>
                  </td>
                  <td style={{ padding: '10px 8px' }}>
                    <span className={`status-badge ${tx.classification === 'need' ? 'healthy' : tx.classification === 'want' ? 'caution' : 'near_limit'}`}>
                      {tx.classification}
                    </span>
                  </td>
                  <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 700, color: tx.type === 'income' ? 'var(--color-primary)' : tx.type === 'transfer_savings' ? 'var(--color-savings)' : 'var(--color-danger)' }}>
                    {tx.type === 'income' ? '+' : '-'}{formatINR(tx.amount_paise)}
                  </td>
                  <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                    <button
                      className="btn btn-secondary btn-sm"
                      style={{ padding: '4px 8px', fontSize: '0.75rem', color: 'var(--color-danger)' }}
                      onClick={() => handleDelete(tx.id)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
