import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { useToast } from './Toast';

export default function AddTransactionModal({ isOpen, onClose, onSuccess }) {
  const { showToast } = useToast();
  const [categories, setCategories] = useState([]);
  const [amount, setAmount] = useState('');
  const [type, setType] = useState('expense');
  const [categoryName, setCategoryName] = useState('Food & Groceries');
  const [classification, setClassification] = useState('need');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      api.categories.list()
        .then(res => {
          if (res && res.categories) setCategories(res.categories);
        })
        .catch(() => {});
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCategoryChange = (e) => {
    const selected = e.target.value;
    setCategoryName(selected);
    const cat = categories.find(c => c.name === selected);
    if (cat) {
      if (cat.type === 'savings' || selected === 'Savings Goal Deposit') {
        setType('transfer_savings');
        setClassification('savings');
      } else if (cat.type === 'income') {
        setType('income');
        setClassification('income');
      } else if (cat.type === 'need') {
        setType('expense');
        setClassification('need');
      } else if (cat.type === 'want') {
        setType('expense');
        setClassification('want');
      }
    }
  };

  const handleTypeChange = (e) => {
    const newType = e.target.value;
    setType(newType);
    if (newType === 'transfer_savings') {
      setClassification('savings');
      setCategoryName('Savings Goal Deposit');
    } else if (newType === 'income') {
      setClassification('income');
    } else if (newType === 'expense' && classification === 'income') {
      setClassification('need');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      showToast('Please enter a valid amount greater than zero.', 'error');
      return;
    }

    setLoading(true);
    try {
      await api.transactions.create({
        amount: Number(amount),
        type,
        category_name: categoryName,
        classification,
        description,
        date
      });
      showToast('Transaction saved successfully!', 'success');
      onSuccess?.();
      onClose();
      // reset
      setAmount('');
      setDescription('');
    } catch (err) {
      showToast(err.message || 'Failed to save transaction.', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay active" style={{ display: 'flex' }} onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Record New Transaction</h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="tx-amount">Amount (₹)</label>
            <input
              id="tx-amount"
              type="number"
              step="0.01"
              min="0.01"
              className="form-control"
              required
              placeholder="e.g. 250.00"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              autoFocus
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div className="form-group">
              <label className="form-label" htmlFor="tx-type">Type</label>
              <select id="tx-type" className="form-control" value={type} onChange={handleTypeChange}>
                <option value="expense">Expense</option>
                <option value="income">Income / Allowance</option>
                <option value="transfer_savings">Savings Transfer</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="tx-category">Category</label>
              <select id="tx-category" className="form-control" value={categoryName} onChange={handleCategoryChange}>
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
              <label className="form-label" htmlFor="tx-classification">50/30/20 Classification</label>
              <select id="tx-classification" className="form-control" value={classification} onChange={e => setClassification(e.target.value)}>
                <option value="need">Essential Need (50%)</option>
                <option value="want">Discretionary Want (30%)</option>
                <option value="savings">Savings Allocation (20%)</option>
                <option value="income">Income / Inflow</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="tx-date">Date</label>
              <input
                id="tx-date"
                type="date"
                className="form-control"
                required
                value={date}
                onChange={e => setDate(e.target.value)}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="tx-desc">Description (Optional)</label>
            <input
              id="tx-desc"
              type="text"
              className="form-control"
              placeholder="e.g. Canteen lunch, Metro recharge"
              value={description}
              onChange={e => setDescription(e.target.value)}
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', marginTop: '12px' }}
            disabled={loading}
          >
            {loading ? 'Saving...' : 'Record Transaction'}
          </button>
        </form>
      </div>
    </div>
  );
}

