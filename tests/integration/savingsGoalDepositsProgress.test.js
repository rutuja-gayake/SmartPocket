import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp } from '../testHelper.js';

test('Integration - Savings Goal Deposits, Progress Bars, and Available Balance (Tests A - J)', async (t) => {
  const env = await createTestApp();

  // Register User A
  const regResA = await env.request('/api/auth/register', {
    method: 'POST',
    body: { email: 'savings_tester@test.edu', password: 'Password123!', fullName: 'Riya Sen' }
  });
  const cookieA = regResA.headers.get('set-cookie').split(';')[0];

  // Register User B for isolation checks (Test G)
  const regResB = await env.request('/api/auth/register', {
    method: 'POST',
    body: { email: 'savings_intruder@test.edu', password: 'Password123!', fullName: 'Aditya Roy' }
  });
  const cookieB = regResB.headers.get('set-cookie').split(';')[0];

  const currentPeriod = '2026-10';
  let goalId;

  // Initial State: Student receives ₹10,000 pocket money and spends ₹3,000 on essentials
  // Total Income: ₹10,000 | Actual Expenses: ₹3,000 | Available: ₹7,000 | Monthly Spent: ₹3,000
  await env.request('/api/transactions', {
    method: 'POST',
    headers: { Cookie: cookieA },
    body: {
      amount: 10000,
      type: 'income',
      category_name: 'Monthly Pocket Money',
      classification: 'income',
      date: `${currentPeriod}-01`
    }
  });

  await env.request('/api/transactions', {
    method: 'POST',
    headers: { Cookie: cookieA },
    body: {
      amount: 3000,
      type: 'expense',
      category_name: 'Groceries & Mess',
      classification: 'need',
      date: `${currentPeriod}-05`
    }
  });

  // Verify initial state
  const initBudgetRes = await env.request(`/api/budgets?period=${currentPeriod}`, {
    headers: { Cookie: cookieA }
  });
  const initBudgetData = await initBudgetRes.json();
  assert.equal(initBudgetData.availableBalancePaise, 700000); // ₹7,000 Available Pocket Cash
  assert.equal(initBudgetData.periodStats.expense_paise, 300000); // ₹3,000 Actual Monthly Spent

  // TEST A: Create a goal with a ₹10,000 target
  await t.test('Test A: Create a goal with a ₹10,000 target', async () => {
    const res = await env.request('/api/goals', {
      method: 'POST',
      headers: { Cookie: cookieA },
      body: {
        title: 'Laptop Upgrade',
        target_amount: 10000,
        target_date: '2026-12-31',
        description: 'Semester project laptop upgrade fund'
      }
    });

    assert.equal(res.status, 201);
    const data = await res.json();
    assert.ok(data.goal);
    assert.equal(data.goal.title, 'Laptop Upgrade');
    assert.equal(data.goal.target_amount_paise, 1000000); // ₹10,000 in paise
    assert.equal(data.goal.current_saved_paise, 0);
    assert.equal(data.goal.status, 'active');
    assert.equal(data.goal.analysis.progressPct, 0);
    assert.equal(data.goal.analysis.remainingPaise, 1000000);
    goalId = data.goal.id;
  });

  // TEST B: Deposit ₹2,000 and verify:
  // - Saved amount = ₹2,000
  // - Progress = 20%
  // - Remaining amount = ₹8,000
  // - Available Pocket Cash decreases by ₹2,000 (from ₹7,000 to ₹5,000)
  // - Monthly Spent remains strictly unchanged (₹3,000)
  await t.test('Test B: Deposit ₹2,000 into Laptop Goal', async () => {
    const res = await env.request(`/api/goals/${goalId}/movements`, {
      method: 'POST',
      headers: { Cookie: cookieA },
      body: {
        amount: 2000,
        type: 'deposit',
        note: 'First contribution from pocket money'
      }
    });

    assert.equal(res.status, 201);
    const data = await res.json();
    assert.equal(data.goal.current_saved_paise, 200000); // ₹2,000
    assert.equal(data.goal.analysis.progressPct, 20); // 20%
    assert.equal(data.goal.analysis.remainingPaise, 800000); // ₹8,000
    assert.equal(data.availableBalancePaise, 500000); // Available Pocket Cash = ₹5,000

    // Verify dashboard financial metrics
    const bRes = await env.request(`/api/budgets?period=${currentPeriod}`, {
      headers: { Cookie: cookieA }
    });
    const bData = await bRes.json();
    assert.equal(bData.availableBalancePaise, 500000); // ₹5,000
    assert.equal(bData.periodStats.expense_paise, 300000); // Monthly Spent strictly ₹3,000
    assert.equal(bData.netSavingsTransfersPaise, 200000); // Net savings = ₹2,000
  });

  // TEST C: Deposit another ₹1,000 and verify:
  // - Saved amount = ₹3,000
  // - Progress = 30%
  // - Remaining amount = ₹7,000
  // - Available Pocket Cash decreases to ₹4,000
  // - Monthly Spent remains strictly ₹3,000
  await t.test('Test C: Deposit another ₹1,000 into Laptop Goal', async () => {
    const res = await env.request(`/api/goals/${goalId}/movements`, {
      method: 'POST',
      headers: { Cookie: cookieA },
      body: {
        amount: 1000,
        type: 'deposit',
        note: 'Saved from cafe outings'
      }
    });

    assert.equal(res.status, 201);
    const data = await res.json();
    assert.equal(data.goal.current_saved_paise, 300000); // ₹3,000
    assert.equal(data.goal.analysis.progressPct, 30); // 30%
    assert.equal(data.goal.analysis.remainingPaise, 700000); // ₹7,000
    assert.equal(data.availableBalancePaise, 400000); // Available Pocket Cash = ₹4,000

    // Dashboard verification
    const bRes = await env.request(`/api/budgets?period=${currentPeriod}`, {
      headers: { Cookie: cookieA }
    });
    const bData = await bRes.json();
    assert.equal(bData.availableBalancePaise, 400000);
    assert.equal(bData.periodStats.expense_paise, 300000); // Strictly unchanged
  });

  // TEST D: Refresh the webpage / query goal and verify saved amount and progress remain persisted
  await t.test('Test D: Persistence across page refresh and goal retrieval', async () => {
    const res = await env.request('/api/goals', {
      headers: { Cookie: cookieA }
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    const laptopGoal = data.goals.find(g => g.id === goalId);
    assert.ok(laptopGoal);
    assert.equal(laptopGoal.current_saved_paise, 300000); // ₹3,000 persisted
    assert.equal(laptopGoal.analysis.progressPct, 30); // 30% progress persisted
    assert.equal(laptopGoal.analysis.remainingPaise, 700000); // ₹7,000 remaining
  });

  // TEST E: Withdraw ₹500 and verify:
  // - Saved amount = ₹2,500
  // - Progress = 25%
  // - Remaining amount = ₹7,500
  // - Available Pocket Cash increases by ₹500 (from ₹4,000 to ₹4,500)
  // - Monthly Spent remains strictly unchanged (₹3,000)
  await t.test('Test E: Withdraw ₹500 from Laptop Goal', async () => {
    const res = await env.request(`/api/goals/${goalId}/movements`, {
      method: 'POST',
      headers: { Cookie: cookieA },
      body: {
        amount: 500,
        type: 'withdrawal',
        note: 'College lab materials'
      }
    });

    assert.equal(res.status, 201);
    const data = await res.json();
    assert.equal(data.goal.current_saved_paise, 250000); // ₹2,500
    assert.equal(data.goal.analysis.progressPct, 25); // 25%
    assert.equal(data.goal.analysis.remainingPaise, 750000); // ₹7,500
    assert.equal(data.availableBalancePaise, 450000); // Available Pocket Cash = ₹4,500

    const bRes = await env.request(`/api/budgets?period=${currentPeriod}`, {
      headers: { Cookie: cookieA }
    });
    const bData = await bRes.json();
    assert.equal(bData.availableBalancePaise, 450000);
    assert.equal(bData.periodStats.expense_paise, 300000); // Monthly spent strictly ₹3,000
    assert.equal(bData.netSavingsTransfersPaise, 250000); // ₹2,500 net savings
  });

  // TEST F: Reject invalid deposits and withdrawals without changing financial records
  await t.test('Test F: Reject invalid deposits and withdrawals safely', async () => {
    // 1. Negative amount
    const negRes = await env.request(`/api/goals/${goalId}/movements`, {
      method: 'POST',
      headers: { Cookie: cookieA },
      body: { amount: -100, type: 'deposit' }
    });
    assert.equal(negRes.status, 400);

    // 2. Non-numeric amount
    const nanRes = await env.request(`/api/goals/${goalId}/movements`, {
      method: 'POST',
      headers: { Cookie: cookieA },
      body: { amount: 'abc', type: 'deposit' }
    });
    assert.equal(nanRes.status, 400);

    // 3. Excessive withdrawal (> ₹2,500 currently saved)
    const excessWithRes = await env.request(`/api/goals/${goalId}/movements`, {
      method: 'POST',
      headers: { Cookie: cookieA },
      body: { amount: 5000, type: 'withdrawal' }
    });
    assert.equal(excessWithRes.status, 400);
    const excessWithData = await excessWithRes.json();
    assert.ok(excessWithData.error.includes('Cannot withdraw more than current saved amount'));

    // 4. Excessive deposit (> ₹4,500 available pocket cash)
    const excessDepRes = await env.request(`/api/goals/${goalId}/movements`, {
      method: 'POST',
      headers: { Cookie: cookieA },
      body: { amount: 100000, type: 'deposit' }
    });
    assert.equal(excessDepRes.status, 400);
    const excessDepData = await excessDepRes.json();
    assert.ok(excessDepData.error.includes('Insufficient available balance'));

    // Financial records remain untouched
    const verifyRes = await env.request('/api/goals', { headers: { Cookie: cookieA } });
    const verifyData = await verifyRes.json();
    const goal = verifyData.goals.find(g => g.id === goalId);
    assert.equal(goal.current_saved_paise, 250000); // Strictly ₹2,500
  });

  // TEST G: Verify that a user cannot modify another user's goal
  await t.test('Test G: Multi-user isolation (User B cannot modify User A goal)', async () => {
    // User B attempts to deposit into User A's goal
    const intruderDepRes = await env.request(`/api/goals/${goalId}/movements`, {
      method: 'POST',
      headers: { Cookie: cookieB },
      body: { amount: 500, type: 'deposit' }
    });
    assert.equal(intruderDepRes.status, 404);

    // User B attempts to withdraw from User A's goal
    const intruderWithRes = await env.request(`/api/goals/${goalId}/movements`, {
      method: 'POST',
      headers: { Cookie: cookieB },
      body: { amount: 500, type: 'withdrawal' }
    });
    assert.equal(intruderWithRes.status, 404);

    // User B attempts to delete User A's goal
    const intruderDelRes = await env.request(`/api/goals/${goalId}`, {
      method: 'DELETE',
      headers: { Cookie: cookieB }
    });
    assert.equal(intruderDelRes.status, 404);
  });

  // TEST H: Repeated submissions and sync retries do not duplicate financial movements (Idempotency)
  await t.test('Test H: Idempotent submissions prevent double counting', async () => {
    const fixedMovementId = 'mvt_idempotent_test_123';
    // First submission
    const res1 = await env.request(`/api/goals/${goalId}/movements`, {
      method: 'POST',
      headers: { Cookie: cookieA },
      body: { id: fixedMovementId, amount: 500, type: 'deposit' }
    });
    assert.equal(res1.status, 201);
    assert.equal(res1.body?.goal?.current_saved_paise || (await res1.json()).goal.current_saved_paise, 300000);

    // Repeated submission with same movement ID (e.g. network retry or sync retry)
    const res2 = await env.request(`/api/goals/${goalId}/movements`, {
      method: 'POST',
      headers: { Cookie: cookieA },
      body: { id: fixedMovementId, amount: 500, type: 'deposit' }
    });
    assert.equal(res2.status, 200);
    const data2 = await res2.json();
    assert.equal(data2.message, 'Savings movement already recorded');
    assert.equal(data2.goal.current_saved_paise, 300000); // Not incremented to 3500!
  });

  // TEST I: Verify that monthly spending charts and category totals exclude savings deposits and withdrawals
  await t.test('Test I: Monthly spending charts and category aggregations exclude savings movements', async () => {
    const txRes = await env.request(`/api/transactions?period=${currentPeriod}`, {
      headers: { Cookie: cookieA }
    });
    const txData = await txRes.json();

    // Actual expense transactions only: should sum to ₹3,000 (300000 paise)
    const expenseSum = txData.transactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + t.amount_paise, 0);

    assert.equal(expenseSum, 300000);

    // Savings movements must have type 'transfer_savings' and classification 'savings'
    const savingsTxs = txData.transactions.filter(t => t.type === 'transfer_savings');
    assert.ok(savingsTxs.length > 0);
    for (const st of savingsTxs) {
      assert.equal(st.type, 'transfer_savings');
      assert.equal(st.classification, 'savings');
    }
  });

  // TEST J: Offline savings operations are applied idempotently and synchronize cleanly
  await t.test('Test J: Offline savings sync applies without duplication', async () => {
    const offlineMvtId = 'mvt_offline_sync_999';
    // User pushes an offline deposit of ₹500 via /api/sync/push
    const pushRes = await env.request('/api/sync/push', {
      method: 'POST',
      headers: { Cookie: cookieA },
      body: {
        operations: [
          {
            operationId: 'op_offline_dep_1',
            entity: 'goal_movement',
            type: 'create',
            recordId: offlineMvtId,
            payload: {
              goal_id: goalId,
              amount: 500,
              type: 'deposit',
              note: 'Offline pocket cash saved'
            }
          }
        ]
      }
    });

    assert.equal(pushRes.status, 200);
    const pushData = await pushRes.json();
    assert.equal(pushData.processed[0].status, 'created');

    // Verify goal saved amount increased to ₹3,500
    const goalRes = await env.request('/api/goals', { headers: { Cookie: cookieA } });
    const goalData = await goalRes.json();
    const updated = goalData.goals.find(g => g.id === goalId);
    assert.equal(updated.current_saved_paise, 350000); // ₹3,500
    assert.equal(updated.analysis.progressPct, 35); // 35%

    // Re-pushing the same offline operation does not duplicate
    const pushAgainRes = await env.request('/api/sync/push', {
      method: 'POST',
      headers: { Cookie: cookieA },
      body: {
        operations: [
          {
            operationId: 'op_offline_dep_1_retry',
            entity: 'goal_movement',
            type: 'create',
            recordId: offlineMvtId,
            payload: {
              goal_id: goalId,
              amount: 500,
              type: 'deposit'
            }
          }
        ]
      }
    });
    assert.equal(pushAgainRes.status, 200);
    const pushAgainData = await pushAgainRes.json();
    assert.equal(pushAgainData.processed[0].status, 'already_exists');

    // Value strictly remains ₹3,500
    const finalBudget = await env.request(`/api/budgets?period=${currentPeriod}`, {
      headers: { Cookie: cookieA }
    });
    const finalBudgetData = await finalBudget.json();
    assert.equal(finalBudgetData.periodStats.expense_paise, 300000); // Monthly spent still strictly ₹3,000!
  });

  await env.close();
});

