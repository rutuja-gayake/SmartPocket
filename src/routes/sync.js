import express from 'express';
import { getDb } from '../database/db.js';
import { requireAuth } from '../middleware/auth.js';
import { rupeesToPaise } from '../utils/currency.js';

export const syncRouter = express.Router();

/**
 * GET /api/sync/pull
 * Pulls all records created or modified since `since` timestamp for authenticated user.
 */
syncRouter.get('/pull', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const userId = req.user.id;
    const since = req.query.since || '1970-01-01T00:00:00.000Z';

    const transactions = db.prepare(`
      SELECT * FROM transactions
      WHERE user_id = ? AND updated_at > ?
      ORDER BY updated_at ASC
    `).all(userId, since);

    const budgets = db.prepare(`
      SELECT * FROM budgets
      WHERE user_id = ? AND updated_at > ?
      ORDER BY updated_at ASC
    `).all(userId, since);

    const goals = db.prepare(`
      SELECT * FROM savings_goals
      WHERE user_id = ? AND updated_at > ?
      ORDER BY updated_at ASC
    `).all(userId, since);

    const customCategories = db.prepare(`
      SELECT * FROM categories
      WHERE user_id = ? AND created_at > ?
    `).all(userId, since);

    const movements = db.prepare(`
      SELECT * FROM savings_movements
      WHERE user_id = ? AND created_at > ?
      ORDER BY created_at ASC
    `).all(userId, since);

    const serverTimestamp = new Date().toISOString();

    // Update sync metadata
    db.prepare(`
      INSERT INTO sync_metadata (user_id, last_sync_timestamp)
      VALUES (?, ?)
      ON CONFLICT(user_id) DO UPDATE SET last_sync_timestamp = excluded.last_sync_timestamp
    `).run(userId, serverTimestamp);

    return res.json({
      serverTimestamp,
      records: {
        transactions,
        budgets,
        goals,
        categories: customCategories,
        movements
      }
    });
  } catch (err) {
    console.error('Sync pull error:', err);
    return res.status(500).json({ error: 'Failed to pull sync records.' });
  }
});

/**
 * POST /api/sync/push
 * Processes a batch of pending local operations queued while offline.
 */
