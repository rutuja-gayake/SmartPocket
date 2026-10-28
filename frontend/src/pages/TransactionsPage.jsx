import React, { useEffect, useState, useMemo } from 'react';
import { api } from '../services/api';
import { formatINR } from '../services/calculations';
import { useToast } from '../components/Toast';

export default function TransactionsPage({ currentPeriod, onOpenAddTx }) {
  const { showToast } = useToast();
  const [transactions, setTransactions] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [classFilter, setClassFilter] = useState('');

  // Edit Modal State
  const [editingTx, setEditingTx] = useState(null);
  const [editAmount, setEditAmount] = useState('');
  const [editType, setEditType] = useState('expense');
  const [editCategory, setEditCategory] = useState('');
  const [editClassification, setEditClassification] = useState('need');
  const [editDescription, setEditDescription] = useState('');
  const [editDate, setEditDate] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const loadTxs = async () => {
    setLoading(true);
    try {
      const [txRes, catRes] = await Promise.all([
        api.transactions.list(`period=${currentPeriod}`),
        api.categories.list().catch(() => ({ categories: [] }))
      ]);
      setTransactions(txRes.transactions || []);
      if (catRes?.categories) setCategories(catRes.categories);
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
      window.dispatchEvent(new CustomEvent('smartpocket:data_changed'));
    } catch (err) {
      showToast(err.message || 'Failed to delete transaction.', 'error');
    }
  };

  const handleOpenEdit = (tx) => {
    setEditingTx(tx);
    setEditAmount(String((tx.amount_paise || 0) / 100));
    setEditType(tx.type || 'expense');
    setEditCategory(tx.category_name || '');
    setEditClassification(tx.classification || 'need');
    setEditDescription(tx.description || '');
    setEditDate(tx.date || new Date().toISOString().slice(0, 10));
  };

  const handleCategorySelect = (e) => {
    const selected = e.target.value;
    setEditCategory(selected);
    const cat = categories.find(c => c.name === selected);
    if (cat) {
      if (cat.type === 'savings' || selected === 'Savings Goal Deposit') {
        setEditType('transfer_savings');
        setEditClassification('savings');
      } else if (cat.type === 'income') {
        setEditType('income');
        setEditClassification('income');
      } else if (cat.type === 'need') {
        setEditType('expense');
        setEditClassification('need');
      } else if (cat.type === 'want') {
        setEditType('expense');
        setEditClassification('want');
      }
    }
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editAmount || isNaN(Number(editAmount)) || Number(editAmount) <= 0) {
      showToast('Please enter a valid amount greater than zero.', 'error');
      return;
    }

    setSavingEdit(true);
    try {
      const selectedCat = categories.find(c => c.name === editCategory);
      const res = await api.transactions.update(editingTx.id, {
        amount: Number(editAmount),
        type: editType,
        category_id: selectedCat?.id || null,
        category_name: editCategory,
        classification: editClassification,
        description: editDescription,
        date: editDate
      });

      const updated = res.transaction;
      setTransactions(prev => prev.map(t => t.id === editingTx.id ? (updated || { ...t, ...reqPayload }) : t));
      setEditingTx(null);
      showToast('Transaction updated successfully!', 'success');
      window.dispatchEvent(new CustomEvent('smartpocket:data_changed'));
      loadTxs();
    } catch (err) {
      showToast(err.message || 'Failed to update transaction.', 'error');
    } finally {
      setSavingEdit(false);
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
                  <td style={{ padding: '10px 8px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                    <button
                      className="btn btn-secondary btn-sm"
                      style={{ padding: '4px 8px', fontSize: '0.75rem', marginRight: '6px' }}
                      onClick={() => handleOpenEdit(tx)}
                    >
                      ✏️ Edit
                    </button>
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

      {/* Edit Transaction Modal */}
      {Boolean(editingTx) && (
        <div className="modal-overlay active" style={{ display: 'flex' }} onClick={() => setEditingTx(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Edit Transaction</h3>
              <button className="modal-close" onClick={() => setEditingTx(null)}>&times;</button>
            </div>

            <form onSubmit={handleSaveEdit}>
              <div className="form-group">
                <label className="form-label" htmlFor="edit-tx-amount">Amount (₹)</label>
                <input
                  id="edit-tx-amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  className="form-control"
                  required
                  value={editAmount}
                  onChange={e => setEditAmount(e.target.value)}
                  autoFocus
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="form-group">
                  <label className="form-label" htmlFor="edit-tx-type">Type</label>
                  <select
                    id="edit-tx-type"
                    className="form-control"
                    value={editType}
                    onChange={e => setEditType(e.target.value)}
                  >
                    <option value="expense">Expense</option>
                    <option value="income">Income / Allowance</option>
                    <option value="transfer_savings">Savings Transfer</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="edit-tx-category">Category</label>
                  <select
                    id="edit-tx-category"
                    className="form-control"
                    value={editCategory}
                    onChange={handleCategorySelect}
                  >
                    {categories.length > 0 ? (
                      categories.map(c => (
                        <option key={c.id || c.name} value={c.name}>{c.name} ({c.type})</option>
                      ))
                    ) : (
                      <>
                        <option value="Food & Groceries">Food & Groceries</option>
                        <option value="Hostel & Rent">Hostel & Rent</option>
                        <option value="Cafes & Hangouts">Cafes & Hangouts</option>
                        <option value="Pocket Money / Allowance">Pocket Money / Allowance</option>
                        <option value="Savings Goal Deposit">Savings Goal Deposit</option>
                      </>
                    )}
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="form-group">
                  <label className="form-label" htmlFor="edit-tx-class">50/30/20 Classification</label>
                  <select
                    id="edit-tx-class"
                    className="form-control"
                    value={editClassification}
                    onChange={e => setEditClassification(e.target.value)}
                  >
                    <option value="need">Essential Need (50%)</option>
                    <option value="want">Discretionary Want (30%)</option>
                    <option value="savings">Savings Allocation (20%)</option>
                    <option value="income">Income / Inflow</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="edit-tx-date">Date</label>
                  <input
                    id="edit-tx-date"
                    type="date"
                    className="form-control"
                    required
                    value={editDate}
                    onChange={e => setEditDate(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="edit-tx-desc">Description / Note</label>
                <input
                  id="edit-tx-desc"
                  type="text"
                  className="form-control"
                  placeholder="Optional details..."
                  value={editDescription}
                  onChange={e => setEditDescription(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={savingEdit}>
                  {savingEdit ? 'Saving Changes...' : 'Save Changes'}
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setEditingTx(null)}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

