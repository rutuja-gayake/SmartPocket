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
      message: 'Spendable balance is empty. Limit daily spending to essentials until next allowance.'
    };
  }

  if (monthlyBudgetPaise <= 0) {
    const safeDailyPaise = Math.max(0, Math.floor(availableBalancePaise / remainingDays));
    return {
      safeDailyPaise,
      remainingDays,
      remainingBudgetPaise: 0,
      status: 'NO_BUDGET',
      message: `No monthly budget configured. Pacing your balance gives ${formatINR(safeDailyPaise)}/day for the next ${remainingDays} days.`
    };
  }

  const remainingBudgetPaise = monthlyBudgetPaise - currentMonthExpensePaise;
  if (remainingBudgetPaise <= 0) {
    return {
      safeDailyPaise: 0,
      remainingDays,
      remainingBudgetPaise,
      status: 'BUDGET_EXCEEDED',
      message: `Monthly budget exceeded by ${formatINR(Math.abs(remainingBudgetPaise))}. Keep daily spending to essential needs only.`
    };
  }

  const spendablePool = Math.min(availableBalancePaise, remainingBudgetPaise);
  const safeDailyPaise = Math.max(0, Math.floor(spendablePool / remainingDays));

  const spentRatio = currentMonthExpensePaise / monthlyBudgetPaise;
  if (spentRatio >= 0.85) {
    return {
      safeDailyPaise,
      remainingDays,
      remainingBudgetPaise,
      status: 'NEAR_LIMIT',
      message: `Warning: You have spent ${(spentRatio * 100).toFixed(0)}% of your monthly budget. Recommended daily limit: ${formatINR(safeDailyPaise)}/day.`
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

  return { progressPct, remainingPaise, isCompleted, suggestedWeeklyPaise };
}

