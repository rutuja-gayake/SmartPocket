import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp } from '../testHelper.js';

test('Integration - Monthly Budget Creation, Persistence, and Dashboard Financial Metrics', async (t) => {
  const env = await createTestApp();

  // Register User A
  const regA = await env.request('/api/auth/register', {
    method: 'POST',
    body: { email: 'student_budgeter@test.edu', password: 'Password123!', fullName: 'Ananya Roy' }
  });
  const cookieA = regA.headers.get('set-cookie').split(';')[0];

  // Register User B for isolation testing
  const regB = await env.request('/api/auth/register', {
    method: 'POST',
    body: { email: 'other_student@test.edu', password: 'Password123!', fullName: 'Karan Patel' }
  });
  const cookieB = regB.headers.get('set-cookie').split(';')[0];

  const OCT_PERIOD = '2026-10';
  const NOV_PERIOD = '2026-11';

  // SCENARIO 1: Creating a new monthly budget via API endpoint
  await t.test('Scenario 1: Creating a new monthly budget via API endpoint', async () => {
    const res = await env.request(`/api/budgets/${OCT_PERIOD}`, {
      method: 'PUT',
      headers: { Cookie: cookieA },
      body: {
        total_budget: 8000,
        needs_target_pct: 50,
        wants_target_pct: 30,
        savings_target_pct: 20
      }
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.message, 'Budget saved successfully');
    assert.ok(data.budget);
    assert.equal(data.budget.period, OCT_PERIOD);
    assert.equal(data.budget.total_budget_paise, 800000);
    assert.equal(data.budget.needs_target_pct, 50);
    assert.equal(data.budget.wants_target_pct, 30);
    assert.equal(data.budget.savings_target_pct, 20);
    assert.equal(data.budget.version, 1);
  });

  // SCENARIO 2: Updating an existing monthly budget for the same month
  await t.test('Scenario 2: Updating an existing monthly budget for the same month', async () => {
    const res = await env.request(`/api/budgets/${OCT_PERIOD}`, {
      method: 'PUT',
      headers: { Cookie: cookieA },
      body: {
        total_budget: 9500,
        needs_target_pct: 55,
        wants_target_pct: 25,
        savings_target_pct: 20
      }
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.message, 'Budget saved successfully');
    assert.equal(data.budget.total_budget_paise, 950000);
    assert.equal(data.budget.needs_target_pct, 55);
    assert.equal(data.budget.wants_target_pct, 25);
    assert.equal(data.budget.savings_target_pct, 20);
    assert.equal(data.budget.version, 2);
  });

  // SCENARIO 3: Budget persistence verification across queries
  await t.test('Scenario 3: Budget persistence verification across queries', async () => {
    // Query via query param: /api/budgets?period=2026-10
    const queryRes = await env.request(`/api/budgets?period=${OCT_PERIOD}`, {
      headers: { Cookie: cookieA }
    });
    assert.equal(queryRes.status, 200);
    const queryData = await queryRes.json();
    assert.ok(queryData.budget);
    assert.equal(queryData.budget.total_budget_paise, 950000);
    assert.equal(queryData.budget.period, OCT_PERIOD);

    // Query via route param: /api/budgets/2026-10
    const routeRes = await env.request(`/api/budgets/${OCT_PERIOD}`, {
      headers: { Cookie: cookieA }
    });
    assert.equal(routeRes.status, 200);
    const routeData = await routeRes.json();
    assert.ok(routeData.budget);
    assert.equal(routeData.budget.total_budget_paise, 950000);
  });

  // SCENARIO 4: Dashboard data retrieval returning persisted budget for specified month
  await t.test('Scenario 4: Dashboard data retrieval returns persisted budget and metrics', async () => {
    const res = await env.request(`/api/budgets?period=${OCT_PERIOD}`, {
      headers: { Cookie: cookieA }
    });
    assert.equal(res.status, 200);
    const data = await res.json();

    assert.equal(data.period, OCT_PERIOD);
    assert.equal(data.budget.total_budget_paise, 950000);
    assert.ok(data.safeDaily);
    assert.ok(data.analysis503020);
    assert.ok(typeof data.availableBalancePaise === 'number');
    assert.ok(typeof data.remainingBudgetPaise === 'number');
  });

  // SCENARIO 5: Budget remaining calculation with zero expenses
  await t.test('Scenario 5: Budget remaining calculation with zero expenses', async () => {
    const res = await env.request(`/api/budgets?period=${OCT_PERIOD}`, {
      headers: { Cookie: cookieA }
    });
    const data = await res.json();
    // 0 expenses recorded yet
    assert.equal(data.periodStats.expense_paise, 0);
    // Remaining budget = 950000 - 0 = 950000 paise (₹9,500)
    assert.equal(data.remainingBudgetPaise, 950000);
  });

  // SCENARIO 6: Budget remaining calculation with genuine expenses
  await t.test('Scenario 6: Budget remaining calculation with genuine expenses', async () => {
    // Add income: ₹15,000
    await env.request('/api/transactions', {
      method: 'POST',
      headers: { Cookie: cookieA },
      body: {
        amount: 15000,
        type: 'income',
        category_name: 'Allowance',
        classification: 'income',
        date: `${OCT_PERIOD}-02`
      }
    });

    // Add genuine expense 1: ₹3,000 (Need)
    await env.request('/api/transactions', {
      method: 'POST',
      headers: { Cookie: cookieA },
      body: {
        amount: 3000,
        type: 'expense',
        category_name: 'Textbooks',
        classification: 'need',
        date: `${OCT_PERIOD}-05`
      }
    });

    // Add genuine expense 2: ₹1,500 (Want)
    await env.request('/api/transactions', {
      method: 'POST',
      headers: { Cookie: cookieA },
      body: {
        amount: 1500,
        type: 'expense',
        category_name: 'Weekend Movie',
        classification: 'want',
        date: `${OCT_PERIOD}-10`
      }
    });

    const res = await env.request(`/api/budgets?period=${OCT_PERIOD}`, {
      headers: { Cookie: cookieA }
    });
    const data = await res.json();

    // Actual expenses = ₹3,000 + ₹1,500 = ₹4,500 (450000 paise)
    assert.equal(data.periodStats.expense_paise, 450000);
    // Budget remaining = ₹9,500 - ₹4,500 = ₹5,000 (500000 paise)
    assert.equal(data.remainingBudgetPaise, 500000);
    assert.equal(data.safeDaily.remainingBudgetPaise, 500000);
  });

  // SCENARIO 7: Budget remaining calculation with savings deposits (must NOT reduce remaining budget)
  await t.test('Scenario 7: Budget remaining calculation with savings deposits', async () => {
    // Create savings goal
    const goalRes = await env.request('/api/goals', {
      method: 'POST',
      headers: { Cookie: cookieA },
      body: {
        title: 'Emergency Fund',
        target_amount: 5000
      }
    });
    const goalData = await goalRes.json();
    const goalId = goalData.goal.id;

    // Deposit ₹1,000 into savings goal
    const depRes = await env.request(`/api/goals/${goalId}/movements`, {
      method: 'POST',
      headers: { Cookie: cookieA },
      body: {
        amount: 1000,
        type: 'deposit'
      }
    });
    assert.equal(depRes.status, 201);

    const res = await env.request(`/api/budgets?period=${OCT_PERIOD}`, {
      headers: { Cookie: cookieA }
    });
    const data = await res.json();

    // Actual expenses must STILL be ₹4,500 (450000 paise)
    assert.equal(data.periodStats.expense_paise, 450000);
    // Remaining budget must STILL be ₹5,000 (500000 paise), strictly NOT reduced to ₹4,000!
    assert.equal(data.remainingBudgetPaise, 500000);
    assert.equal(data.safeDaily.remainingBudgetPaise, 500000);
  });

  // SCENARIO 8: Overbudget state (expenses exceeding budget cap)
  await t.test('Scenario 8: Overbudget state (expenses exceeding budget cap)', async () => {
    // Budget is ₹9,500. Currently spent is ₹4,500.
    // Add additional expense of ₹6,000 (Total spent becomes ₹10,500, exceeding ₹9,500 by ₹1,000)
    await env.request('/api/transactions', {
      method: 'POST',
      headers: { Cookie: cookieA },
      body: {
        amount: 6000,
        type: 'expense',
        category_name: 'Electronics & Repairs',
        classification: 'need',
        date: `${OCT_PERIOD}-15`
      }
    });

    const res = await env.request(`/api/budgets?period=${OCT_PERIOD}`, {
      headers: { Cookie: cookieA }
    });
    const data = await res.json();

    // Actual expenses = ₹10,500 (1050000 paise)
    assert.equal(data.periodStats.expense_paise, 1050000);
    // Remaining budget = ₹9,500 - ₹10,500 = -₹1,000 (-100000 paise)
    assert.equal(data.remainingBudgetPaise, -100000);
    assert.equal(data.safeDaily.remainingBudgetPaise, -100000);
    assert.equal(data.safeDaily.status, 'BUDGET_EXCEEDED');
    assert.ok(data.safeDaily.message.includes('exceeded'));
  });

  // SCENARIO 9: Budget isolation across different months (e.g. Oct 2026 vs Nov 2026)
  await t.test('Scenario 9: Budget isolation across different months', async () => {
    // Set a different budget for Nov 2026: ₹12,000
    const novSetRes = await env.request(`/api/budgets/${NOV_PERIOD}`, {
      method: 'PUT',
      headers: { Cookie: cookieA },
      body: {
        total_budget: 12000,
        needs_target_pct: 50,
        wants_target_pct: 30,
        savings_target_pct: 20
      }
    });
    assert.equal(novSetRes.status, 200);

    // Retrieve Oct 2026 budget
    const octRes = await env.request(`/api/budgets/${OCT_PERIOD}`, {
      headers: { Cookie: cookieA }
    });
    const octData = await octRes.json();
    assert.equal(octData.period, OCT_PERIOD);
    assert.equal(octData.budget.total_budget_paise, 950000);
    assert.equal(octData.periodStats.expense_paise, 1050000);

    // Retrieve Nov 2026 budget
    const novRes = await env.request(`/api/budgets/${NOV_PERIOD}`, {
      headers: { Cookie: cookieA }
    });
    const novData = await novRes.json();
    assert.equal(novData.period, NOV_PERIOD);
    assert.equal(novData.budget.total_budget_paise, 1200000);
    // Nov has 0 expenses
    assert.equal(novData.periodStats.expense_paise, 0);
    assert.equal(novData.remainingBudgetPaise, 1200000);
  });

  // SCENARIO 10: Budget isolation across different users
  await t.test('Scenario 10: Budget isolation across different users', async () => {
    // User B has not set a budget for Oct 2026 yet
    const userBRes = await env.request(`/api/budgets/${OCT_PERIOD}`, {
      headers: { Cookie: cookieB }
    });
    const userBData = await userBRes.json();
    assert.equal(userBData.budget, null);
    assert.equal(userBData.remainingBudgetPaise, 0);

    // User B sets their own budget of ₹6,000
    const userBSetRes = await env.request(`/api/budgets/${OCT_PERIOD}`, {
      method: 'PUT',
      headers: { Cookie: cookieB },
      body: {
        total_budget: 6000
      }
    });
    assert.equal(userBSetRes.status, 200);

    // Verify User A budget is untouched (still ₹9,500)
    const verifyUserARes = await env.request(`/api/budgets/${OCT_PERIOD}`, {
      headers: { Cookie: cookieA }
    });
    const verifyUserAData = await verifyUserARes.json();
    assert.equal(verifyUserAData.budget.total_budget_paise, 950000);

    // Verify User B budget is independent (₹6,000)
    const verifyUserBRes = await env.request(`/api/budgets/${OCT_PERIOD}`, {
      headers: { Cookie: cookieB }
    });
    const verifyUserBData = await verifyUserBRes.json();
    assert.equal(verifyUserBData.budget.total_budget_paise, 600000);
  });

  await env.close();
});
