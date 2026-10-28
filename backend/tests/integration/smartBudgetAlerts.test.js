import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp } from '../testHelper.js';
import { getCurrentPeriod } from '../../src/utils/date.js';

test('Integration - Smart Budget Alerts Full Lifecycle & Scenarios', async (t) => {
  const env = await createTestApp();
  let authCookie = '';
  const currentPeriod = getCurrentPeriod();
  const nextPeriod = '2099-11';

  function extractCookie(res) {
    const raw = res.headers.get('set-cookie');
    if (!raw) return '';
    return raw.split(';')[0];
  }

  t.after(async () => {
    await env.close();
  });

  // Setup student user and ₹5,000 monthly budget
  await t.test('1. Setup user and configure ₹5,000 monthly budget', async () => {
    const regRes = await env.request('/api/auth/register', {
      method: 'POST',
      body: {
        email: 'smart_alerts_student@college.edu',
        password: 'Password123!',
        fullName: 'Alerts Tester'
      }
    });
    assert.equal(regRes.status, 201);
    authCookie = extractCookie(regRes);

    const budgetPut = await env.request(`/api/budgets/${currentPeriod}`, {
      method: 'PUT',
      headers: { Cookie: authCookie },
      body: { total_budget: 5000 }
    });
    assert.equal(budgetPut.status, 200);

    // Provide spendable pocket money
    await env.request('/api/transactions', {
      method: 'POST',
      headers: { Cookie: authCookie },
      body: {
        amount: 10000,
        type: 'income',
        category_name: 'Pocket Money',
        classification: 'income',
        date: `${currentPeriod}-01`,
        description: 'Monthly pocket money'
      }
    });

    const bRes = await env.request(`/api/budgets/${currentPeriod}`, {
      headers: { Cookie: authCookie }
    });
    const bData = await bRes.json();
    assert.ok(bData.smartBudgetAlert, 'smartBudgetAlert is provided');
    assert.equal(bData.smartBudgetAlert.status, 'NORMAL');
    assert.equal(bData.smartBudgetAlert.usagePct, 0);
    assert.equal(bData.smartBudgetAlert.remainingBudgetPaise, 500000);
    assert.equal(bData.smartBudgetAlert.message, 'You’re within your monthly budget.');
  });

  // Scenario 1: ₹3,000 spent: no threshold alert (< 75%)
  let tx1Id = '';
  await t.test('2. ₹3,000 spent: status NORMAL, no threshold alert', async () => {
    const txRes = await env.request('/api/transactions', {
      method: 'POST',
      headers: { Cookie: authCookie },
      body: {
        amount: 3000,
        type: 'expense',
        category_name: 'Rent & Living',
        classification: 'need',
        date: `${currentPeriod}-02`,
        description: 'Hostel rent installment'
      }
    });
    assert.equal(txRes.status, 201);
    const txData = await txRes.json();
    tx1Id = txData.transaction.id;

    const bRes = await env.request(`/api/budgets/${currentPeriod}`, {
      headers: { Cookie: authCookie }
    });
    const bData = await bRes.json();
    const alert = bData.smartBudgetAlert;
    assert.equal(alert.status, 'NORMAL');
    assert.equal(alert.threshold, null);
    assert.equal(alert.usagePct, 60);
    assert.equal(alert.remainingBudgetPaise, 200000); // ₹2,000
    assert.equal(alert.message, 'You’re within your monthly budget.');
  });

  // Scenario 2: ₹3,750 spent (add ₹750): 75% caution alert
  let tx2Id = '';
  await t.test('3. ₹3,750 spent: 75% caution alert', async () => {
    const txRes = await env.request('/api/transactions', {
      method: 'POST',
      headers: { Cookie: authCookie },
      body: {
        amount: 750,
        type: 'expense',
        category_name: 'Books',
        classification: 'need',
        date: `${currentPeriod}-05`,
        description: 'Textbooks'
      }
    });
    assert.equal(txRes.status, 201);
    const txData = await txRes.json();
    tx2Id = txData.transaction.id;

    const bRes = await env.request(`/api/budgets/${currentPeriod}`, {
      headers: { Cookie: authCookie }
    });
    const bData = await bRes.json();
    const alert = bData.smartBudgetAlert;
    assert.equal(alert.status, 'CAUTION');
    assert.equal(alert.threshold, '75');
    assert.equal(alert.usagePct, 75);
    assert.equal(alert.remainingBudgetPaise, 125000); // ₹1,250
    assert.equal(alert.message, 'You have used 75% of your monthly budget. Spend carefully.');
  });

  // Scenario 3: ₹4,500 spent (add ₹750): 90% warning alert with ₹500 remaining
  let tx3Id = '';
  await t.test('4. ₹4,500 spent: 90% warning with ₹500 remaining', async () => {
    const txRes = await env.request('/api/transactions', {
      method: 'POST',
      headers: { Cookie: authCookie },
      body: {
        amount: 750,
        type: 'expense',
        category_name: 'Dining',
        classification: 'want',
        date: `${currentPeriod}-10`,
        description: 'Dining out'
      }
    });
    assert.equal(txRes.status, 201);
    const txData = await txRes.json();
    tx3Id = txData.transaction.id;

    const bRes = await env.request(`/api/budgets/${currentPeriod}`, {
      headers: { Cookie: authCookie }
    });
    const bData = await bRes.json();
    const alert = bData.smartBudgetAlert;
    assert.equal(alert.status, 'WARNING');
    assert.equal(alert.threshold, '90');
    assert.equal(alert.usagePct, 90);
    assert.equal(alert.remainingBudgetPaise, 50000); // ₹500
    assert.equal(alert.message, 'Warning! You have used 90% of your monthly budget. Only ₹500 left.');
  });

  // Scenario 4: ₹5,000 spent (add ₹500): 100% budget exhausted alert
  let tx4Id = '';
  await t.test('5. ₹5,000 spent: 100% budget exhausted alert', async () => {
    const txRes = await env.request('/api/transactions', {
      method: 'POST',
      headers: { Cookie: authCookie },
      body: {
        amount: 500,
        type: 'expense',
        category_name: 'Cafes',
        classification: 'want',
        date: `${currentPeriod}-15`,
        description: 'Coffee and snacks'
      }
    });
    assert.equal(txRes.status, 201);
    const txData = await txRes.json();
    tx4Id = txData.transaction.id;

    const bRes = await env.request(`/api/budgets/${currentPeriod}`, {
      headers: { Cookie: authCookie }
    });
    const bData = await bRes.json();
    const alert = bData.smartBudgetAlert;
    assert.equal(alert.status, 'EXHAUSTED');
    assert.equal(alert.threshold, '100');
    assert.equal(alert.usagePct, 100);
    assert.equal(alert.remainingBudgetPaise, 0);
    assert.equal(alert.isExceeded, false);
    assert.equal(alert.message, 'Your monthly budget limit has been reached. Avoid unnecessary spending.');
  });

  // Scenario 5: ₹5,300 spent (add ₹300): over-budget alert showing ₹300 exceeded
  let tx5Id = '';
  await t.test('6. ₹5,300 spent: over-budget alert showing ₹300 exceeded', async () => {
    const txRes = await env.request('/api/transactions', {
      method: 'POST',
      headers: { Cookie: authCookie },
      body: {
        amount: 300,
        type: 'expense',
        category_name: 'Stationery',
        classification: 'need',
        date: `${currentPeriod}-18`,
        description: 'Notebooks'
      }
    });
    assert.equal(txRes.status, 201);
    const txData = await txRes.json();
    tx5Id = txData.transaction.id;

    const bRes = await env.request(`/api/budgets/${currentPeriod}`, {
      headers: { Cookie: authCookie }
    });
    const bData = await bRes.json();
    const alert = bData.smartBudgetAlert;
    assert.equal(alert.status, 'EXCEEDED');
    assert.equal(alert.threshold, 'EXCEEDED');
    assert.equal(alert.isExceeded, true);
    assert.equal(alert.usagePct, 106);
    assert.equal(alert.remainingBudgetPaise, 0); // Must never be negative
    assert.equal(alert.exceededPaise, 30000); // ₹300 exceeded
    assert.equal(alert.message, 'Your monthly budget limit has been reached. Avoid unnecessary spending. (Exceeded by ₹300)');
  });

  // Scenario 6: Savings deposit must not increase monthly expenses
  await t.test('7. Savings deposit: does NOT increase monthly expenses or alter budget alert', async () => {
    // Create savings goal
    const goalRes = await env.request('/api/goals', {
      method: 'POST',
      headers: { Cookie: authCookie },
      body: { title: 'Emergency Fund', target_amount: 10000 }
    });
    assert.equal(goalRes.status, 201);
    const goalData = await goalRes.json();

    // Deposit ₹2,000 into savings goal
    const moveRes = await env.request(`/api/goals/${goalData.goal.id}/movements`, {
      method: 'POST',
      headers: { Cookie: authCookie },
      body: {
        type: 'deposit',
        amount: 2000,
        date: `${currentPeriod}-20`,
        note: 'Savings deposit'
      }
    });
    assert.equal(moveRes.status, 201);

    // Verify budget alert is strictly unchanged (still ₹5,300 spent, ₹300 exceeded)
    const bRes = await env.request(`/api/budgets/${currentPeriod}`, {
      headers: { Cookie: authCookie }
    });
    const bData = await bRes.json();
    const alert = bData.smartBudgetAlert;
    assert.equal(alert.monthlyExpensePaise, 530000); // Strictly ₹5,300
    assert.equal(alert.exceededPaise, 30000); // Strictly ₹300 exceeded
    assert.equal(alert.status, 'EXCEEDED');
  });

  // Scenario 7: Edit transaction: reduce expense from ₹300 to ₹100 brings spending to ₹5,100 (exceeded by ₹100)
  await t.test('8. Edit transaction: updates alert status and exceeded amount', async () => {
    const patchRes = await env.request(`/api/transactions/${tx5Id}`, {
      method: 'PATCH',
      headers: { Cookie: authCookie },
      body: { amount: 100, description: 'One notebook only' }
    });
    assert.equal(patchRes.status, 200);

    const bRes = await env.request(`/api/budgets/${currentPeriod}`, {
      headers: { Cookie: authCookie }
    });
    const bData = await bRes.json();
    const alert = bData.smartBudgetAlert;
    assert.equal(alert.monthlyExpensePaise, 510000); // ₹5,100
    assert.equal(alert.exceededPaise, 10000); // ₹100
    assert.equal(alert.message, 'Your monthly budget limit has been reached. Avoid unnecessary spending. (Exceeded by ₹100)');
  });

  // Scenario 8: Delete transaction: deleting tx5 brings spending to ₹5,000 (status EXHAUSTED)
  await t.test('9. Delete transaction: recalculates alert to EXHAUSTED', async () => {
    const delRes = await env.request(`/api/transactions/${tx5Id}`, {
      method: 'DELETE',
      headers: { Cookie: authCookie }
    });
    assert.equal(delRes.status, 200);

    const bRes = await env.request(`/api/budgets/${currentPeriod}`, {
      headers: { Cookie: authCookie }
    });
    const bData = await bRes.json();
    const alert = bData.smartBudgetAlert;
    assert.equal(alert.monthlyExpensePaise, 500000); // ₹5,000
    assert.equal(alert.status, 'EXHAUSTED');
    assert.equal(alert.remainingBudgetPaise, 0);
  });

  // Scenario 9: New month isolation: transactions in next month do not alter current month
  await t.test('10. New month isolation: alerts track independently per period', async () => {
    // Next month has no expenses yet
    const bRes = await env.request(`/api/budgets/${nextPeriod}`, {
      headers: { Cookie: authCookie }
    });
    const bData = await bRes.json();
    assert.equal(bData.smartBudgetAlert.status, 'NO_BUDGET'); // No budget set for next month yet

    // Current month still shows 100% EXHAUSTED
    const currRes = await env.request(`/api/budgets/${currentPeriod}`, {
      headers: { Cookie: authCookie }
    });
    const currData = await currRes.json();
    assert.equal(currData.smartBudgetAlert.status, 'EXHAUSTED');
  });
});
