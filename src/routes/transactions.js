import express from 'express';
import crypto from 'node:crypto';
import { getDb } from '../database/db.js';
import { requireAuth } from '../middleware/auth.js';
import { rupeesToPaise } from '../utils/currency.js';
import { validateTransactionPayload } from '../validators/index.js';

export const transactionsRouter = express.Router();

/**
 * GET /api/transactions
 */
transactionsRouter.get('/', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const userId = req.user.id;
    const {
      period,
      startDate,
      endDate,
      type,
      classification,
      categoryId,
      search,
      limit = '50',
      offset = '0',
      sort = 'date_desc'
    } = req.query;

    const conditions = ['user_id = ?'];
    const params = [userId];

    if (period) {
      conditions.push("strftime('%Y-%m', date) = ?");
      params.push(period);
    }
    if (startDate) {
      conditions.push('date >= ?');
      params.push(startDate);
    }
    if (endDate) {
      conditions.push('date <= ?');
      params.push(endDate);
    }
    if (type) {
      conditions.push('type = ?');
      params.push(type);
    }
    if (classification) {
      conditions.push('classification = ?');
      params.push(classification);
    }
    if (categoryId) {
      conditions.push('category_id = ?');
      params.push(categoryId);
    }
    if (search && typeof search === 'string' && search.trim().length > 0) {
      conditions.push('(description LIKE ? OR category_name LIKE ?)');
      const pattern = `%${search.trim()}%`;
      params.push(pattern, pattern);
    }

    const whereClause = conditions.join(' AND ');

    // Sorting
    let orderClause = 'date DESC, created_at DESC';
    if (sort === 'date_asc') orderClause = 'date ASC, created_at ASC';
    else if (sort === 'amount_desc') orderClause = 'amount_paise DESC';
    else if (sort === 'amount_asc') orderClause = 'amount_paise ASC';

    // Count query
    const totalRow = db.prepare(`SELECT COUNT(*) as count FROM transactions WHERE ${whereClause}`).get(...params);
    const total = totalRow.count;

    // Financial totals summary in selected filter scope
    const totalsRow = db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN type = 'income' THEN amount_paise ELSE 0 END), 0) AS total_income_paise,
        COALESCE(SUM(CASE WHEN type = 'expense' THEN amount_paise ELSE 0 END), 0) AS total_expense_paise,
        COALESCE(SUM(CASE WHEN classification = 'need' THEN amount_paise ELSE 0 END), 0) AS needs_expense_paise,
        COALESCE(SUM(CASE WHEN classification = 'want' THEN amount_paise ELSE 0 END), 0) AS wants_expense_paise,
        COALESCE(SUM(CASE WHEN type = 'transfer_savings' THEN amount_paise ELSE 0 END), 0) AS savings_transfers_paise
      FROM transactions
      WHERE ${whereClause}
    `).get(...params);

    // Paginated list
    const parsedLimit = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
    const parsedOffset = Math.max(0, parseInt(offset, 10) || 0);

    const listQuery = `
      SELECT id, user_id, amount_paise, type, category_id, category_name, classification,
             description, date, version, created_at, updated_at
      FROM transactions
      WHERE ${whereClause}
      ORDER BY ${orderClause}
      LIMIT ? OFFSET ?
    `;
    const transactions = db.prepare(listQuery).all(...params, parsedLimit, parsedOffset);

    return res.json({
      transactions,
      pagination: {
        total,
        limit: parsedLimit,
        offset: parsedOffset,
        hasMore: parsedOffset + transactions.length < total
      },
      summary: totalsRow
    });
  } catch (err) {
    console.error('Fetch transactions error:', err);
    return res.status(500).json({ error: 'Failed to retrieve transactions.' });
  }
});

/**
 * POST /api/transactions
 */
transactionsRouter.post('/', requireAuth, (req, res) => {
  try {
    const {
      id: customId,
      amount,
      type,
      category_id,
      category_name,
      classification,
      description = '',
      date,
      goal_id
    } = req.body;

    const validation = validateTransactionPayload({
      amount,
      type,
      classification,
      category_name,
      date
    });

    if (!validation.isValid) {
      return res.status(400).json({ error: validation.errors.join(' ') });
    }

    const amountPaise = rupeesToPaise(amount);
    const txId = customId || crypto.randomUUID();
    const now = new Date().toISOString();
    const db = getDb();

    db.exec('BEGIN TRANSACTION;');
    try {
      // Check if transaction ID already exists for this user (prevent duplicate sync/resubmission)
      const existing = db.prepare('SELECT id FROM transactions WHERE id = ? AND user_id = ?').get(txId, req.user.id);
      if (existing) {
        db.exec('ROLLBACK;');
        return res.status(200).json({
          message: 'Transaction already recorded',
          transaction: existing
        });
      }

      db.prepare(`
        INSERT INTO transactions (
          id, user_id, amount_paise, type, category_id, category_name,
          classification, description, date, version, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
      `).run(
        txId,
        req.user.id,
        amountPaise,
        type,
        category_id || null,
        category_name.trim(),
        classification,
        description.trim(),
        date,
        now,
        now
      );

      // If this transaction is a savings transfer linked to a goal, update goal
      if (type === 'transfer_savings' && goal_id) {
        const goal = db.prepare('SELECT id, current_saved_paise, target_amount_paise FROM savings_goals WHERE id = ? AND user_id = ?').get(goal_id, req.user.id);
        if (goal) {
          const newCurrentSaved = Math.max(0, goal.current_saved_paise + amountPaise);
          const newStatus = newCurrentSaved >= goal.target_amount_paise ? 'completed' : 'active';

          db.prepare(`
            UPDATE savings_goals
            SET current_saved_paise = ?, status = ?, version = version + 1, updated_at = ?
            WHERE id = ?
          `).run(newCurrentSaved, newStatus, now, goal.id);

          db.prepare(`
            INSERT INTO savings_movements (id, goal_id, user_id, amount_paise, note, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
          `).run(crypto.randomUUID(), goal.id, req.user.id, amountPaise, description || 'Goal deposit', now);
        }
      }

      db.exec('COMMIT;');

      const createdTx = db.prepare('SELECT * FROM transactions WHERE id = ?').get(txId);
      return res.status(201).json({
        message: 'Transaction saved successfully',
        transaction: createdTx
      });
    } catch (err) {
      db.exec('ROLLBACK;');
      throw err;
    }
  } catch (err) {
    console.error('Create transaction error:', err);
    return res.status(500).json({ error: 'Failed to record transaction.' });
  }
});

/**
 * PATCH /api/transactions/:id
 */
transactionsRouter.patch('/:id', requireAuth, (req, res) => {
  try {
    const txId = req.params.id;
    const db = getDb();
    const existing = db.prepare('SELECT * FROM transactions WHERE id = ? AND user_id = ?').get(txId, req.user.id);

    if (!existing) {
      return res.status(404).json({ error: 'Transaction not found or access denied.' });
    }

    const { amount, type, category_id, category_name, classification, description, date } = req.body;
    const updates = [];
    const params = [];

    if (amount !== undefined) {
      const amountPaise = rupeesToPaise(amount);
      updates.push('amount_paise = ?');
      params.push(amountPaise);
    }
    if (type !== undefined) {
      updates.push('type = ?');
      params.push(type);
    }
    if (category_id !== undefined) {
      updates.push('category_id = ?');
      params.push(category_id);
    }
    if (category_name !== undefined) {
      updates.push('category_name = ?');
      params.push(category_name.trim());
    }
    if (classification !== undefined) {
      updates.push('classification = ?');
      params.push(classification);
    }
    if (description !== undefined) {
      updates.push('description = ?');
      params.push(description.trim());
    }
    if (date !== undefined) {
      updates.push('date = ?');
      params.push(date);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update provided.' });
    }

    const now = new Date().toISOString();
    updates.push('version = version + 1');
    updates.push('updated_at = ?');
    params.push(now);

    params.push(txId, req.user.id);

    db.prepare(`
      UPDATE transactions
      SET ${updates.join(', ')}
      WHERE id = ? AND user_id = ?
    `).run(...params);

    const updatedTx = db.prepare('SELECT * FROM transactions WHERE id = ?').get(txId);
    return res.json({
      message: 'Transaction updated successfully',
      transaction: updatedTx
    });
  } catch (err) {
    console.error('Update transaction error:', err);
    return res.status(500).json({ error: 'Failed to update transaction.' });
  }
});

/**
 * DELETE /api/transactions/:id
 */
transactionsRouter.delete('/:id', requireAuth, (req, res) => {
  try {
    const txId = req.params.id;
    const db = getDb();
    const existing = db.prepare('SELECT * FROM transactions WHERE id = ? AND user_id = ?').get(txId, req.user.id);

    if (!existing) {
      return res.status(404).json({ error: 'Transaction not found or access denied.' });
    }

    db.prepare('DELETE FROM transactions WHERE id = ? AND user_id = ?').run(txId, req.user.id);

    return res.json({
      message: 'Transaction deleted successfully',
      deletedId: txId
    });
  } catch (err) {
    console.error('Delete transaction error:', err);
    return res.status(500).json({ error: 'Failed to delete transaction.' });
  }
});

