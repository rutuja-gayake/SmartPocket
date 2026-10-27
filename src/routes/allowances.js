import express from 'express';
import crypto from 'node:crypto';
import { getDb } from '../database/db.js';
import { requireAuth } from '../middleware/auth.js';
import { rupeesToPaise } from '../utils/currency.js';
import { getCurrentPeriod } from '../utils/date.js';
import { validatePeriod } from '../validators/index.js';
import {
  calculateAvailableBalance,
  calculateAvailableToSpend,
  calculateSafeDailySpending
} from '../services/calculations.js';

export const allowancesRouter = express.Router();

/**
 * Helper to build comprehensive accounting metrics for an allowance period
 */
export function getAllowanceDetails(db, userId, period) {
  // 1. Fetch configured allowance for this period
  const allowance = db.prepare(`
    SELECT id, user_id, period, amount_paise, notes, version, created_at, updated_at
    FROM allowances
    WHERE user_id = ? AND period = ?
  `).get(userId, period);

  // 2. Fetch configured overall budget for this period
  const budget = db.prepare(`
    SELECT id, user_id, period, total_budget_paise, needs_target_pct,
           wants_target_pct, savings_target_pct
    FROM budgets
    WHERE user_id = ? AND period = ?
  `).get(userId, period);

  // 3. Fetch period transaction sums (Only type = 'expense' counts as spending; savings transfers tracked separately)
  const periodStats = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN type = 'income' THEN amount_paise ELSE 0 END), 0) AS income_paise,
      COALESCE(SUM(CASE WHEN type = 'expense' THEN amount_paise ELSE 0 END), 0) AS expense_paise,
      COALESCE(SUM(CASE WHEN type = 'transfer_savings' AND amount_paise > 0 THEN amount_paise ELSE 0 END), 0) AS savings_deposits_paise,
      COALESCE(SUM(CASE WHEN type = 'transfer_savings' AND amount_paise < 0 THEN ABS(amount_paise) ELSE 0 END), 0) AS savings_withdrawals_paise,
      COALESCE(SUM(CASE WHEN type = 'transfer_savings' THEN amount_paise ELSE 0 END), 0) AS net_savings_allocated_paise,
      COUNT(*) AS tx_count
    FROM transactions
    WHERE user_id = ? AND strftime('%Y-%m', date) = ?
  `).get(userId, period);

  // 4. Fetch lifetime stats for physical/bank Available Pocket Cash
  const lifetimeStats = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN type = 'income' THEN amount_paise ELSE 0 END), 0) AS total_income,
      COALESCE(SUM(CASE WHEN type = 'expense' THEN amount_paise ELSE 0 END), 0) AS total_expense,
      COALESCE(SUM(CASE WHEN type = 'transfer_savings' THEN amount_paise ELSE 0 END), 0) AS total_savings
    FROM transactions
    WHERE user_id = ?
  `).get(userId);

  const availablePocketCashPaise = calculateAvailableBalance({
    totalIncomePaise: lifetimeStats.total_income,
    totalExpensePaise: lifetimeStats.total_expense,
    netSavingsTransfersPaise: lifetimeStats.total_savings
  });

  // 5. Total savings across goals
  const goalsTotal = db.prepare(`
    SELECT COALESCE(SUM(current_saved_paise), 0) AS total_saved_paise
    FROM savings_goals
    WHERE user_id = ?
  `).get(userId);

  const monthlyAllowancePaise = allowance ? allowance.amount_paise : 0;
  const monthlySpentPaise = periodStats.expense_paise;
  const savingsDepositsPaise = periodStats.savings_deposits_paise;
  const savingsWithdrawalsPaise = periodStats.savings_withdrawals_paise;
  const netSavingsAllocatedPaise = periodStats.net_savings_allocated_paise;

  const spendAnalysis = calculateAvailableToSpend({
    monthlyAllowancePaise,
    monthlySpentPaise,
    netSavingsAllocatedPaise
  });

  const monthlyBudgetPaise = budget ? budget.total_budget_paise : 0;
  const remainingBudgetPaise = monthlyBudgetPaise > 0 ? (monthlyBudgetPaise - monthlySpentPaise) : 0;

  // Determine appropriate date context for safe daily spending
  const today = new Date();
  const currentSysPeriod = getCurrentPeriod(today);
  let dateForPeriod = today;
  if (period !== currentSysPeriod) {
    const [y, m] = period.split('-').map(Number);
    dateForPeriod = new Date(y, m - 1, 1);
  }

  const safeDaily = calculateSafeDailySpending({
    availableBalancePaise: availablePocketCashPaise,
    availableToSpendPaise: spendAnalysis.availableToSpendPaise,
    monthlyAllowancePaise,
    monthlyBudgetPaise,
    currentMonthExpensePaise: monthlySpentPaise,
    currentDate: dateForPeriod,
    totalTransactionCount: periodStats.tx_count
  });

  // Category breakdown for this period
  const categorySpending = db.prepare(`
    SELECT category_name, classification,
           SUM(amount_paise) AS total_paise,
           COUNT(*) AS count
    FROM transactions
    WHERE user_id = ? AND type = 'expense' AND strftime('%Y-%m', date) = ?
    GROUP BY category_name, classification
    ORDER BY total_paise DESC
  `).all(userId, period);

  return {
    period,
    allowance: allowance || null,
    hasAllowance: !!allowance,
    monthlyAllowancePaise,
    monthlySpentPaise,
    savingsDepositsPaise,
    savingsWithdrawalsPaise,
    netSavingsAllocatedPaise,
    availableToSpendPaise: spendAnalysis.availableToSpendPaise,
    rawRemainingAllowancePaise: spendAnalysis.rawRemainingPaise,
    isOverspent: spendAnalysis.isOverspent,
    consumptionPct: spendAnalysis.consumptionPct,
    availablePocketCashPaise,
    totalSavingsBalancePaise: goalsTotal.total_saved_paise,
    monthlyBudgetPaise,
    remainingBudgetPaise,
    budget: budget || null,
    safeDaily,
    categorySpending
  };
}

