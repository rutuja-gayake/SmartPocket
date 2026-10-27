import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp } from '../testHelper.js';

test('Integration - Budgets, 50/30/20, and Savings Goals Ledger', async (t) => {
  const env = await createTestApp();

  const regRes = await env.request('/api/auth/register', {
    method: 'POST',
    body: { email: 'budget_user@test.edu', password: 'Password123!', fullName: 'Kavita Rao' }
  });
  const cookie = regRes.headers.get('set-cookie').split(';')[0];

  await t.test('1. Record income and set monthly budget', async () => {
    // Record ₹10,000 allowance
    await env.request('/api/transactions', {
      method: 'POST',
      headers: { Cookie: cookie },
      body: {
        amount: 10000,
        type: 'income',
        category_name: 'Allowance',
        classification: 'income',
        date: '2026-10-01'
      }
    });

    // Set ₹8,000 budget for 2026-10 with 50/30/20 split
    const budgetRes = await env.request('/api/budgets/2026-10', {
      method: 'PUT',
      headers: { Cookie: cookie },
      body: {
        total_budget: 8000,
        needs_target_pct: 50,
        wants_target_pct: 30,
        savings_target_pct: 20
      }
    });
    assert.equal(budgetRes.status, 200);

    // Fetch budget analysis
    const getRes = await env.request('/api/budgets?period=2026-10', {
      headers: { Cookie: cookie }
    });
    assert.equal(getRes.status, 200);
    const data = await getRes.json();
    assert.equal(data.budget.total_budget_paise, 800000);
    assert.equal(data.safeDaily.status, 'HEALTHY');
    assert.ok(data.safeDaily.safeDailyPaise > 0);
  });

  let goalId = '';

  await t.test('2. Create savings goal and record deposit movement', async () => {
    const createRes = await env.request('/api/goals', {
      method: 'POST',
      headers: { Cookie: cookie },
      body: {
        title: 'Semester Textbooks',
        target_amount: 3000,
        target_date: '2026-11-15'
      }
    });
    assert.equal(createRes.status, 201);
    const createData = await createRes.json();
    goalId = createData.goal.id;
    assert.equal(createData.goal.current_saved_paise, 0);

    // Deposit ₹1,500 into goal
    const depRes = await env.request(`/api/goals/${goalId}/movements`, {
      method: 'POST',
      headers: { Cookie: cookie },
      body: {
        amount: 1500,
        type: 'deposit',
        note: 'Saved from weekly pocket money'
      }
    });
    assert.equal(depRes.status, 201);
    const depData = await depRes.json();
    assert.equal(depData.goal.current_saved_paise, 150000); // ₹1,500
    assert.equal(depData.goal.analysis.progressPct, 50); // 50%
  });

  await t.test('3. Verify spendable balance consistency after savings deposit', async () => {
    // Total income: ₹10,000, Savings deposit: ₹1,500 -> Available balance must be ₹8,500 (850,000 paise)
    const budgetRes = await env.request('/api/budgets?period=2026-10', {
      headers: { Cookie: cookie }
    });
    const data = await budgetRes.json();
    assert.equal(data.availableBalancePaise, 850000);
  });

  await env.close();
});

