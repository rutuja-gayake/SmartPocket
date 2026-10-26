/**
 * SmartPocket Financial Calculation Engine
 *
 * Implements deterministic financial calculations in integer paise.
 * All functions are pure, deterministic, and unit-tested.
 */

import { getRemainingDaysInMonth } from '../utils/date.js';

/**
 * Calculates current available spendable balance.
 *
 * Formula:
 * Available Balance = total income - total expenses - net savings transfers
 *
 * @param {Object} params
 * @param {number} params.totalIncomePaise
 * @param {number} params.totalExpensePaise
 * @param {number} [params.netSavingsTransfersPaise=0]
 * @param {number} [params.openingBalancePaise=0]
 * @returns {number}
 */
export function calculateAvailableBalance({
  totalIncomePaise = 0,
  totalExpensePaise = 0,
  netSavingsTransfersPaise = 0,
  openingBalancePaise = 0
}) {
  return openingBalancePaise + totalIncomePaise - totalExpensePaise - netSavingsTransfersPaise;
}

/**
 * Calculates remaining monthly spending budget.
 *
 * @param {number} monthlyBudgetPaise
 * @param {number} currentMonthExpensePaise
 * @returns {number} Can be negative if budget is exceeded.
 */
export function calculateRemainingBudget(monthlyBudgetPaise, currentMonthExpensePaise) {
  if (monthlyBudgetPaise <= 0) return 0;
  return monthlyBudgetPaise - currentMonthExpensePaise;
}

/**
 * Calculates safe daily spending allowance and budget health status.
 *
 * @param {Object} params
 * @param {number} params.availableBalancePaise Current spendable cash
 * @param {number} params.monthlyBudgetPaise Set budget (0 if none)
 * @param {number} params.currentMonthExpensePaise Total expense this month
 * @param {Date|string} [params.currentDate] Date context
 * @returns {{
 *   safeDailyPaise: number,
 *   remainingDays: number,
 *   remainingBudgetPaise: number,
 *   status: 'NEW_USER'|'NO_BUDGET'|'NO_FUNDS'|'BUDGET_EXCEEDED'|'NEAR_LIMIT'|'HEALTHY',
 *   message: string
 * }}
 */
export function calculateSafeDailySpending({
  availableBalancePaise = 0,
  monthlyBudgetPaise = 0,
  currentMonthExpensePaise = 0,
  currentDate = new Date(),
  totalTransactionCount = 0
}) {
  const remainingDays = getRemainingDaysInMonth(currentDate);

  if (totalTransactionCount === 0 && availableBalancePaise === 0) {
    return {
      safeDailyPaise: 0,
      remainingDays,
      remainingBudgetPaise: 0,
      status: 'NEW_USER',
      message: 'Add your starting pocket money or allowance to calculate your daily spending allowance.'
    };
  }

  if (availableBalancePaise <= 0) {
    return {
      safeDailyPaise: 0,
      remainingDays,
      remainingBudgetPaise: monthlyBudgetPaise > 0 ? monthlyBudgetPaise - currentMonthExpensePaise : 0,
      status: 'NO_FUNDS',
      message: 'Your spendable balance is zero or negative. Pause non-essential spending until next allowance.'
    };
  }

  // If no monthly budget is set, safe daily spending is based on current spendable balance
  if (monthlyBudgetPaise <= 0) {
    const safeDailyPaise = Math.max(0, Math.floor(availableBalancePaise / remainingDays));
    return {
      safeDailyPaise,
      remainingDays,
      remainingBudgetPaise: 0,
      status: 'NO_BUDGET',
      message: `No monthly budget set. Pacing your balance evenly gives ₹${(safeDailyPaise / 100).toFixed(0)}/day for the remaining ${remainingDays} days.`
    };
  }

  const remainingBudgetPaise = monthlyBudgetPaise - currentMonthExpensePaise;

  if (remainingBudgetPaise <= 0) {
    return {
      safeDailyPaise: 0,
      remainingDays,
      remainingBudgetPaise,
      status: 'BUDGET_EXCEEDED',
      message: `Monthly budget exceeded by ₹${Math.abs(remainingBudgetPaise / 100).toFixed(0)}. Keep daily spending strictly to essential needs.`
    };
  }

  // The spendable pool is constrained by both actual cash balance and remaining budget
  const spendablePool = Math.min(availableBalancePaise, remainingBudgetPaise);
  const safeDailyPaise = Math.max(0, Math.floor(spendablePool / remainingDays));

  // Determine if near limit (> 85% of budget spent or daily allowance is very tight)
  const spentRatio = currentMonthExpensePaise / monthlyBudgetPaise;
  if (spentRatio >= 0.85 || safeDailyPaise < (monthlyBudgetPaise / 30) * 0.25) {
    return {
      safeDailyPaise,
      remainingDays,
      remainingBudgetPaise,
      status: 'NEAR_LIMIT',
      message: `Warning: You have used ${(spentRatio * 100).toFixed(0)}% of your monthly budget. Recommended limit is ₹${(safeDailyPaise / 100).toFixed(0)}/day.`
    };
  }

  return {
    safeDailyPaise,
    remainingDays,
    remainingBudgetPaise,
    status: 'HEALTHY',
    message: `You are in good shape. Safe daily spend is ₹${(safeDailyPaise / 100).toFixed(0)} for ${remainingDays} remaining days.`
  };
}

