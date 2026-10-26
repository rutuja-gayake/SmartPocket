import express from 'express';
import crypto from 'node:crypto';
import { getDb } from '../database/db.js';
import { requireAuth } from '../middleware/auth.js';
import { rupeesToPaise } from '../utils/currency.js';
import { getCurrentPeriod } from '../utils/date.js';
import {
  calculateAvailableBalance,
  calculateSafeDailySpending,
  calculate503020Metrics
} from '../services/calculations.js';
import { validatePeriod } from '../validators/index.js';

export const budgetsRouter = express.Router();

/**
 * GET /api/budgets
 * Optional query: ?period=YYYY-MM
 */
budgetsRouter.get('/', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const userId = req.user.id;
    const period = req.query.period || getCurrentPeriod();

    if (!validatePeriod(period)) {
      return res.status(400).json({ error: 'Period must be in YYYY-MM format.' });
    }

    const budget = db.prepare(`
      SELECT id, user_id, period, total_budget_paise, needs_target_pct,
             wants_target_pct, savings_target_pct, version, created_at, updated_at
      FROM budgets
      WHERE user_id = ? AND period = ?
    `).get(userId, period);

    // Fetch transactions in this period to provide real-time budget performance
    const periodStats = db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN type = 'income' THEN amount_paise ELSE 0 END), 0) AS income_paise,
        COALESCE(SUM(CASE WHEN type = 'expense' THEN amount_paise ELSE 0 END), 0) AS expense_paise,
        COALESCE(SUM(CASE WHEN classification = 'need' AND type = 'expense' THEN amount_paise ELSE 0 END), 0) AS needs_paise,
        COALESCE(SUM(CASE WHEN classification = 'want' AND type = 'expense' THEN amount_paise ELSE 0 END), 0) AS wants_paise,
        COALESCE(SUM(CASE WHEN type = 'transfer_savings' THEN amount_paise ELSE 0 END), 0) AS savings_transfers_paise,
        COUNT(*) AS tx_count
      FROM transactions
      WHERE user_id = ? AND strftime('%Y-%m', date) = ?
    `).get(userId, period);

    // Lifetime balance for spendable cash calculation
    const lifetimeStats = db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN type = 'income' THEN amount_paise ELSE 0 END), 0) AS total_income,
        COALESCE(SUM(CASE WHEN type = 'expense' THEN amount_paise ELSE 0 END), 0) AS total_expense,
        COALESCE(SUM(CASE WHEN type = 'transfer_savings' THEN amount_paise ELSE 0 END), 0) AS total_savings
      FROM transactions
      WHERE user_id = ?
    `).get(userId);

    const totalAvailableFundsPaise = lifetimeStats.total_income;
    const totalExpensesPaise = lifetimeStats.total_expense;
    const netSavingsTransfersPaise = lifetimeStats.total_savings;

    const availableBalancePaise = calculateAvailableBalance({
      totalIncomePaise: totalAvailableFundsPaise,
      totalExpensePaise: totalExpensesPaise,
      netSavingsTransfersPaise
    });

    const monthlyBudgetPaise = budget ? budget.total_budget_paise : 0;
    const safeDailyInfo = calculateSafeDailySpending({
      availableBalancePaise,
      monthlyBudgetPaise,
      currentMonthExpensePaise: periodStats.expense_paise,
      currentDate: new Date(),
      totalTransactionCount: periodStats.tx_count
    });

    const targets = {
      needsPct: budget ? budget.needs_target_pct : 50,
      wantsPct: budget ? budget.wants_target_pct : 30,
      savingsPct: budget ? budget.savings_target_pct : 20
    };

    const metrics503020 = calculate503020Metrics({
      incomePaise: periodStats.income_paise,
      needsPaise: periodStats.needs_paise,
      wantsPaise: periodStats.wants_paise,
      savingsPaise: periodStats.savings_transfers_paise,
      targets
    });

    return res.json({
      period,
      budget: budget || null,
      availableBalancePaise,
      totalAvailableFundsPaise,
      totalExpensesPaise,
      netSavingsTransfersPaise,
      periodStats,
      safeDaily: safeDailyInfo,
      analysis503020: metrics503020
    });
  } catch (err) {
    console.error('Fetch budget error:', err);
    return res.status(500).json({ error: 'Failed to retrieve budget.' });
  }
});

/**
 * PUT /api/budgets/:period
 */
budgetsRouter.put('/:period', requireAuth, (req, res) => {
  try {
    const period = req.params.period;
    if (!validatePeriod(period)) {
      return res.status(400).json({ error: 'Period must be in YYYY-MM format.' });
    }

    const { total_budget, needs_target_pct = 50, wants_target_pct = 30, savings_target_pct = 20 } = req.body;

    if (total_budget === undefined || Number(total_budget) < 0) {
      return res.status(400).json({ error: 'Total budget must be a positive number.' });
    }

    const totalBudgetPaise = rupeesToPaise(total_budget);
    const db = getDb();
    const now = new Date().toISOString();

    const existing = db.prepare('SELECT id, version FROM budgets WHERE user_id = ? AND period = ?').get(req.user.id, period);

    if (existing) {
      db.prepare(`
        UPDATE budgets
        SET total_budget_paise = ?, needs_target_pct = ?, wants_target_pct = ?,
            savings_target_pct = ?, version = version + 1, updated_at = ?
        WHERE id = ? AND user_id = ?
      `).run(
        totalBudgetPaise,
        parseInt(needs_target_pct, 10),
        parseInt(wants_target_pct, 10),
        parseInt(savings_target_pct, 10),
        now,
        existing.id,
        req.user.id
      );
    } else {
      const budgetId = crypto.randomUUID();
      db.prepare(`
        INSERT INTO budgets (
          id, user_id, period, total_budget_paise, needs_target_pct,
          wants_target_pct, savings_target_pct, version, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
      `).run(
        budgetId,
        req.user.id,
        period,
        totalBudgetPaise,
        parseInt(needs_target_pct, 10),
        parseInt(wants_target_pct, 10),
        parseInt(savings_target_pct, 10),
        now,
        now
      );
    }

    const updatedBudget = db.prepare('SELECT * FROM budgets WHERE user_id = ? AND period = ?').get(req.user.id, period);

    return res.json({
      message: 'Budget saved successfully',
      budget: updatedBudget
    });
  } catch (err) {
    console.error('Update budget error:', err);
    return res.status(500).json({ error: 'Failed to update budget.' });
  }
});

