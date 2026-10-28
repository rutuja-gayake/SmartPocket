/**
 * SmartPocket Financial Calculation Engine
 *
 * Implements deterministic financial calculations in integer paise.
 * All functions are pure, deterministic, and unit-tested.
 */

import { getRemainingDaysInMonth } from '../utils/date.js';
import { formatINR } from '../utils/currency.js';

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
 * Calculates Smart Budget Alerts based on monthly budget limit and actual expenses.
 *
 * Rules:
 * - Genuine expenses only (savings deposits/withdrawals excluded)
 * - 75% — Budget Caution: “You have used 75% of your monthly budget. Spend carefully.”
 * - 90% — Budget Warning: “Warning! You have used 90% of your monthly budget. Only ₹{remaining_amount} left.”
 * - 100% — Budget Exhausted: “Your monthly budget limit has been reached. Avoid unnecessary spending.”
 * - Exceeded (>100%): Shows exceeded amount separately, remaining amount is never negative.
 * - Below 75%: “You’re within your monthly budget.”
 *
 * @param {Object} params
 * @param {number} params.monthlyBudgetPaise Set budget in paise (0 if none)
 * @param {number} params.monthlyExpensePaise Total genuine expenses in paise
 * @returns {Object}
 */
export function calculateBudgetAlert({
  monthlyBudgetPaise = 0,
  monthlyExpensePaise = 0
} = {}) {
  if (!monthlyBudgetPaise || monthlyBudgetPaise <= 0) {
    return {
      hasBudget: false,
      threshold: null,
      thresholdPct: 0,
      usagePct: 0,
      usagePctExact: 0,
      monthlyBudgetPaise: 0,
      monthlyExpensePaise: Math.max(0, monthlyExpensePaise),
      remainingBudgetPaise: 0,
      exceededPaise: 0,
      isExceeded: false,
      status: 'NO_BUDGET',
      title: 'No Budget Set',
      message: 'No monthly budget limit set for this month.'
    };
  }

  const cleanExpenses = Math.max(0, monthlyExpensePaise);
  const rawRemainingPaise = monthlyBudgetPaise - cleanExpenses;
  const remainingBudgetPaise = Math.max(0, rawRemainingPaise);
  const exceededPaise = rawRemainingPaise < 0 ? Math.abs(rawRemainingPaise) : 0;
  const isExceeded = rawRemainingPaise < 0;

  const usagePctExact = (cleanExpenses / monthlyBudgetPaise) * 100;
  const usagePct = Math.round(usagePctExact);

  let status = 'NORMAL';
  let threshold = null;
  let thresholdPct = 0;
  let title = 'Within Budget';
  let message = 'You’re within your monthly budget.';

  if (isExceeded) {
    status = 'EXCEEDED';
    threshold = 'EXCEEDED';
    thresholdPct = 100;
    title = 'Budget Exceeded';
    const formattedExceeded = formatINR(exceededPaise, exceededPaise % 100 !== 0);
    message = `Your monthly budget limit has been reached. Avoid unnecessary spending. (Exceeded by ${formattedExceeded})`;
  } else if (usagePctExact >= 100) {
    status = 'EXHAUSTED';
    threshold = '100';
    thresholdPct = 100;
    title = 'Budget Exhausted';
    message = 'Your monthly budget limit has been reached. Avoid unnecessary spending.';
  } else if (usagePctExact >= 90) {
    status = 'WARNING';
    threshold = '90';
    thresholdPct = 90;
    title = 'Budget Warning';
    const formattedRemaining = formatINR(remainingBudgetPaise, remainingBudgetPaise % 100 !== 0);
    message = `Warning! You have used 90% of your monthly budget. Only ${formattedRemaining} left.`;
  } else if (usagePctExact >= 75) {
    status = 'CAUTION';
    threshold = '75';
    thresholdPct = 75;
    title = 'Budget Caution';
    message = 'You have used 75% of your monthly budget. Spend carefully.';
  }

  return {
    hasBudget: true,
    status,
    threshold,
    thresholdPct,
    usagePct,
    usagePctExact,
    monthlyBudgetPaise,
    monthlyExpensePaise: cleanExpenses,
    remainingBudgetPaise,
    exceededPaise,
    isExceeded,
    title,
    message
  };
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
 * @param {number} [params.incomePaise=0] Total income in period
 * @param {number} [params.monthlyAllowancePaise=0] Applicable monthly allowance
 * @param {number} [params.allocationBasisPaise=0] Explicit allocation basis
 * @param {number} [params.needsPaise=0] Total needs expense in period
 * @param {number} [params.wantsPaise=0] Total wants expense in period
 * @param {number} [params.savingsPaise=0] Total savings allocation in period
 * @param {Array} [params.transactions=null] Array of transaction records
 * @param {Object} [params.targets] Configurable target percentages
 * @param {Object} [params.budgetRule] Budget record containing target percentages
 * @returns {Object}
 */
export function calculate503020Metrics({
  incomePaise = 0,
  monthlyAllowancePaise = 0,
  allocationBasisPaise = 0,
  needsPaise = 0,
  wantsPaise = 0,
  savingsPaise = 0,
  transactions = null,
  targets = { needsPct: 50, wantsPct: 30, savingsPct: 20 },
  budgetRule = null
} = {}) {
  let calcNeeds = Math.max(0, needsPaise || 0);
  let calcWants = Math.max(0, wantsPaise || 0);
  let calcSavings = savingsPaise || 0;
  let calcIncome = Math.max(0, incomePaise || 0);

  if (Array.isArray(transactions) && transactions.length > 0) {
    let tNeeds = 0;
    let tWants = 0;
    let tSavings = 0;
    let tIncome = 0;
    for (const t of transactions) {
      const amt = Number(t.amount_paise ?? (t.amount ? Math.round(Number(t.amount) * 100) : 0));
      const type = t.type;
      const cls = t.classification || (type === 'transfer_savings' ? 'savings' : type === 'income' ? 'income' : 'need');

      if (type === 'income') {
        tIncome += amt;
      } else if (type === 'transfer_savings') {
        tSavings += amt;
      } else if (type === 'expense') {
        if (cls === 'want') {
          tWants += amt;
        } else if (cls === 'savings') {
          tSavings += amt;
        } else {
          tNeeds += amt;
        }
      }
    }

    if (needsPaise === 0 && tNeeds > 0) calcNeeds = tNeeds;
    if (wantsPaise === 0 && tWants > 0) calcWants = tWants;
    if (savingsPaise === 0 && tSavings !== 0) calcSavings = tSavings;
    if (incomePaise === 0 && tIncome > 0) calcIncome = tIncome;
  }

  const effectiveTargets = {
    needsPct: budgetRule?.needs_target_pct ?? targets?.needsPct ?? 50,
    wantsPct: budgetRule?.wants_target_pct ?? targets?.wantsPct ?? 30,
    savingsPct: budgetRule?.savings_target_pct ?? targets?.savingsPct ?? 20
  };

  const totalExpensePaise = calcNeeds + calcWants;

  // Primary allocation basis: monthly allowance, then explicit basis, then income, then budget, then total expenses
  const basisPaise = Math.max(
    0,
    monthlyAllowancePaise ||
    allocationBasisPaise ||
    calcIncome ||
    (budgetRule?.total_budget_paise || 0) ||
    totalExpensePaise
  );

  const targetNeedsPaise = basisPaise > 0 ? Math.round(basisPaise * (effectiveTargets.needsPct / 100)) : 0;
  const targetWantsPaise = basisPaise > 0 ? Math.round(basisPaise * (effectiveTargets.wantsPct / 100)) : 0;
  const targetSavingsPaise = basisPaise > 0 ? Math.round(basisPaise * (effectiveTargets.savingsPct / 100)) : 0;

  // Percentage of total basis (traditional 50/30/20 share)
  const actualNeedsPct = basisPaise > 0 ? Math.round((calcNeeds / basisPaise) * 100) : 0;
  const actualWantsPct = basisPaise > 0 ? Math.round((calcWants / basisPaise) * 100) : 0;
  const actualSavingsPct = basisPaise > 0 ? Math.round((Math.max(0, calcSavings) / basisPaise) * 100) : 0;

  // Percentage of each specific target used
  const targetUsedNeedsPct = targetNeedsPaise > 0 ? Math.round((calcNeeds / targetNeedsPaise) * 100) : 0;
  const targetUsedWantsPct = targetWantsPaise > 0 ? Math.round((calcWants / targetWantsPaise) * 100) : 0;
  const targetUsedSavingsPct = targetSavingsPaise > 0 ? Math.round((Math.max(0, calcSavings) / targetSavingsPaise) * 100) : 0;

  const needsProgressPct = Math.min(100, Math.max(0, targetUsedNeedsPct));
  const wantsProgressPct = Math.min(100, Math.max(0, targetUsedWantsPct));
  const savingsProgressPct = Math.min(100, Math.max(0, targetUsedSavingsPct));

  const remainingNeedsPaise = targetNeedsPaise - calcNeeds;
  const remainingWantsPaise = targetWantsPaise - calcWants;
  const remainingSavingsPaise = targetSavingsPaise - calcSavings;

  const isNeedsOverTarget = targetNeedsPaise > 0 && calcNeeds > targetNeedsPaise;
  const isWantsOverTarget = targetWantsPaise > 0 && calcWants > targetWantsPaise;
  const isSavingsAchieved = targetSavingsPaise > 0 && calcSavings >= targetSavingsPaise;

  const needsStatus = isNeedsOverTarget ? 'OVER_TARGET' : (targetUsedNeedsPct >= 85 ? 'NEAR_LIMIT' : 'HEALTHY');
  const wantsStatus = isWantsOverTarget ? 'OVER_TARGET' : (targetUsedWantsPct >= 85 ? 'NEAR_LIMIT' : 'HEALTHY');
  const savingsStatus = isSavingsAchieved ? 'ACHIEVED' : (targetUsedSavingsPct >= 50 ? 'ON_TRACK' : 'BUILDING');

  return {
    baseAmountPaise: basisPaise,
    allocationBasisPaise: basisPaise,
    hasIncome: basisPaise > 0,
    targets: {
      needsPct: effectiveTargets.needsPct,
      wantsPct: effectiveTargets.wantsPct,
      savingsPct: effectiveTargets.savingsPct,
      needsPaise: targetNeedsPaise,
      wantsPaise: targetWantsPaise,
      savingsPaise: targetSavingsPaise,
      targetNeedsPaise,
      targetWantsPaise,
      targetSavingsPaise
    },
    actual: {
      needsPaise: calcNeeds,
      wantsPaise: calcWants,
      savingsPaise: calcSavings,
      totalExpensePaise,
      actualNeedsPct,
      actualWantsPct,
      actualSavingsPct,
      targetUsedNeedsPct,
      targetUsedWantsPct,
      targetUsedSavingsPct
    },
    deviations: {
      needsDiffPaise: remainingNeedsPaise,
      wantsDiffPaise: remainingWantsPaise,
      savingsDiffPaise: calcSavings - targetSavingsPaise,
      isNeedsOverTarget,
      isWantsOverTarget,
      isSavingsAchieved
    },
    // Top-level convenient aliases for direct UI rendering
    actualNeedsPaise: calcNeeds,
    actualWantsPaise: calcWants,
    actualSavingsPaise: calcSavings,
    targetNeedsPaise,
    targetWantsPaise,
    targetSavingsPaise,
    targetUsedNeedsPct,
    targetUsedWantsPct,
    targetUsedSavingsPct,
    needsProgressPct,
    wantsProgressPct,
    savingsProgressPct,
    remainingNeedsPaise,
    remainingWantsPaise,
    remainingSavingsPaise,
    needsStatus,
    wantsStatus,
    savingsStatus
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

