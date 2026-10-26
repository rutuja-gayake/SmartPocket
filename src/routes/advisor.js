import express from 'express';
import { getDb } from '../database/db.js';
import { requireAuth } from '../middleware/auth.js';
import { processOfflineQuery, queryCloudAi } from '../services/advisor.js';
import { calculateAvailableBalance, calculateGoalProgress } from '../services/calculations.js';
import { getCurrentPeriod } from '../utils/date.js';
import { config } from '../config/index.js';

export const advisorRouter = express.Router();

/**
 * POST /api/advisor/query
 */
advisorRouter.post('/query', requireAuth, async (req, res) => {
  try {
    const { query, preferCloud = false } = req.body;

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return res.status(400).json({ error: 'Question query is required.' });
    }

    const db = getDb();
    const userId = req.user.id;
    const currentPeriod = getCurrentPeriod();

    // Fetch financial context for current user
    const lifetime = db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN type = 'income' THEN amount_paise ELSE 0 END), 0) AS total_income,
        COALESCE(SUM(CASE WHEN type = 'expense' THEN amount_paise ELSE 0 END), 0) AS total_expense,
        COALESCE(SUM(CASE WHEN type = 'transfer_savings' THEN amount_paise ELSE 0 END), 0) AS total_savings
      FROM transactions
      WHERE user_id = ?
    `).get(userId);

    const availableBalancePaise = calculateAvailableBalance({
      totalIncomePaise: lifetime.total_income,
      totalExpensePaise: lifetime.total_expense,
      netSavingsTransfersPaise: lifetime.total_savings
    });

    const periodStats = db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN type = 'income' THEN amount_paise ELSE 0 END), 0) AS income_paise,
        COALESCE(SUM(CASE WHEN type = 'expense' THEN amount_paise ELSE 0 END), 0) AS expense_paise,
        COALESCE(SUM(CASE WHEN classification = 'need' THEN amount_paise ELSE 0 END), 0) AS needs_paise,
        COALESCE(SUM(CASE WHEN classification = 'want' THEN amount_paise ELSE 0 END), 0) AS wants_paise
      FROM transactions
      WHERE user_id = ? AND strftime('%Y-%m', date) = ?
    `).get(userId, currentPeriod);

    const budget = db.prepare(`
      SELECT total_budget_paise FROM budgets
      WHERE user_id = ? AND period = ?
    `).get(userId, currentPeriod);

    const categoryBreakdown = db.prepare(`
      SELECT category_name, classification,
             SUM(amount_paise) AS total_paise,
             COUNT(*) AS count
      FROM transactions
      WHERE user_id = ? AND type = 'expense' AND strftime('%Y-%m', date) = ?
      GROUP BY category_name, classification
      ORDER BY total_paise DESC
    `).all(userId, currentPeriod);

    const rawGoals = db.prepare('SELECT * FROM savings_goals WHERE user_id = ?').all(userId);
    const goals = rawGoals.map(g => ({
      ...g,
      analysis: calculateGoalProgress(g, new Date())
    }));

    const financialContext = {
      availableBalancePaise,
      monthlyBudgetPaise: budget ? budget.total_budget_paise : 0,
      currentMonthExpensePaise: periodStats.expense_paise,
      incomePaise: periodStats.income_paise,
      needsPaise: periodStats.needs_paise,
      wantsPaise: periodStats.wants_paise,
      categoryBreakdown,
      goals
    };

    // If cloud AI preferred and configured, attempt cloud with automatic graceful fallback to offline!
    if (preferCloud && config.ai.provider !== 'none' && config.ai.apiKey) {
      try {
        const cloudAnswer = await queryCloudAi(query.trim(), {
          ...financialContext,
          remainingDays: 10,
          safeDailyPaise: 50000,
          remainingBudgetPaise: budget ? budget.total_budget_paise - periodStats.expense_paise : 0
        });

        return res.json({
          answer: cloudAnswer,
          mode: 'cloud',
          provider: config.ai.provider,
          intent: 'cloud_ai'
        });
      } catch (cloudErr) {
        console.warn('Cloud AI failed, falling back to offline advisor:', cloudErr.message);
        // Fall through to offline advisor
      }
    }

    // Process through deterministic offline rule engine
    const offlineResult = processOfflineQuery(query.trim(), financialContext);
    return res.json({
      answer: offlineResult.answer,
      mode: 'offline',
      intent: offlineResult.intent,
      cloudAvailable: config.ai.provider !== 'none' && Boolean(config.ai.apiKey)
    });
  } catch (err) {
    console.error('Advisor query error:', err);
    return res.status(500).json({ error: 'Failed to process financial advisor query.' });
  }
});

