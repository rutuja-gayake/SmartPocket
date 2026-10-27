/**
 * SmartPocket Client-Side Financial Calculations
 * Exact client mirror of server calculation engine for offline reactivity.
 */

export function rupeesToPaise(rupees) {
  if (rupees === null || rupees === undefined || rupees === '') return 0;
  const num = typeof rupees === 'string' ? parseFloat(rupees.replace(/,/g, '').trim()) : Number(rupees);
  if (Number.isNaN(num)) return 0;
  return Math.round(num * 100);
}

export function paiseToRupees(paise) {
  if (paise === null || paise === undefined) return 0;
  const p = typeof paise === 'string' ? parseInt(paise, 10) : Number(paise);
  if (Number.isNaN(p)) return 0;
  return p / 100;
}

export function formatINR(paise, includeDecimals = true) {
  const rupees = paiseToRupees(paise);
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: includeDecimals ? 2 : 0,
    maximumFractionDigits: includeDecimals ? 2 : 0
  }).format(rupees);
}

export function formatRupeesPlain(paise) {
  return paiseToRupees(paise).toFixed(2);
}

export function getTodayDateString(dateObj = new Date()) {
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getCurrentPeriod(dateObj = new Date()) {
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

export function getDaysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

export function getRemainingDaysInMonth(currentDate = new Date()) {
  const d = typeof currentDate === 'string' ? new Date(currentDate) : currentDate;
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const totalDays = getDaysInMonth(year, month);
  const remaining = totalDays - day + 1;
  return Math.max(1, remaining);
}

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

export function calculateRemainingBudget(monthlyBudgetPaise, currentMonthExpensePaise) {
  if (monthlyBudgetPaise <= 0) return 0;
  return monthlyBudgetPaise - currentMonthExpensePaise;
}

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

  if (availableBalancePaise > 0) {
    candidateLimits.push(availableBalancePaise);
  }

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

  let remainingBudgetPaise = 0;
  if (monthlyBudgetPaise > 0) {
    remainingBudgetPaise = monthlyBudgetPaise - currentMonthExpensePaise;
    if (remainingBudgetPaise <= 0) {
      return {
        safeDailyPaise: 0,
        remainingDays,
        remainingBudgetPaise,
        status: 'BUDGET_EXCEEDED',
        message: `Monthly budget exceeded by ${formatINR(Math.abs(remainingBudgetPaise))}. Keep daily spending to essential needs only.`
      };
    }
    candidateLimits.push(remainingBudgetPaise);
  }

  if (availableBalancePaise <= 0 && monthlyAllowancePaise === 0) {
    return {
      safeDailyPaise: 0,
      remainingDays,
      remainingBudgetPaise,
      status: 'NO_FUNDS',
      message: 'Spendable balance is empty. Limit daily spending to essentials until next allowance.'
    };
  }

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

  if (monthlyBudgetPaise <= 0 && monthlyAllowancePaise <= 0) {
    return {
      safeDailyPaise,
      remainingDays,
      remainingBudgetPaise: 0,
      status: 'NO_BUDGET',
      message: `No budget or allowance configured. Pacing your balance gives ${formatINR(safeDailyPaise)}/day for the next ${remainingDays} days.`
    };
  }

  const referenceCap = monthlyBudgetPaise > 0 ? monthlyBudgetPaise : monthlyAllowancePaise;
  const spentRatio = referenceCap > 0 ? (currentMonthExpensePaise / referenceCap) : 0;
  if (spentRatio >= 0.85 || (referenceCap > 0 && safeDailyPaise < (referenceCap / 30) * 0.25)) {
    return {
      safeDailyPaise,
      remainingDays,
      remainingBudgetPaise,
      status: 'NEAR_LIMIT',
      message: `Caution: You have used ${(spentRatio * 100).toFixed(0)}% of your monthly funds. Recommended daily limit: ${formatINR(safeDailyPaise)}/day.`
    };
  }

  return {
    safeDailyPaise,
    remainingDays,
    remainingBudgetPaise,
    status: 'HEALTHY',
    message: `You are in good shape. Safe daily spend is ${formatINR(safeDailyPaise)} for the next ${remainingDays} days.`
  };
}

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

  return {
    baseAmountPaise: baseForPct,
    hasIncome: incomePaise > 0,
    targets,
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
      needsDiffPaise: targetNeedsPaise - needsPaise,
      wantsDiffPaise: targetWantsPaise - wantsPaise,
      isWantsOverTarget: incomePaise > 0 && wantsPaise > targetWantsPaise
    }
  };
}

export function calculateGoalProgress(goal, currentDate = new Date()) {
  const target = Math.max(0, goal.target_amount_paise || 0);
  const current = Math.max(0, goal.current_saved_paise || 0);

  if (target === 0) {
    return { progressPct: 100, remainingPaise: 0, isCompleted: true, suggestedWeeklyPaise: 0 };
  }

  const progressPct = Math.min(100, Math.max(0, Math.round((current / target) * 100)));
  const remainingPaise = Math.max(0, target - current);
  const isCompleted = remainingPaise === 0;

  let suggestedWeeklyPaise = null;
  if (goal.target_date && !isCompleted) {
    const today = typeof currentDate === 'string' ? new Date(currentDate) : currentDate;
    const targetDt = new Date(goal.target_date);
    const diffDays = Math.max(0, Math.ceil((targetDt.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));
    if (diffDays > 0) {
      const weeks = Math.max(1, Math.ceil(diffDays / 7));
      suggestedWeeklyPaise = Math.ceil(remainingPaise / weeks);
    }
  }

  const milestones = {
    m25: progressPct >= 25,
    m50: progressPct >= 50,
    m75: progressPct >= 75,
    m100: progressPct >= 100
  };

  return { progressPct, remainingPaise, isCompleted, milestones, suggestedWeeklyPaise };
}

