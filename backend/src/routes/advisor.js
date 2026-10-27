import express from 'express';
import { getDb } from '../database/db.js';
import { requireAuth } from '../middleware/auth.js';
import { processOfflineQuery, queryCloudAi, generateAiRecommendations } from '../services/advisor.js';
import { calculateAvailableBalance, calculateGoalProgress, calculateSafeDailySpending } from '../services/calculations.js';
import { getCurrentPeriod, getRemainingDaysInMonth } from '../utils/date.js';
import { config } from '../config/index.js';

export const advisorRouter = express.Router();

/**
 * GET /api/advisor/predictions
 * Returns real live Groq AI predictions, alerts, and recommendations based on real account data.
 */
advisorRouter.get('/predictions', requireAuth, async (req, res) => {
  try {
    const db = getDb();
    const userId = req.user.id;
    const currentPeriod = getCurrentPeriod();

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

    const safeDailyInfo = calculateSafeDailySpending({
      availableBalancePaise,
      monthlyBudgetPaise: budget ? budget.total_budget_paise : 0,
      currentMonthExpensePaise: periodStats.expense_paise,
      currentDate: new Date()
    });

    const recommendations = await generateAiRecommendations({
      availableBalancePaise,
      monthlyBudgetPaise: budget ? budget.total_budget_paise : 0,
      currentMonthExpensePaise: periodStats.expense_paise,
      needsPaise: periodStats.needs_paise,
      wantsPaise: periodStats.wants_paise,
      categoryBreakdown,
      safeDailyPaise: safeDailyInfo.safeDailyPaise,
      remainingDays: safeDailyInfo.remainingDays
    });

    return res.json(recommendations);
  } catch (err) {
    console.error('Advisor predictions error:', err);
    return res.status(500).json({ error: 'Failed to generate financial predictions.' });
  }
});

/**
 * POST /api/advisor/query
 */
advisorRouter.post('/query', requireAuth, async (req, res) => {
  try {
    const { query, preferCloud = true } = req.body;

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

    const safeDailyInfo = calculateSafeDailySpending({
      availableBalancePaise,
      monthlyBudgetPaise: budget ? budget.total_budget_paise : 0,
      currentMonthExpensePaise: periodStats.expense_paise,
      currentDate: new Date(),
      totalTransactionCount: periodStats.income_paise > 0 || periodStats.expense_paise > 0 ? 1 : 0
    });

    const financialContext = {
      availableBalancePaise,
      monthlyBudgetPaise: budget ? budget.total_budget_paise : 0,
      currentMonthExpensePaise: periodStats.expense_paise,
      incomePaise: periodStats.income_paise,
      needsPaise: periodStats.needs_paise,
      wantsPaise: periodStats.wants_paise,
      categoryBreakdown,
      goals,
      safeDailyPaise: safeDailyInfo.safeDailyPaise,
      remainingDays: safeDailyInfo.remainingDays,
      remainingBudgetPaise: budget ? budget.total_budget_paise - periodStats.expense_paise : 0
    };

    // Use REAL Cloud AI (Groq) whenever configured, with automatic fallback if offline
    const shouldUseCloud = preferCloud !== false && config.ai.provider !== 'none' && Boolean(config.ai.apiKey);

    if (shouldUseCloud) {
      try {
        const cloudAnswer = await queryCloudAi(query.trim(), financialContext);
        return res.json({
          answer: cloudAnswer,
          mode: 'cloud',
          provider: config.ai.provider,
          intent: 'cloud_ai'
        });
      } catch (cloudErr) {
        console.warn('Real Cloud AI query failed, falling back to local advisor:', cloudErr.message);
      }
    }

    // Process through deterministic offline rule engine if cloud is disabled or offline
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