/**
 * Calculates 50/30/20 guideline metrics and actual spending distribution.
 *
 * @param {Object} params
 * @param {number} params.incomePaise Total income in period
 * @param {number} params.needsPaise Total needs expense in period
 * @param {number} params.wantsPaise Total wants expense in period
 * @param {number} params.savingsPaise Total savings allocation in period
 * @param {Object} [params.targets] Configurable target percentages
 * @returns {Object}
 */
export function calculate503020Metrics({
  incomePaise = 0,
  needsPaise = 0,
  wantsPaise = 0,
  savingsPaise = 0,
  targets = { needsPct: 50, wantsPct: 30, savingsPct: 20 }
}) {
  const totalExpensePaise = needsPaise + wantsPaise;
  const baseForPct = incomePaise > 0 ? incomePaise : totalExpensePaise;

  const actualNeedsPct = baseForPct > 0 ? Math.round((needsPaise / baseForPct) * 100) : 0;
  const actualWantsPct = baseForPct > 0 ? Math.round((wantsPaise / baseForPct) * 100) : 0;
  const actualSavingsPct = incomePaise > 0 ? Math.round((savingsPaise / incomePaise) * 100) : 0;

  const targetNeedsPaise = incomePaise > 0 ? Math.round(incomePaise * (targets.needsPct / 100)) : 0;
  const targetWantsPaise = incomePaise > 0 ? Math.round(incomePaise * (targets.wantsPct / 100)) : 0;
  const targetSavingsPaise = incomePaise > 0 ? Math.round(incomePaise * (targets.savingsPct / 100)) : 0;

  const needsDiffPaise = targetNeedsPaise - needsPaise;
  const wantsDiffPaise = targetWantsPaise - wantsPaise;
  const savingsDiffPaise = savingsPaise - targetSavingsPaise;

  return {
    baseAmountPaise: baseForPct,
    hasIncome: incomePaise > 0,
    targets: {
      needsPct: targets.needsPct,
      wantsPct: targets.wantsPct,
      savingsPct: targets.savingsPct,
      targetNeedsPaise,
      targetWantsPaise,
      targetSavingsPaise
    },
    actual: {
      needsPaise,
      wantsPaise,
      savingsPaise,
      totalExpensePaise,
      actualNeedsPct,
      actualWantsPct,
      actualSavingsPct
    },
    deviations: {
      needsDiffPaise,
      wantsDiffPaise,
      savingsDiffPaise,
      isWantsOverTarget: incomePaise > 0 && wantsPaise > targetWantsPaise,
      isNeedsOverTarget: incomePaise > 0 && needsPaise > targetNeedsPaise
    }
  };
}

/**
 * Calculates savings goal progress and recommendations.
 *
 * @param {Object} goal
 * @param {number} goal.target_amount_paise
 * @param {number} goal.current_saved_paise
 * @param {string|null} [goal.target_date] YYYY-MM-DD
 * @param {Date|string} [currentDate]
 * @returns {Object}
 */
export function calculateGoalProgress(goal, currentDate = new Date()) {
  const target = Math.max(0, goal.target_amount_paise || 0);
  const current = Math.max(0, goal.current_saved_paise || 0);

  if (target === 0) {
    return {
      progressPct: 100,
      remainingPaise: 0,
      isCompleted: true,
      suggestedWeeklyPaise: 0,
      suggestedMonthlyPaise: 0,
      daysRemaining: 0
    };
  }

  const progressPct = Math.min(100, Math.max(0, Math.round((current / target) * 100)));
  const remainingPaise = Math.max(0, target - current);
  const isCompleted = remainingPaise === 0;

  let suggestedWeeklyPaise = null;
  let suggestedMonthlyPaise = null;
  let daysRemaining = null;

  if (goal.target_date && !isCompleted) {
    const today = typeof currentDate === 'string' ? new Date(currentDate) : currentDate;
    const targetDt = new Date(goal.target_date);
    const diffTime = targetDt.getTime() - today.getTime();
    daysRemaining = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));

    if (daysRemaining > 0) {
      const weeks = Math.max(1, Math.ceil(daysRemaining / 7));
      const months = Math.max(1, Math.ceil(daysRemaining / 30.4375));
      suggestedWeeklyPaise = Math.ceil(remainingPaise / weeks);
      suggestedMonthlyPaise = Math.ceil(remainingPaise / months);
    }
  }

  return {
    progressPct,
    remainingPaise,
    isCompleted,
    suggestedWeeklyPaise,
    suggestedMonthlyPaise,
    daysRemaining
  };
}
