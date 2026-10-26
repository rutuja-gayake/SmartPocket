import express from 'express';
import crypto from 'node:crypto';
import { getDb } from '../database/db.js';
import { requireAuth } from '../middleware/auth.js';
import { rupeesToPaise } from '../utils/currency.js';
import { calculateGoalProgress } from '../services/calculations.js';
import { validateGoalPayload } from '../validators/index.js';

export const goalsRouter = express.Router();

/**
 * GET /api/goals
 */
goalsRouter.get('/', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const goals = db.prepare(`
      SELECT id, user_id, title, target_amount_paise, current_saved_paise,
             target_date, description, status, version, created_at, updated_at
      FROM savings_goals
      WHERE user_id = ?
      ORDER BY status ASC, created_at DESC
    `).all(req.user.id);

    const now = new Date();
    const enrichedGoals = goals.map(g => ({
      ...g,
      analysis: calculateGoalProgress(g, now)
    }));

    return res.json({ goals: enrichedGoals });
  } catch (err) {
    console.error('Fetch goals error:', err);
    return res.status(500).json({ error: 'Failed to retrieve savings goals.' });
  }
});

/**
 * POST /api/goals
 */
goalsRouter.post('/', requireAuth, (req, res) => {
  try {
    const { id: customId, title, target_amount, target_date, description } = req.body;
    const validation = validateGoalPayload({ title, target_amount, target_date });

    if (!validation.isValid) {
      return res.status(400).json({ error: validation.errors.join(' ') });
    }

    const targetPaise = rupeesToPaise(target_amount);
    const goalId = customId || crypto.randomUUID();
    const now = new Date().toISOString();
    const db = getDb();

    db.prepare(`
      INSERT INTO savings_goals (
        id, user_id, title, target_amount_paise, current_saved_paise,
        target_date, description, status, version, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 0, ?, ?, 'active', 1, ?, ?)
    `).run(
      goalId,
      req.user.id,
      title.trim(),
      targetPaise,
      target_date || null,
      description ? description.trim() : '',
      now,
      now
    );

    const created = db.prepare('SELECT * FROM savings_goals WHERE id = ?').get(goalId);
    return res.status(201).json({
      message: 'Savings goal created successfully',
      goal: {
        ...created,
        analysis: calculateGoalProgress(created, new Date())
      }
    });
  } catch (err) {
    console.error('Create goal error:', err);
    return res.status(500).json({ error: 'Failed to create savings goal.' });
  }
});

/**
 * PATCH /api/goals/:id
 */
goalsRouter.patch('/:id', requireAuth, (req, res) => {
  try {
    const goalId = req.params.id;
    const db = getDb();
    const existing = db.prepare('SELECT * FROM savings_goals WHERE id = ? AND user_id = ?').get(goalId, req.user.id);

    if (!existing) {
      return res.status(404).json({ error: 'Savings goal not found or access denied.' });
    }

    const { title, target_amount, target_date, description, status } = req.body;
    const updates = [];
    const params = [];

    if (title !== undefined) {
      updates.push('title = ?');
      params.push(title.trim());
    }
    if (target_amount !== undefined) {
      updates.push('target_amount_paise = ?');
      params.push(rupeesToPaise(target_amount));
    }
    if (target_date !== undefined) {
      updates.push('target_date = ?');
      params.push(target_date || null);
    }
    if (description !== undefined) {
      updates.push('description = ?');
      params.push(description.trim());
    }
    if (status !== undefined) {
      if (!['active', 'paused', 'completed'].includes(status)) {
        return res.status(400).json({ error: 'Status must be active, paused, or completed.' });
      }
      updates.push('status = ?');
      params.push(status);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update provided.' });
    }

    const now = new Date().toISOString();
    updates.push('version = version + 1');
    updates.push('updated_at = ?');
    params.push(now);

    params.push(goalId, req.user.id);

    db.prepare(`
      UPDATE savings_goals
      SET ${updates.join(', ')}
      WHERE id = ? AND user_id = ?
    `).run(...params);

    const updated = db.prepare('SELECT * FROM savings_goals WHERE id = ?').get(goalId);
    return res.json({
      message: 'Savings goal updated successfully',
      goal: {
        ...updated,
        analysis: calculateGoalProgress(updated, new Date())
      }
    });
  } catch (err) {
    console.error('Update goal error:', err);
    return res.status(500).json({ error: 'Failed to update savings goal.' });
  }
});

