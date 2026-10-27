import React, { useState } from 'react';
import { api } from '../services/api';
import { useToast } from './Toast';

export default function GoalMovementModal({ isOpen, onClose, goal, defaultType = 'deposit', onSuccess }) {
  const { showToast } = useToast();
  const [type, setType] = useState(defaultType);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);

  // Sync defaultType when modal opens
  React.useEffect(() => {
    if (isOpen) {
      setType(defaultType);
      setAmount('');
      setNote('');
    }
  }, [isOpen, defaultType]);

  if (!isOpen || !goal) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      showToast('Please enter a valid amount greater than zero.', 'error');
      return;
    }

    setLoading(true);
    try {
      await api.goals.movement(goal.id, {
        amount: Number(amount),
        type,
        note: note || (type === 'deposit' ? `Deposit to ${goal.title}` : `Withdrawal from ${goal.title}`)
      });

      showToast(
        type === 'deposit'
          ? `Successfully deposited ₹${Number(amount).toFixed(2)} into ${goal.title}!`
          : `Successfully withdrew ₹${Number(amount).toFixed(2)} from ${goal.title}!`,
        'success'
      );
      onSuccess?.();
      onClose();
    } catch (err) {
      showToast(err.message || 'Movement failed.', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay active" style={{ display: 'flex' }} onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{type === 'deposit' ? 'Deposit to' : 'Withdraw from'} {goal.title}</h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="mvt-type">Action</label>
            <select id="mvt-type" className="form-control" value={type} onChange={e => setType(e.target.value)}>
              <option value="deposit">Deposit (Internal transfer to savings)</option>
              <option value="withdrawal">Withdraw (Transfer back to available cash)</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="mvt-amount">Amount (₹)</label>
            <input
              id="mvt-amount"
              type="number"
              step="0.01"
              min="0.01"
              className="form-control"
              required
              placeholder="e.g. 500"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              autoFocus
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="mvt-note">Note (Optional)</label>
            <input
              id="mvt-note"
              type="text"
              className="form-control"
              placeholder="e.g. Saved from hostel mess rebate"
              value={note}
              onChange={e => setNote(e.target.value)}
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', marginTop: '12px' }}
            disabled={loading}
          >
            {loading ? 'Processing...' : type === 'deposit' ? 'Confirm Deposit' : 'Confirm Withdrawal'}
          </button>
        </form>
      </div>
    </div>
  );
}