/**
 * GET /api/allowances
 * Query: ?period=YYYY-MM
 */
allowancesRouter.get('/', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const userId = req.user.id;
    const period = req.query.period || getCurrentPeriod();

    if (!validatePeriod(period)) {
      return res.status(400).json({ error: 'Period must be in YYYY-MM format.' });
    }

    const details = getAllowanceDetails(db, userId, period);
    return res.json(details);
  } catch (err) {
    console.error('Fetch allowance error:', err);
    return res.status(500).json({ error: 'Failed to retrieve monthly allowance details.' });
  }
});

/**
 * GET /api/allowances/history
 * Returns historical allowance records across all periods
 */
allowancesRouter.get('/history', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const allowances = db.prepare(`
      SELECT id, period, amount_paise, notes, updated_at
      FROM allowances
      WHERE user_id = ?
      ORDER BY period DESC
    `).all(req.user.id);

    return res.json({ allowances });
  } catch (err) {
    console.error('Fetch allowance history error:', err);
    return res.status(500).json({ error: 'Failed to retrieve allowance history.' });
  }
});

/**
 * PUT /api/allowances/:period
 * Sets or updates monthly allowance for a specific month
 */
allowancesRouter.put('/:period', requireAuth, (req, res) => {
  try {
    const period = req.params.period;
    if (!validatePeriod(period)) {
      return res.status(400).json({ error: 'Period must be in YYYY-MM format.' });
    }

    const { amount, notes = '' } = req.body;

    if (amount === undefined || amount === null || isNaN(Number(amount)) || Number(amount) < 0) {
      return res.status(400).json({ error: 'Monthly allowance must be a positive number.' });
    }

    const amountPaise = rupeesToPaise(amount);
    const db = getDb();
    const now = new Date().toISOString();

    const existing = db.prepare('SELECT id FROM allowances WHERE user_id = ? AND period = ?').get(req.user.id, period);

    if (existing) {
      db.prepare(`
        UPDATE allowances
        SET amount_paise = ?, notes = ?, version = version + 1, updated_at = ?
        WHERE id = ? AND user_id = ?
      `).run(amountPaise, typeof notes === 'string' ? notes.trim() : '', now, existing.id, req.user.id);
    } else {
      const allowanceId = crypto.randomUUID();
      db.prepare(`
        INSERT INTO allowances (id, user_id, period, amount_paise, notes, version, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 1, ?, ?)
      `).run(allowanceId, req.user.id, period, amountPaise, typeof notes === 'string' ? notes.trim() : '', now, now);
    }

    const details = getAllowanceDetails(db, req.user.id, period);

    return res.json({
      message: 'Monthly allowance saved successfully',
      details
    });
  } catch (err) {
    console.error('Save allowance error:', err);
    return res.status(500).json({ error: 'Failed to save monthly allowance.' });
  }
});

