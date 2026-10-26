import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateAvailableBalance,
  calculateRemainingBudget,
  calculateSafeDailySpending,
  calculate503020Metrics,
  calculateGoalProgress
} from '../../src/services/calculations.js';

test('Financial Calculations - Available Balance', () => {
  // Income 10,000 INR (1,000,000 paise), Expense 4,000 INR (400,000 paise), Savings 2,000 INR (200,000 paise)
  const balance = calculateAvailableBalance({
    totalIncomePaise: 1000000,
    totalExpensePaise: 400000,
    netSavingsTransfersPaise: 200000
  });
  assert.equal(balance, 400000); // 4,000 INR remaining in pocket
});

test('Financial Calculations - Remaining Budget', () => {
  assert.equal(calculateRemainingBudget(500000, 300000), 200000);
  assert.equal(calculateRemainingBudget(500000, 600000), -100000); // Exceeded
  assert.equal(calculateRemainingBudget(0, 100000), 0);
});

test('Financial Calculations - Safe Daily Spending States', () => {
  const midMonthDate = new Date(2026, 9, 21); // Oct 21 -> 11 days remaining (31 - 21 + 1)

  // 1. New user with no transactions
  const newUser = calculateSafeDailySpending({
    availableBalancePaise: 0,
    monthlyBudgetPaise: 0,
    currentMonthExpensePaise: 0,
    currentDate: midMonthDate,
    totalTransactionCount: 0
  });
  assert.equal(newUser.status, 'NEW_USER');
  assert.equal(newUser.safeDailyPaise, 0);

  // 2. Zero / negative balance
  const noFunds = calculateSafeDailySpending({
    availableBalancePaise: 0,
    monthlyBudgetPaise: 500000,
    currentMonthExpensePaise: 200000,
    currentDate: midMonthDate,
    totalTransactionCount: 5
  });
  assert.equal(noFunds.status, 'NO_FUNDS');
  assert.equal(noFunds.safeDailyPaise, 0);

  // 3. No budget configured, positive balance
  const noBudget = calculateSafeDailySpending({
    availableBalancePaise: 1100000, // 11,000 INR
    monthlyBudgetPaise: 0,
    currentMonthExpensePaise: 200000,
    currentDate: midMonthDate,
    totalTransactionCount: 2
  });
  assert.equal(noBudget.status, 'NO_BUDGET');
  assert.equal(noBudget.safeDailyPaise, 100000); // 1,000 INR / day

  // 4. Budget exceeded
  const exceeded = calculateSafeDailySpending({
    availableBalancePaise: 500000,
    monthlyBudgetPaise: 500000,
    currentMonthExpensePaise: 550000,
    currentDate: midMonthDate,
    totalTransactionCount: 10
  });
  assert.equal(exceeded.status, 'BUDGET_EXCEEDED');
  assert.equal(exceeded.safeDailyPaise, 0);

  // 5. Healthy state
  const healthy = calculateSafeDailySpending({
    availableBalancePaise: 800000, // 8,000 INR
    monthlyBudgetPaise: 1000000, // 10,000 INR
    currentMonthExpensePaise: 300000, // 3,000 INR spent -> 7,000 INR remaining budget
    currentDate: midMonthDate,
    totalTransactionCount: 4
  });
  assert.equal(healthy.status, 'HEALTHY');
  // spendablePool is min(800000, 700000) = 700000. 700000 / 11 days = 63636 paise
  assert.equal(healthy.safeDailyPaise, Math.floor(700000 / 11));
});

test('Financial Calculations - 50/30/20 Guidelines', () => {
  // Income 20,000 INR, Needs 9,000 INR (45%), Wants 8,000 INR (40% - over 30%), Savings 3,000 INR (15%)
  const metrics = calculate503020Metrics({
    incomePaise: 2000000,
    needsPaise: 900000,
    wantsPaise: 800000,
    savingsPaise: 300000
  });

  assert.equal(metrics.actual.actualNeedsPct, 45);
  assert.equal(metrics.actual.actualWantsPct, 40);
  assert.equal(metrics.actual.actualSavingsPct, 15);
  assert.equal(metrics.deviations.isWantsOverTarget, true);
  assert.equal(metrics.deviations.isNeedsOverTarget, false);
});

test('Financial Calculations - Savings Goal Progress', () => {
  // Goal: ₹10,000, Saved: ₹6,000, Target in 30 days
  const goal = {
    target_amount_paise: 1000000,
    current_saved_paise: 600000,
    target_date: '2026-11-26'
  };
  const today = new Date('2026-10-26T00:00:00Z');
  const progress = calculateGoalProgress(goal, today);

  assert.equal(progress.progressPct, 60);
  assert.equal(progress.remainingPaise, 400000); // ₹4,000
  assert.equal(progress.isCompleted, false);
  assert.ok(progress.suggestedWeeklyPaise > 0);
  assert.ok(progress.suggestedMonthlyPaise > 0);
});

