import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp } from '../testHelper.js';

test('Integration - Savings Deposit, Withdrawal, and Monthly Spending Invariance', async (t) => {
  const env = await createTestApp();

  // Register User A
  const regResA = await env.request('/api/auth/register', {
    method: 'POST',
    body: { email: 'student_saver@test.edu', password: 'Password123!', fullName: 'Priya Sharma' }
  });
  const cookieA = regResA.headers.get('set-cookie').split(';')[0];

  // Register User B for isolation tests
  const regResB = await env.request('/api/auth/register', {
    method: 'POST',
    body: { email: 'other_user@test.edu', password: 'Password123!', fullName: 'Vikram Mehta' }
  });
  const cookieB = regResB.headers.get('set-cookie').split(';')[0];

  let laptopGoalId;

  await t.test('Test 1: Initial balances (Income ₹10,000, Expenses ₹3,000, Savings ₹2,000 -> Available ₹5,000)', async () => {
    // 1. Total income received: ₹10,000
    await env.request('/api/transactions', {
      method: 'POST',
      headers: { Cookie: cookieA },
      body: {
        amount: 10000,
        type: 'income',
        category_name: 'Allowance',
        classification: 'income',
        date: '2026-10-01'
      }
    });

    // 2. Actual monthly expenses: ₹3,000 (₹2,000 need + ₹1,000 want)
    await env.request('/api/transactions', {
      method: 'POST',
      headers: { Cookie: cookieA },
      body: {
        amount: 2000,
        type: 'expense',
        category_name: 'Books & Stationery',
        classification: 'need',
        date: '2026-10-05'
      }
    });
    await env.request('/api/transactions', {
      method: 'POST',
      headers: { Cookie: cookieA },
      body: {
        amount: 1000,
        type: 'expense',
        category_name: 'Cafes & Dining Out',
        classification: 'want',
        date: '2026-10-08'
      }
    });

    // 3. Existing savings goal with ₹2,000 allocation
    const goalRes = await env.request('/api/goals', {
      method: 'POST',
      headers: { Cookie: cookieA },
      body: {
        title: 'Laptop Savings Fund',
        target_amount: 50000,
        target_date: '2027-06-01'
      }
    });
    assert.equal(goalRes.status, 201);
    const goalData = await goalRes.json();
    laptopGoalId = goalData.goal.id;

    const initialDepRes = await env.request(`/api/goals/${laptopGoalId}/movements`, {
      method: 'POST',
      headers: { Cookie: cookieA },
      body: {
        amount: 2000,
        type: 'deposit',
        note: 'Initial laptop allocation'
      }
    });
    assert.equal(initialDepRes.status, 201);

    // Verify balances
    const budgetRes = await env.request('/api/budgets?period=2026-10', {
      headers: { Cookie: cookieA }
    });
    assert.equal(budgetRes.status, 200);
    const bData = await budgetRes.json();

    assert.equal(bData.periodStats.income_paise, 1000000); // ₹10,000
    assert.equal(bData.periodStats.expense_paise, 300000); // ₹3,000
    assert.equal(bData.availableBalancePaise, 500000); // ₹5,000
  });

  await t.test('Test 2: Deposit ₹1,000 into Laptop Goal', async () => {
    const depRes = await env.request(`/api/goals/${laptopGoalId}/movements`, {
      method: 'POST',
      headers: { Cookie: cookieA },
      body: {
        amount: 1000,
        type: 'deposit',
        note: 'Monthly laptop deposit'
      }
    });
    assert.equal(depRes.status, 201);
    const depData = await depRes.json();
    assert.equal(depData.goal.current_saved_paise, 300000); // ₹3,000 saved

    const budgetRes = await env.request('/api/budgets?period=2026-10', {
      headers: { Cookie: cookieA }
    });
    const bData = await budgetRes.json();

    assert.equal(bData.periodStats.income_paise, 1000000); // ₹10,000 (unchanged)
    assert.equal(bData.periodStats.expense_paise, 300000); // ₹3,000 (unchanged)
    assert.equal(bData.availableBalancePaise, 400000); // ₹4,000 (5,000 - 1,000)
  });

  await t.test('Test 3: Monthly spent remains unchanged (strictly ₹3,000)', async () => {
    const txRes = await env.request('/api/transactions?period=2026-10', {
      headers: { Cookie: cookieA }
    });
    assert.equal(txRes.status, 200);
    const txData = await txRes.json();

    assert.equal(txData.summary.total_income_paise, 1000000); // ₹10,000
    assert.equal(txData.summary.total_expense_paise, 300000); // ₹3,000 (NOT ₹4,000!)
    assert.equal(txData.summary.needs_expense_paise, 200000); // ₹2,000
    assert.equal(txData.summary.wants_expense_paise, 100000); // ₹1,000
    assert.equal(txData.summary.savings_transfers_paise, 300000); // ₹3,000
  });

  await t.test('Test 4: Withdraw ₹500 from Laptop Goal', async () => {
    const withRes = await env.request(`/api/goals/${laptopGoalId}/movements`, {
      method: 'POST',
      headers: { Cookie: cookieA },
      body: {
        amount: 500,
        type: 'withdrawal',
        note: 'Emergency cash withdrawal from savings'
      }
    });
    assert.equal(withRes.status, 201);
    const withData = await withRes.json();
    assert.equal(withData.goal.current_saved_paise, 250000); // ₹2,500 saved

    const budgetRes = await env.request('/api/budgets?period=2026-10', {
      headers: { Cookie: cookieA }
    });
    const bData = await budgetRes.json();

    assert.equal(bData.periodStats.income_paise, 1000000); // ₹10,000 (income unchanged!)
    assert.equal(bData.periodStats.expense_paise, 300000); // ₹3,000 (monthly spent unchanged!)
    assert.equal(bData.availableBalancePaise, 450000); // ₹4,500 (4,000 + 500)
  });

  await t.test('Test 5: Insufficient funds validation', async () => {
    // Current available balance is ₹4,500. Attempt to deposit ₹5,000:
    const invalidDepRes = await env.request(`/api/goals/${laptopGoalId}/movements`, {
      method: 'POST',
      headers: { Cookie: cookieA },
      body: {
        amount: 5000,
        type: 'deposit',
        note: 'Excess deposit'
      }
    });
    assert.equal(invalidDepRes.status, 400);
    const errData = await invalidDepRes.json();
    assert.ok(errData.error.includes('Insufficient available balance'));

    // Attempt to withdraw more than saved amount (₹2,500):
    const excessWithRes = await env.request(`/api/goals/${laptopGoalId}/movements`, {
      method: 'POST',
      headers: { Cookie: cookieA },
      body: {
        amount: 10000,
        type: 'withdrawal'
      }
    });
    assert.equal(excessWithRes.status, 400);

    // Negative / zero amount:
    const zeroRes = await env.request(`/api/goals/${laptopGoalId}/movements`, {
      method: 'POST',
      headers: { Cookie: cookieA },
      body: { amount: 0, type: 'deposit' }
    });
    assert.equal(zeroRes.status, 400);

    // Verify balance was untouched
    const budgetRes = await env.request('/api/budgets?period=2026-10', {
      headers: { Cookie: cookieA }
    });
    const bData = await budgetRes.json();
    assert.equal(bData.availableBalancePaise, 450000);
    assert.equal(bData.periodStats.expense_paise, 300000);
  });

  await t.test('Test 6: Duplicate requests idempotency', async () => {
    const fixedMvtId = 'idempotent_mvt_001';

    // First request
    const firstRes = await env.request(`/api/goals/${laptopGoalId}/movements`, {
      method: 'POST',
      headers: { Cookie: cookieA },
      body: {
        id: fixedMvtId,
        amount: 200,
        type: 'deposit',
        note: 'Idempotency test'
      }
    });
    assert.equal(firstRes.status, 201);
    const firstData = await firstRes.json();
    assert.equal(firstData.goal.current_saved_paise, 270000); // 2,500 + 200 = 2,700

    // Repeated request with same movement ID
    const secondRes = await env.request(`/api/goals/${laptopGoalId}/movements`, {
      method: 'POST',
      headers: { Cookie: cookieA },
      body: {
        id: fixedMvtId,
        amount: 200,
        type: 'deposit',
        note: 'Idempotency test retry'
      }
    });
    assert.equal(secondRes.status, 200); // 200 OK without re-applying
    const secondData = await secondRes.json();
    assert.equal(secondData.goal.current_saved_paise, 270000); // Remains 2,700!

    // Verify balance only deducted once
    const budgetRes = await env.request('/api/budgets?period=2026-10', {
      headers: { Cookie: cookieA }
    });
    const bData = await budgetRes.json();
    assert.equal(bData.availableBalancePaise, 430000); // 4,500 - 200 = 4,300
    assert.equal(bData.periodStats.expense_paise, 300000); // Strictly unchanged
  });

  await t.test('Test 7: Dashboard refresh and persistence', async () => {
    // Query goals list
    const goalsRes = await env.request('/api/goals', {
      headers: { Cookie: cookieA }
    });
    assert.equal(goalsRes.status, 200);
    const goalsData = await goalsRes.json();
    const g = goalsData.goals.find(item => item.id === laptopGoalId);
    assert.equal(g.current_saved_paise, 270000);

    // Query movement history
    const historyRes = await env.request('/api/goals/movements/all', {
      headers: { Cookie: cookieA }
    });
    assert.equal(historyRes.status, 200);
    const historyData = await historyRes.json();
    assert.ok(historyData.movements.length >= 4);

    // Verify safe daily spending pace recalculates with new available balance
    const budgetRes = await env.request('/api/budgets?period=2026-10', {
      headers: { Cookie: cookieA }
    });
    const bData = await budgetRes.json();
    assert.ok(bData.safeDaily.safeDailyPaise > 0);
  });

  await t.test('Test 8: Chart consistency (category totals exclude savings movements)', async () => {
    const txRes = await env.request('/api/transactions?period=2026-10&type=expense', {
      headers: { Cookie: cookieA }
    });
    assert.equal(txRes.status, 200);
    const txData = await txRes.json();

    // Verify all transactions in expense list are strictly expenses
    for (const t of txData.transactions) {
      assert.equal(t.type, 'expense');
      assert.notEqual(t.category_name, 'Savings Goal Deposit');
    }

    // Sum must be strictly ₹3,000
    const totalExp = txData.transactions.reduce((sum, t) => sum + t.amount_paise, 0);
    assert.equal(totalExp, 300000);
  });

  await t.test('Test 9: User isolation (User B cannot access or move User A goals)', async () => {
    // User B tries to view movements for User A's goal
    const viewRes = await env.request(`/api/goals/${laptopGoalId}/movements`, {
      headers: { Cookie: cookieB }
    });
    assert.equal(viewRes.status, 404);

    // User B tries to deposit into User A's goal
    const depRes = await env.request(`/api/goals/${laptopGoalId}/movements`, {
      method: 'POST',
      headers: { Cookie: cookieB },
      body: { amount: 500, type: 'deposit' }
    });
    assert.equal(depRes.status, 404);

    // User B tries to withdraw from User A's goal
    const withRes = await env.request(`/api/goals/${laptopGoalId}/movements`, {
      method: 'POST',
      headers: { Cookie: cookieB },
      body: { amount: 500, type: 'withdrawal' }
    });
    assert.equal(withRes.status, 404);
  });

  await t.test('Test 10: Offline synchronization applies movement once with monthly spent unchanged', async () => {
    // User B creates their own goal
    const bGoalRes = await env.request('/api/goals', {
      method: 'POST',
      headers: { Cookie: cookieB },
      body: { title: 'Emergency Fund', target_amount: 10000 }
    });
    assert.equal(bGoalRes.status, 201);
    const bGoalId = (await bGoalRes.json()).goal.id;

    // Give User B ₹5,000 income and ₹1,500 expense
    await env.request('/api/transactions', {
      method: 'POST',
      headers: { Cookie: cookieB },
      body: { amount: 5000, type: 'income', category_name: 'Allowance', classification: 'income', date: '2026-10-01' }
    });
    await env.request('/api/transactions', {
      method: 'POST',
      headers: { Cookie: cookieB },
      body: { amount: 1500, type: 'expense', category_name: 'Food & Groceries', classification: 'need', date: '2026-10-02' }
    });

    // Simulate pushing an offline deposit movement
    const offlineMovementId = 'sync_offline_mvt_001';
    const syncPushRes = await env.request('/api/sync/push', {
      method: 'POST',
      headers: { Cookie: cookieB },
      body: {
        operations: [
          {
            operationId: 'op_sync_001',
            entity: 'goal_movement',
            type: 'create',
            recordId: offlineMovementId,
            payload: {
              goal_id: bGoalId,
              amount: 1000,
              type: 'deposit',
              note: 'Offline saved allowance'
            }
          }
        ]
      }
    });
    assert.equal(syncPushRes.status, 200);
    const pushData = await syncPushRes.json();
    assert.equal(pushData.processed[0].status, 'created');

    // Verify User B's monthly spent remains ₹1,500, savings is ₹1,000, and available is ₹2,500
    const bBudgetRes = await env.request('/api/budgets?period=2026-10', {
      headers: { Cookie: cookieB }
    });
    const bBudgetData = await bBudgetRes.json();
    assert.equal(bBudgetData.periodStats.income_paise, 500000); // ₹5,000
    assert.equal(bBudgetData.periodStats.expense_paise, 150000); // ₹1,500 (strictly unchanged!)
    assert.equal(bBudgetData.availableBalancePaise, 250000); // ₹2,500 (5,000 - 1,500 - 1,000)

    // Push same operation again (idempotency check during sync retry)
    const retryPushRes = await env.request('/api/sync/push', {
      method: 'POST',
      headers: { Cookie: cookieB },
      body: {
        operations: [
          {
            operationId: 'op_sync_002',
            entity: 'goal_movement',
            type: 'create',
            recordId: offlineMovementId,
            payload: {
              goal_id: bGoalId,
              amount: 1000,
              type: 'deposit'
            }
          }
        ]
      }
    });
    assert.equal(retryPushRes.status, 200);
    const retryData = await retryPushRes.json();
    assert.equal(retryData.processed[0].status, 'already_exists');

    // Values remain untouched after retry
    const bBudgetRes2 = await env.request('/api/budgets?period=2026-10', {
      headers: { Cookie: cookieB }
    });
    const bData2 = await bBudgetRes2.json();
    assert.equal(bData2.availableBalancePaise, 250000);
    assert.equal(bData2.periodStats.expense_paise, 150000);
  });

  await env.close();
});

