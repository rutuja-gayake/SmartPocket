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
 * Available Pocket Cash = Total Available Funds − Actual Expenses − Net Savings Transfers
 * Where:
 * Total Available Funds = opening balance + total income + adjustments
 *
 * @param {Object} params
 * @param {number} params.totalIncomePaise
 * @param {number} params.totalExpensePaise
 * @param {number} [params.netSavingsTransfersPaise=0]
 * @param {number} [params.openingBalancePaise=0]
 * @param {number} [params.adjustmentsPaise=0]
 * @returns {number}
 */
export function calculateAvailableBalance({
  totalIncomePaise = 0,
  totalExpensePaise = 0,
  netSavingsTransfersPaise = 0,
  openingBalancePaise = 0,
  adjustmentsPaise = 0
}) {
  const totalAvailableFunds = openingBalancePaise + totalIncomePaise + adjustmentsPaise;
  return totalAvailableFunds - totalExpensePaise - netSavingsTransfersPaise;
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
 * Calculates remaining Available to Spend from Monthly Allowance.
 * Formula:
 * Available to Spend = Monthly Allowance − Monthly Spent − Net Savings Allocated
 *
 * @param {Object} params
 * @param {number} params.monthlyAllowancePaise Total monthly allowance expected/allocated
 * @param {number} params.monthlySpentPaise Total actual expenses in period (excluding savings transfers)
 * @param {number} [params.netSavingsAllocatedPaise=0] Net savings transfers in period (deposits - withdrawals)
 * @returns {{
 *   availableToSpendPaise: number,
 *   rawRemainingPaise: number,
 *   isOverspent: boolean,
 *   consumptionPct: number
 * }}
 */
export function calculateAvailableToSpend({
  monthlyAllowancePaise = 0,
  monthlySpentPaise = 0,
  netSavingsAllocatedPaise = 0
}) {
  const rawRemainingPaise = monthlyAllowancePaise - monthlySpentPaise - netSavingsAllocatedPaise;
  const availableToSpendPaise = Math.max(0, rawRemainingPaise);
  const isOverspent = rawRemainingPaise < 0;

  const totalConsumed = monthlySpentPaise + Math.max(0, netSavingsAllocatedPaise);
  const consumptionPct = monthlyAllowancePaise > 0
    ? Math.min(100, Math.round((totalConsumed / monthlyAllowancePaise) * 100))
    : (totalConsumed > 0 ? 100 : 0);

  return {
    availableToSpendPaise,
    rawRemainingPaise,
    isOverspent,
    consumptionPct
  };
}

/**
 * Calculates safe daily spending allowance and budget health status.
 *
 * @param {Object} params
 * @param {number} params.availableBalancePaise Current spendable cash
 * @param {number} [params.availableToSpendPaise] Spendable allowance remaining
 * @param {number} [params.monthlyAllowancePaise=0] Configured monthly allowance
 * @param {number} [params.monthlyBudgetPaise=0] Set budget (0 if none)
 * @param {number} [params.currentMonthExpensePaise=0] Total expense this month
 * @param {Date|string} [params.currentDate] Date context
 * @param {number} [params.totalTransactionCount=0]
 * @returns {{
 *   safeDailyPaise: number,
 *   remainingDays: number,
 *   remainingBudgetPaise: number,
 *   status: 'NEW_USER'|'NO_BUDGET'|'NO_FUNDS'|'BUDGET_EXCEEDED'|'NEAR_LIMIT'|'HEALTHY'|'PERIOD_ENDED',
 *   message: string
 * }}
 */
export function calculateSafeDailySpending({
  availableBalancePaise = 0,
  availableToSpendPaise = undefined,
  monthlyAllowancePaise = 0,
  monthlyBudgetPaise = 0,
  currentMonthExpensePaise = 0,
  currentDate = new Date(),
  totalTransactionCount = 0
}) {
  const remainingDays = getRemainingDaysInMonth(currentDate);

  if (remainingDays <= 0) {
    return {
      safeDailyPaise: 0,
      remainingDays: 0,
      remainingBudgetPaise: monthlyBudgetPaise > 0 ? (monthlyBudgetPaise - currentMonthExpensePaise) : 0,
      status: 'PERIOD_ENDED',
      message: 'This monthly period has ended. Review your summary or switch to the current month.'
    };
  }

  if (totalTransactionCount === 0 && availableBalancePaise === 0 && monthlyAllowancePaise === 0) {
    return {
      safeDailyPaise: 0,
      remainingDays,
      remainingBudgetPaise: 0,
      status: 'NEW_USER',
      message: 'Set your monthly allowance or add starting pocket money to calculate your daily spending allowance.'
    };
  }

  // Determine spendable constraints
  const candidateLimits = [];

  // Actual cash constraint
  if (availableBalancePaise > 0) {
    candidateLimits.push(availableBalancePaise);
  }

  // Allowance constraint
  if (monthlyAllowancePaise > 0) {
    const allowanceLeft = availableToSpendPaise !== undefined
      ? availableToSpendPaise
      : Math.max(0, monthlyAllowancePaise - currentMonthExpensePaise);
    if (allowanceLeft <= 0) {
      return {
        safeDailyPaise: 0,
        remainingDays,
        remainingBudgetPaise: monthlyBudgetPaise > 0 ? (monthlyBudgetPaise - currentMonthExpensePaise) : 0,
        status: 'NO_FUNDS',
        message: 'Monthly allowance has been completely spent or allocated. Keep expenses to essentials.'
      };
    }
    candidateLimits.push(allowanceLeft);
  }

  // Budget constraint
  let remainingBudgetPaise = 0;
  if (monthlyBudgetPaise > 0) {
    remainingBudgetPaise = monthlyBudgetPaise - currentMonthExpensePaise;
    if (remainingBudgetPaise <= 0) {
      return {
        safeDailyPaise: 0,
        remainingDays,
        remainingBudgetPaise,
        status: 'BUDGET_EXCEEDED',
        message: `Monthly budget exceeded by ₹${Math.abs(remainingBudgetPaise / 100).toFixed(0)}. Keep daily spending strictly to essential needs.`
      };
    }
    candidateLimits.push(remainingBudgetPaise);
  }

  // If cash balance is exhausted
  if (availableBalancePaise <= 0 && monthlyAllowancePaise === 0) {
    return {
      safeDailyPaise: 0,
      remainingDays,
      remainingBudgetPaise,
      status: 'NO_FUNDS',
      message: 'Your spendable balance is zero or negative. Pause non-essential spending until next allowance.'
    };
  }

  // Strictest applicable positive limit
  const spendablePool = candidateLimits.length > 0
    ? Math.min(...candidateLimits)
    : Math.max(0, availableBalancePaise);

  if (spendablePool <= 0) {
    return {
      safeDailyPaise: 0,
      remainingDays,
      remainingBudgetPaise,
      status: 'NO_FUNDS',
      message: 'No spendable funds remaining for this period.'
    };
  }

  const safeDailyPaise = Math.max(0, Math.floor(spendablePool / remainingDays));

  // If no monthly budget was set
  if (monthlyBudgetPaise <= 0 && monthlyAllowancePaise <= 0) {
    return {
      safeDailyPaise,
      remainingDays,
      remainingBudgetPaise: 0,
      status: 'NO_BUDGET',
      message: `No budget or allowance set. Pacing your balance evenly gives ₹${(safeDailyPaise / 100).toFixed(0)}/day for the remaining ${remainingDays} days.`
    };
  }

  // Determine if near limit (> 85% spent or daily allowance is very tight)
  const referenceCap = monthlyBudgetPaise > 0 ? monthlyBudgetPaise : monthlyAllowancePaise;
  const spentRatio = referenceCap > 0 ? (currentMonthExpensePaise / referenceCap) : 0;
  if (spentRatio >= 0.85 || (referenceCap > 0 && safeDailyPaise < (referenceCap / 30) * 0.25)) {
    return {
      safeDailyPaise,
      remainingDays,
      remainingBudgetPaise,
      status: 'NEAR_LIMIT',
      message: `Caution: You have used ${(spentRatio * 100).toFixed(0)}% of your monthly funds. Recommended limit is ₹${(safeDailyPaise / 100).toFixed(0)}/day.`
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

  const milestones = {
    m25: progressPct >= 25,
    m50: progressPct >= 50,
    m75: progressPct >= 75,
    m100: progressPct >= 100
  };

  return {
    progressPct,
    remainingPaise,
    isCompleted,
    milestones,
    suggestedWeeklyPaise,
    suggestedMonthlyPaise,
    daysRemaining
  };
}

