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

/**
 * Calculates Smart Budget Alerts based on monthly budget limit and actual expenses.
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

