import React, { useState } from 'react';
import { api } from '../services/api';
import { useToast } from './Toast';

export default function AddGoalModal({ isOpen, onClose, onSuccess }) {
  const { showToast } = useToast();
  const [title, setTitle] = useState('');
  const [targetAmount, setTargetAmount] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) {
      showToast('Please enter a goal title.', 'error');
      return;
    }
    if (!targetAmount || isNaN(Number(targetAmount)) || Number(targetAmount) <= 0) {
      showToast('Please enter a valid target amount.', 'error');
      return;
    }

    setLoading(true);
    try {
      await api.goals.create({
        title: title.trim(),
        target_amount: Number(targetAmount),
        target_date: targetDate || null,
        description: description.trim()
      });
      showToast('Savings goal created successfully!', 'success');
      onSuccess?.();
      onClose();
      // reset
      setTitle('');
      setTargetAmount('');
      setTargetDate('');
      setDescription('');
    } catch (err) {
      showToast(err.message || 'Failed to create goal.', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay active" style={{ display: 'flex' }} onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Create New Savings Goal</h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="goal-title">Goal Name</label>
            <input
              id="goal-title"
              type="text"
              className="form-control"
              required
              placeholder="e.g. New Laptop, Semester Exam Books, Goa Trip"
              value={title}
              onChange={e => setTitle(e.target.value)}
              autoFocus
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div className="form-group">
              <label className="form-label" htmlFor="goal-target">Target Amount (₹)</label>
              <input
                id="goal-target"
                type="number"
                step="0.01"
                min="1"
                className="form-control"
                required
                placeholder="e.g. 5000"
                value={targetAmount}
                onChange={e => setTargetAmount(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="goal-date">Target Date (Optional)</label>
              <input
                id="goal-date"
                type="date"
                className="form-control"
                value={targetDate}
                onChange={e => setTargetDate(e.target.value)}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="goal-desc">Why are you saving for this? (Optional)</label>
            <input
              id="goal-desc"
              type="text"
              className="form-control"
              placeholder="e.g. Need lightweight machine for coding & labs"
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
            {loading ? 'Creating...' : 'Create Savings Goal'}
          </button>
        </form>
      </div>
    </div>
  );
}

