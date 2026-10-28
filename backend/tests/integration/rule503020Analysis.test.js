import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp } from '../testHelper.js';
import { getCurrentPeriod } from '../../src/utils/date.js';

test('Integration - 50/30/20 Student Rule Real-Time Analysis', async (t) => {
  const env = await createTestApp();
  let authCookie = '';
  const currentPeriod = getCurrentPeriod();
  const nextPeriod = '2099-12';

  function extractCookie(res) {
    const raw = res.headers.get('set-cookie');
    if (!raw) return '';
    return raw.split(';')[0];
  }

  t.after(async () => {
    await env.close();
  });

  await t.test('1. Setup student account & set monthly allowance to ₹5,000', async () => {
    const regRes = await env.request('/api/auth/register', {
      method: 'POST',
      body: {
        email: 'rule503020_student@college.edu',
        password: 'Password123!',
        fullName: 'Rule Analyst'
      }
    });
    assert.equal(regRes.status, 201);
    authCookie = extractCookie(regRes);

    const allowRes = await env.request(`/api/allowances/${currentPeriod}`, {
      method: 'PUT',
      headers: { Cookie: authCookie },
      body: { amount: 5000, notes: 'Monthly pocket allowance' }
    });
    assert.equal(allowRes.status, 200);

    const budgetRes = await env.request(`/api/budgets/${currentPeriod}`, {
      headers: { Cookie: authCookie }
    });
    assert.equal(budgetRes.status, 200);
    const data = await budgetRes.json();
    const rule = data.rule503020;

    assert.ok(rule, '50/30/20 rule exists');
    assert.equal(rule.targets.needsPaise, 250000); // ₹2,500
    assert.equal(rule.targets.wantsPaise, 150000); // ₹1,500
    assert.equal(rule.targets.savingsPaise, 100000); // ₹1,000

    assert.equal(rule.actual.needsPaise, 0);
    assert.equal(rule.actual.wantsPaise, 0);
    assert.equal(rule.actual.savingsPaise, 0);

    assert.equal(rule.targetUsedNeedsPct, 0);
    assert.equal(rule.targetUsedWantsPct, 0);
    assert.equal(rule.targetUsedSavingsPct, 0);
  });

  await t.test('2. Add ₹200 grocery expense (Need) and verify target used = 8%, remaining = ₹2,300', async () => {
    const txRes = await env.request('/api/transactions', {
      method: 'POST',
      headers: { Cookie: authCookie },
      body: {
        amount: 200,
        type: 'expense',
        category_name: 'Groceries',
        classification: 'need',
        date: `${currentPeriod}-05`,
        description: 'Hostel groceries'
      }
    });
    assert.equal(txRes.status, 201);
    const txData = await txRes.json();
    assert.equal(txData.transaction.classification, 'need');

    const budgetRes = await env.request(`/api/budgets/${currentPeriod}`, {
      headers: { Cookie: authCookie }
    });
    const data = await budgetRes.json();
    const rule = data.rule503020;
    assert.equal(rule.actual.needsPaise, 20000); // ₹200
    assert.equal(rule.remainingNeedsPaise, 230000); // ₹2,300
    assert.equal(rule.targetUsedNeedsPct, 8); // 200 / 2500 * 100 = 8%
  });

  await t.test('3. Add ₹300 cafe expense (Want) and verify target used = 20%, remaining = ₹1,200', async () => {
    const txRes = await env.request('/api/transactions', {
      method: 'POST',
      headers: { Cookie: authCookie },
      body: {
        amount: 300,
        type: 'expense',
        category_name: 'Dining & Cafes',
        classification: 'want',
        date: `${currentPeriod}-10`,
        description: 'Campus cafe'
      }
    });
    assert.equal(txRes.status, 201);
    const txData = await txRes.json();
    assert.equal(txData.transaction.classification, 'want');

    const budgetRes = await env.request(`/api/budgets/${currentPeriod}`, {
      headers: { Cookie: authCookie }
    });
    const data = await budgetRes.json();
    const rule = data.rule503020;
    assert.equal(rule.actual.wantsPaise, 30000); // ₹300
    assert.equal(rule.remainingWantsPaise, 120000); // ₹1,200
    assert.equal(rule.targetUsedWantsPct, 20); // 300 / 1500 * 100 = 20%
  });

  let goalId = '';
  await t.test('4. Deposit ₹200 into Savings Goal and verify target used = 20%, remaining = ₹800', async () => {
    const goalRes = await env.request('/api/goals', {
      method: 'POST',
      headers: { Cookie: authCookie },
      body: { title: 'Laptop Fund', target_amount: 20000 }
    });
    assert.equal(goalRes.status, 201);
    const goalData = await goalRes.json();
    goalId = goalData.goal.id;

    const moveRes = await env.request(`/api/goals/${goalId}/movements`, {
      method: 'POST',
      headers: { Cookie: authCookie },
      body: {
        type: 'deposit',
        amount: 200,
        date: `${currentPeriod}-12`,
        note: 'Savings movement'
      }
    });
    assert.equal(moveRes.status, 201);

    const budgetRes = await env.request(`/api/budgets/${currentPeriod}`, {
      headers: { Cookie: authCookie }
    });
    const data = await budgetRes.json();
    const rule = data.rule503020;
    assert.equal(rule.actual.savingsPaise, 20000); // ₹200
    assert.equal(rule.remainingSavingsPaise, 80000); // ₹800
    assert.equal(rule.targetUsedSavingsPct, 20); // 200 / 1000 * 100 = 20%

    // Verify allowance stats
    const allowRes = await env.request(`/api/allowances/${currentPeriod}`, {
      headers: { Cookie: authCookie }
    });
    const allowData = await allowRes.json();
    assert.equal(allowData.monthlySpentPaise, 50000); // ₹500
    assert.equal(allowData.netSavingsAllocatedPaise, 20000); // ₹200
    assert.equal(allowData.availableToSpendPaise, 430000); // ₹4,300
  });

  await t.test('5. Edit transaction: change Cafe from ₹300 to ₹450, verify updated Want metrics', async () => {
    const txsRes = await env.request(`/api/transactions?period=${currentPeriod}`, {
      headers: { Cookie: authCookie }
    });
    const txsData = await txsRes.json();
    const cafeTx = txsData.transactions.find(t => t.description === 'Campus cafe');
    assert.ok(cafeTx, 'Found cafe transaction');

    const patchRes = await env.request(`/api/transactions/${cafeTx.id}`, {
      method: 'PATCH',
      headers: { Cookie: authCookie },
      body: {
        amount: 450,
        description: 'Campus cafe & treats'
      }
    });
    assert.equal(patchRes.status, 200);

    const budgetRes = await env.request(`/api/budgets/${currentPeriod}`, {
      headers: { Cookie: authCookie }
    });
    const data = await budgetRes.json();
    const rule = data.rule503020;
    assert.equal(rule.actual.wantsPaise, 45000); // ₹450
    assert.equal(rule.remainingWantsPaise, 105000); // ₹1,050
    assert.equal(rule.targetUsedWantsPct, 30); // 450 / 1500 * 100 = 30%
  });

  await t.test('6. Delete a transaction: delete Need expense and verify Need recalculates to 0', async () => {
    const txsRes = await env.request(`/api/transactions?period=${currentPeriod}`, {
      headers: { Cookie: authCookie }
    });
    const txsData = await txsRes.json();
    const needTx = txsData.transactions.find(t => t.classification === 'need');
    assert.ok(needTx, 'Found need transaction');

    const delRes = await env.request(`/api/transactions/${needTx.id}`, {
      method: 'DELETE',
      headers: { Cookie: authCookie }
    });
    assert.equal(delRes.status, 200);

    const budgetRes = await env.request(`/api/budgets/${currentPeriod}`, {
      headers: { Cookie: authCookie }
    });
    const data = await budgetRes.json();
    const rule = data.rule503020;
    assert.equal(rule.actual.needsPaise, 0); // ₹0
    assert.equal(rule.remainingNeedsPaise, 250000); // ₹2,500
    assert.equal(rule.targetUsedNeedsPct, 0);
  });

  await t.test('7. Month isolation: transactions in next period do not affect current period', async () => {
    const txRes = await env.request('/api/transactions', {
      method: 'POST',
      headers: { Cookie: authCookie },
      body: {
        amount: 1500,
        type: 'expense',
        category_name: 'Books',
        classification: 'need',
        date: `${nextPeriod}-02`,
        description: 'Future semester textbooks'
      }
    });
    assert.equal(txRes.status, 201);

    const budgetRes = await env.request(`/api/budgets/${currentPeriod}`, {
      headers: { Cookie: authCookie }
    });
    const data = await budgetRes.json();
    const rule = data.rule503020;
    assert.equal(rule.actual.needsPaise, 0); // Still 0 for current period
  });
});