syncRouter.post('/push', requireAuth, (req, res) => {
  try {
    const { operations = [] } = req.body;
    if (!Array.isArray(operations)) {
      return res.status(400).json({ error: 'Operations must be an array.' });
    }

    const db = getDb();
    const userId = req.user.id;
    const processed = [];
    const conflicts = [];
    const errors = [];
    const now = new Date().toISOString();

    db.exec('BEGIN TRANSACTION;');
    try {
      for (const op of operations) {
        const { operationId, entity, type, recordId, payload, version = 1 } = op;

        if (entity === 'transaction') {
          if (type === 'create') {
            // Check if already exists (idempotency check)
            const existing = db.prepare('SELECT id FROM transactions WHERE id = ?').get(recordId);
            if (existing) {
              processed.push({ operationId, recordId, status: 'already_exists' });
              continue;
            }

            const amountPaise = typeof payload.amount_paise === 'number'
              ? payload.amount_paise
              : rupeesToPaise(payload.amount);

            db.prepare(`
              INSERT INTO transactions (
                id, user_id, amount_paise, type, category_id, category_name,
                classification, description, date, version, created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
              recordId,
              userId,
              amountPaise,
              payload.type,
              payload.category_id || null,
              payload.category_name || 'General',
              payload.classification || 'need',
              payload.description || '',
              payload.date,
              version,
              payload.created_at || now,
              now
            );
            processed.push({ operationId, recordId, status: 'created' });
          } else if (type === 'update') {
            const serverRec = db.prepare('SELECT version FROM transactions WHERE id = ? AND user_id = ?').get(recordId, userId);
            if (serverRec && serverRec.version > version) {
              // Server has newer version -> Conflict!
              conflicts.push({ operationId, recordId, serverVersion: serverRec.version, clientVersion: version });
              continue;
            }

            const amountPaise = typeof payload.amount_paise === 'number'
              ? payload.amount_paise
              : rupeesToPaise(payload.amount);

            db.prepare(`
              UPDATE transactions
              SET amount_paise = ?, type = ?, category_name = ?, classification = ?,
                  description = ?, date = ?, version = version + 1, updated_at = ?
              WHERE id = ? AND user_id = ?
            `).run(
              amountPaise,
              payload.type,
              payload.category_name,
              payload.classification,
              payload.description || '',
              payload.date,
              now,
              recordId,
              userId
            );
            processed.push({ operationId, recordId, status: 'updated' });
          } else if (type === 'delete') {
            db.prepare('DELETE FROM transactions WHERE id = ? AND user_id = ?').run(recordId, userId);
            processed.push({ operationId, recordId, status: 'deleted' });
          }
        } else if (entity === 'goal') {
          if (type === 'create') {
            const existing = db.prepare('SELECT id FROM savings_goals WHERE id = ?').get(recordId);
            if (!existing) {
              const targetPaise = typeof payload.target_amount_paise === 'number'
                ? payload.target_amount_paise
                : rupeesToPaise(payload.target_amount);

              db.prepare(`
                INSERT INTO savings_goals (
                  id, user_id, title, target_amount_paise, current_saved_paise,
                  target_date, description, status, version, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              `).run(
                recordId,
                userId,
                payload.title,
                targetPaise,
                payload.current_saved_paise || 0,
                payload.target_date || null,
                payload.description || '',
                payload.status || 'active',
                version,
                payload.created_at || now,
                now
              );
            }
            processed.push({ operationId, recordId, status: 'created' });
          } else if (type === 'delete') {
            db.prepare('DELETE FROM savings_goals WHERE id = ? AND user_id = ?').run(recordId, userId);
            processed.push({ operationId, recordId, status: 'deleted' });
          }
        } else if (entity === 'goal_movement') {
          if (type === 'create') {
            const existing = db.prepare('SELECT id FROM savings_movements WHERE id = ?').get(recordId);
            if (existing) {
              processed.push({ operationId, recordId, status: 'already_exists' });
              continue;
            }

            const goal = db.prepare('SELECT * FROM savings_goals WHERE id = ? AND user_id = ?').get(payload.goal_id, userId);
            if (goal) {
              const amountPaise = typeof payload.amount_paise === 'number'
                ? payload.amount_paise
                : rupeesToPaise(payload.amount);
              const movementDelta = payload.type === 'withdrawal' ? -amountPaise : amountPaise;
              const newSaved = Math.max(0, goal.current_saved_paise + movementDelta);
              const newStatus = newSaved >= goal.target_amount_paise ? 'completed' : 'active';
              const today = (payload.date || now).slice(0, 10);

              db.prepare(`
                UPDATE savings_goals
                SET current_saved_paise = ?, status = ?, version = version + 1, updated_at = ?
                WHERE id = ?
              `).run(newSaved, newStatus, now, goal.id);

              db.prepare(`
                INSERT INTO savings_movements (id, goal_id, user_id, amount_paise, note, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
              `).run(recordId, goal.id, userId, movementDelta, payload.note || '', payload.created_at || now);

              const txId = crypto.randomUUID();
              const txDesc = payload.type === 'deposit'
                ? `Deposit to ${goal.title}${payload.note ? ` (${payload.note})` : ''}`
                : `Withdrawal from ${goal.title}${payload.note ? ` (${payload.note})` : ''}`;

              db.prepare(`
                INSERT INTO transactions (
                  id, user_id, amount_paise, type, category_id, category_name,
                  classification, description, date, version, created_at, updated_at
                ) VALUES (?, ?, ?, 'transfer_savings', 'cat_save_goal', 'Savings Goal Deposit', 'savings', ?, ?, 1, ?, ?)
              `).run(txId, userId, movementDelta, txDesc, today, now, now);

              processed.push({ operationId, recordId, status: 'created' });
            } else {
              errors.push({ operationId, recordId, error: 'Goal not found' });
            }
          }
        }
      }

      db.exec('COMMIT;');
      return res.json({
        success: true,
        processed,
        conflicts,
        errors,
        serverTimestamp: now
      });
    } catch (err) {
      db.exec('ROLLBACK;');
      throw err;
    }
  } catch (err) {
    console.error('Sync push error:', err);
    return res.status(500).json({ error: 'Failed to process sync push.' });
  }
});

