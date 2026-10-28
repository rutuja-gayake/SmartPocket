import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateBudgetAlert, calculateRemainingBudget } from '../../src/services/calculations.js';

test('Unit Tests - Smart Budget Alerts Calculation Engine', async (t) => {
  const budgetPaise = 500000; // ₹5,000.00

  await t.test('1. Below 75% threshold (₹3,000 spent): status NORMAL, no threshold alert', () => {
    const res = calculateBudgetAlert({
      monthlyBudgetPaise: budgetPaise,
      monthlyExpensePaise: 300000 // ₹3,000
    });

    assert.equal(res.hasBudget, true);
    assert.equal(res.status, 'NORMAL');
    assert.equal(res.threshold, null);
    assert.equal(res.usagePct, 60);
    assert.equal(res.remainingBudgetPaise, 200000); // ₹2,000
    assert.equal(res.exceededPaise, 0);
    assert.equal(res.isExceeded, false);
    assert.equal(res.message, 'You’re within your monthly budget.');
  });

  await t.test('2. Exactly 75% threshold (₹3,750 spent): status CAUTION alert', () => {
    const res = calculateBudgetAlert({
      monthlyBudgetPaise: budgetPaise,
      monthlyExpensePaise: 375000 // ₹3,750
    });

    assert.equal(res.hasBudget, true);
    assert.equal(res.status, 'CAUTION');
    assert.equal(res.threshold, '75');
    assert.equal(res.thresholdPct, 75);
    assert.equal(res.usagePct, 75);
    assert.equal(res.remainingBudgetPaise, 125000); // ₹1,250
    assert.equal(res.message, 'You have used 75% of your monthly budget. Spend carefully.');
  });

  await t.test('3. Exactly 90% threshold (₹4,500 spent): status WARNING alert with ₹500 remaining', () => {
    const res = calculateBudgetAlert({
      monthlyBudgetPaise: budgetPaise,
      monthlyExpensePaise: 450000 // ₹4,500
    });

    assert.equal(res.hasBudget, true);
    assert.equal(res.status, 'WARNING');
    assert.equal(res.threshold, '90');
    assert.equal(res.thresholdPct, 90);
    assert.equal(res.usagePct, 90);
    assert.equal(res.remainingBudgetPaise, 50000); // ₹500
    assert.equal(res.message, 'Warning! You have used 90% of your monthly budget. Only ₹500 left.');
  });

  await t.test('4. Exactly 100% threshold (₹5,000 spent): status EXHAUSTED alert with ₹0 remaining', () => {
    const res = calculateBudgetAlert({
      monthlyBudgetPaise: budgetPaise,
      monthlyExpensePaise: 500000 // ₹5,000
    });

    assert.equal(res.hasBudget, true);
    assert.equal(res.status, 'EXHAUSTED');
    assert.equal(res.threshold, '100');
    assert.equal(res.thresholdPct, 100);
    assert.equal(res.usagePct, 100);
    assert.equal(res.remainingBudgetPaise, 0);
    assert.equal(res.exceededPaise, 0);
    assert.equal(res.isExceeded, false);
    assert.equal(res.message, 'Your monthly budget limit has been reached. Avoid unnecessary spending.');
  });

  await t.test('5. Over budget (₹5,300 spent): status EXCEEDED alert showing ₹300 exceeded, remaining 0', () => {
    const res = calculateBudgetAlert({
      monthlyBudgetPaise: budgetPaise,
      monthlyExpensePaise: 530000 // ₹5,300
    });

    assert.equal(res.hasBudget, true);
    assert.equal(res.status, 'EXCEEDED');
    assert.equal(res.threshold, 'EXCEEDED');
    assert.equal(res.isExceeded, true);
    assert.equal(res.usagePct, 106);
    assert.equal(res.remainingBudgetPaise, 0); // Never negative
    assert.equal(res.exceededPaise, 30000); // Exactly ₹300
    assert.equal(res.message, 'Your monthly budget limit has been reached. Avoid unnecessary spending. (Exceeded by ₹300)');
  });

  await t.test('6. Zero or missing budget: safe fallback without division by zero', () => {
    const res = calculateBudgetAlert({
      monthlyBudgetPaise: 0,
      monthlyExpensePaise: 150000
    });

    assert.equal(res.hasBudget, false);
    assert.equal(res.status, 'NO_BUDGET');
    assert.equal(res.usagePct, 0);
    assert.equal(res.remainingBudgetPaise, 0);
    assert.equal(res.message, 'No monthly budget limit set for this month.');
  });
});

