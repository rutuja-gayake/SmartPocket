import express from 'express';
import crypto from 'node:crypto';
import { getDb } from '../database/db.js';
import { requireAuth } from '../middleware/auth.js';
import { rupeesToPaise } from '../utils/currency.js';
import { calculateGoalProgress, calculateAvailableBalance } from '../services/calculations.js';
import { validateGoalPayload, validateMovementPayload } from '../validators/index.js';

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
 * GET /api/goals/movements/all
 * Retrieves all savings movements across all goals for the user.
 */
goalsRouter.get('/movements/all', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const movements = db.prepare(`
      SELECT m.id, m.goal_id, m.amount_paise, m.note, m.created_at, g.title AS goal_title
      FROM savings_movements m
      JOIN savings_goals g ON m.goal_id = g.id
      WHERE m.user_id = ?
      ORDER BY m.created_at DESC
      LIMIT 100
    `).all(req.user.id);
    return res.json({ movements });
  } catch (err) {
    console.error('Fetch all movements error:', err);
    return res.status(500).json({ error: 'Failed to retrieve savings movements history.' });
  }
});

/**
 * GET /api/goals/:id/movements
 * Retrieves savings movements for a specific goal.
 */
goalsRouter.get('/:id/movements', requireAuth, (req, res) => {
  try {
    const goalId = req.params.id;
    const db = getDb();
    const goal = db.prepare('SELECT id FROM savings_goals WHERE id = ? AND user_id = ?').get(goalId, req.user.id);
    if (!goal) {
      return res.status(404).json({ error: 'Savings goal not found or access denied.' });
    }

    const movements = db.prepare(`
      SELECT id, goal_id, user_id, amount_paise, note, created_at
      FROM savings_movements
      WHERE goal_id = ? AND user_id = ?
      ORDER BY created_at DESC
    `).all(goalId, req.user.id);

    return res.json({ movements });
  } catch (err) {
    console.error('Fetch goal movements error:', err);
    return res.status(500).json({ error: 'Failed to retrieve goal movements.' });
  }
});

/**
 * POST /api/goals/:id/movements
 * Add deposit or withdrawal to a savings goal.
 * Treats deposits/withdrawals as internal balance transfers, preserving actual monthly spent.
 */
goalsRouter.post('/:id/movements', requireAuth, (req, res) => {
  try {
    const goalId = req.params.id;
    const { amount, type = 'deposit', note = '', id: customId, movementId: customMvtId } = req.body;

    const validation = validateMovementPayload({ amount, type });
    if (!validation.isValid) {
      return res.status(400).json({ error: validation.errors.join(' ') });
    }

    const amountPaise = rupeesToPaise(amount);
    const db = getDb();

    // Verify authenticated user owns the goal
    const goal = db.prepare('SELECT * FROM savings_goals WHERE id = ? AND user_id = ?').get(goalId, req.user.id);
    if (!goal) {
      return res.status(404).json({ error: 'Savings goal not found or access denied.' });
    }

    // Idempotency check: if movement ID already processed, return existing goal state
    const movementId = customId || customMvtId || crypto.randomUUID();
    const existingMovement = db.prepare('SELECT id FROM savings_movements WHERE id = ?').get(movementId);
    if (existingMovement) {
      return res.status(200).json({
        message: 'Savings movement already recorded',
        goal: {
          ...goal,
          analysis: calculateGoalProgress(goal, new Date())
        }
      });
    }

    // Verify sufficient available funds if depositing
    if (type === 'deposit') {
      const lifetime = db.prepare(`
        SELECT
          COALESCE(SUM(CASE WHEN type = 'income' THEN amount_paise ELSE 0 END), 0) AS total_income,
          COALESCE(SUM(CASE WHEN type = 'expense' THEN amount_paise ELSE 0 END), 0) AS total_expense,
          COALESCE(SUM(CASE WHEN type = 'transfer_savings' THEN amount_paise ELSE 0 END), 0) AS total_savings
        FROM transactions
        WHERE user_id = ?
      `).get(req.user.id);

      const availableBalancePaise = calculateAvailableBalance({
        totalIncomePaise: lifetime.total_income,
        totalExpensePaise: lifetime.total_expense,
        netSavingsTransfersPaise: lifetime.total_savings
      });

      if (amountPaise > availableBalancePaise) {
        return res.status(400).json({
          error: `Insufficient available balance (₹${(availableBalancePaise / 100).toFixed(2)}) to deposit ₹${(amountPaise / 100).toFixed(2)}.`
        });
      }
    }

    // Verify withdrawal amount does not exceed saved amount in goal
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
      db.prepare(`
        INSERT INTO savings_movements (id, goal_id, user_id, amount_paise, note, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(movementId, goalId, req.user.id, movementDelta, note ? note.trim() : '', now);

      // 3. Insert transaction record for internal transfer:
      // Deposit: +amountPaise with type 'transfer_savings'
      // Withdrawal: -amountPaise with type 'transfer_savings'
      // Both keep income and actual monthly expense completely unchanged.
      const txId = crypto.randomUUID();
      const txDesc = type === 'deposit'
        ? `Deposit to ${goal.title}${note ? ` (${note.trim()})` : ''}`
        : `Withdrawal from ${goal.title}${note ? ` (${note.trim()})` : ''}`;

      const categoryName = type === 'deposit' ? 'Savings Goal Deposit' : 'Savings Goal Withdrawal';
      db.prepare(`
        INSERT INTO transactions (
          id, user_id, amount_paise, type, category_id, category_name,
          classification, description, date, version, created_at, updated_at
        ) VALUES (?, ?, ?, 'transfer_savings', 'cat_save_goal', ?, 'savings', ?, ?, 1, ?, ?)
      `).run(txId, req.user.id, movementDelta, categoryName, txDesc, today, now, now);

      db.exec('COMMIT;');

      const updatedGoal = db.prepare('SELECT * FROM savings_goals WHERE id = ?').get(goalId);

      // Compute fresh spendable balance after movement commit
      const freshLifetime = db.prepare(`
        SELECT
          COALESCE(SUM(CASE WHEN type = 'income' THEN amount_paise ELSE 0 END), 0) AS total_income,
          COALESCE(SUM(CASE WHEN type = 'expense' THEN amount_paise ELSE 0 END), 0) AS total_expense,
          COALESCE(SUM(CASE WHEN type = 'transfer_savings' THEN amount_paise ELSE 0 END), 0) AS total_savings
        FROM transactions
        WHERE user_id = ?
      `).get(req.user.id);

      const availableBalancePaise = calculateAvailableBalance({
        totalIncomePaise: freshLifetime.total_income,
        totalExpensePaise: freshLifetime.total_expense,
        netSavingsTransfersPaise: freshLifetime.total_savings
      });

      return res.status(201).json({
        message: type === 'deposit' ? 'Deposit recorded successfully' : 'Withdrawal recorded successfully',
        movementId,
        availableBalancePaise,
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