/**
 * DELETE /api/goals/:id
 */
goalsRouter.delete('/:id', requireAuth, (req, res) => {
  try {
    const goalId = req.params.id;
    const db = getDb();
    const existing = db.prepare('SELECT * FROM savings_goals WHERE id = ? AND user_id = ?').get(goalId, req.user.id);

    if (!existing) {
      return res.status(404).json({ error: 'Savings goal not found or access denied.' });
    }

    db.prepare('DELETE FROM savings_goals WHERE id = ? AND user_id = ?').run(goalId, req.user.id);

    return res.json({
      message: 'Savings goal deleted successfully',
      deletedId: goalId
    });
  } catch (err) {
    console.error('Delete goal error:', err);
    return res.status(500).json({ error: 'Failed to delete savings goal.' });
  }
});

/**
 * POST /api/goals/:id/movements
 * Add deposit or withdrawal to a savings goal
 * Guarantees balance consistency by recording an audit movement and corresponding spendable transaction.
 */
goalsRouter.post('/:id/movements', requireAuth, (req, res) => {
  try {
    const goalId = req.params.id;
    const { amount, type = 'deposit', note = '' } = req.body; // type: 'deposit' | 'withdrawal'

    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({ error: 'Amount must be greater than zero.' });
    }

    const amountPaise = rupeesToPaise(amount);
    const db = getDb();

    const goal = db.prepare('SELECT * FROM savings_goals WHERE id = ? AND user_id = ?').get(goalId, req.user.id);
    if (!goal) {
      return res.status(404).json({ error: 'Savings goal not found.' });
    }

    if (type === 'withdrawal' && amountPaise > goal.current_saved_paise) {
      return res.status(400).json({
        error: `Cannot withdraw more than current saved amount (₹${(goal.current_saved_paise / 100).toFixed(2)}).`
      });
    }

    const movementDelta = type === 'withdrawal' ? -amountPaise : amountPaise;
    const newSaved = Math.max(0, goal.current_saved_paise + movementDelta);
    const newStatus = newSaved >= goal.target_amount_paise ? 'completed' : 'active';
    const now = new Date().toISOString();
    const today = now.slice(0, 10);

    db.exec('BEGIN TRANSACTION;');
    try {
      // 1. Update Goal
      db.prepare(`
        UPDATE savings_goals
        SET current_saved_paise = ?, status = ?, version = version + 1, updated_at = ?
        WHERE id = ?
      `).run(newSaved, newStatus, now, goalId);

      // 2. Insert movement audit record
      const movementId = crypto.randomUUID();
      db.prepare(`
        INSERT INTO savings_movements (id, goal_id, user_id, amount_paise, note, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(movementId, goalId, req.user.id, movementDelta, note.trim(), now);

      // 3. Create corresponding spendable transaction so pocket balance accurately reflects the transfer
      const txId = crypto.randomUUID();
      const txType = type === 'deposit' ? 'transfer_savings' : 'income';
      const txDesc = type === 'deposit'
        ? `Deposit to ${goal.title}${note ? ` (${note})` : ''}`
        : `Withdrawal from ${goal.title}${note ? ` (${note})` : ''}`;

      db.prepare(`
        INSERT INTO transactions (
          id, user_id, amount_paise, type, category_id, category_name,
          classification, description, date, version, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'cat_save_goal', 'Savings Goal Deposit', 'savings', ?, ?, 1, ?, ?)
      `).run(txId, req.user.id, amountPaise, txType, txDesc, today, now, now);

      db.exec('COMMIT;');

      const updatedGoal = db.prepare('SELECT * FROM savings_goals WHERE id = ?').get(goalId);
      return res.status(201).json({
        message: type === 'deposit' ? 'Deposit recorded successfully' : 'Withdrawal recorded successfully',
        goal: {
          ...updatedGoal,
          analysis: calculateGoalProgress(updatedGoal, new Date())
        }
      });
    } catch (err) {
      db.exec('ROLLBACK;');
      throw err;
    }
  } catch (err) {
    console.error('Savings movement error:', err);
    return res.status(500).json({ error: 'Failed to record savings movement.' });
  }
});
