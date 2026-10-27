import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp } from '../testHelper.js';

test('Security Integration - Multi-User Isolation and Ownership Verification', async (t) => {
  const env = await createTestApp();

  // 1. Register User A
  const resA = await env.request('/api/auth/register', {
    method: 'POST',
    body: { email: 'userA@test.edu', password: 'Password123!', fullName: 'User A' }
  });
  const cookieA = resA.headers.get('set-cookie').split(';')[0];

  // 2. Register User B
  const resB = await env.request('/api/auth/register', {
    method: 'POST',
    body: { email: 'userB@test.edu', password: 'Password123!', fullName: 'User B' }
  });
  const cookieB = resB.headers.get('set-cookie').split(';')[0];

  let userATxId = '';
  let userAGoalId = '';

  await t.test('1. User A creates private transaction and savings goal', async () => {
    const txRes = await env.request('/api/transactions', {
      method: 'POST',
      headers: { Cookie: cookieA },
      body: {
        amount: 5000,
        type: 'income',
        category_name: 'Allowance',
        classification: 'income',
        date: '2026-10-10',
        description: 'Secret allowance User A'
      }
    });
    assert.equal(txRes.status, 201);
    const txData = await txRes.json();
    userATxId = txData.transaction.id;

    const goalRes = await env.request('/api/goals', {
      method: 'POST',
      headers: { Cookie: cookieA },
      body: {
        title: 'User A Laptop Goal',
        target_amount: 50000
      }
    });
    assert.equal(goalRes.status, 201);
    const goalData = await goalRes.json();
    userAGoalId = goalData.goal.id;
  });

  await t.test('2. User B cannot see User A transactions in list', async () => {
    const res = await env.request('/api/transactions', {
      headers: { Cookie: cookieB }
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.transactions.length, 0); // User B has 0 transactions
  });

  await t.test('3. User B cannot edit User A transaction', async () => {
    const res = await env.request(`/api/transactions/${userATxId}`, {
      method: 'PATCH',
      headers: { Cookie: cookieB },
      body: { amount: 10 }
    });
    assert.equal(res.status, 404); // Forbidden/Not found
  });

  await t.test('4. User B cannot delete User A transaction', async () => {
    const res = await env.request(`/api/transactions/${userATxId}`, {
      method: 'DELETE',
      headers: { Cookie: cookieB }
    });
    assert.equal(res.status, 404);
  });

  await t.test('5. User B cannot see or manipulate User A savings goals', async () => {
    const listRes = await env.request('/api/goals', {
      headers: { Cookie: cookieB }
    });
    assert.equal(listRes.status, 200);
    const data = await listRes.json();
    assert.equal(data.goals.length, 0);

    const editRes = await env.request(`/api/goals/${userAGoalId}`, {
      method: 'PATCH',
      headers: { Cookie: cookieB },
      body: { title: 'Hacked Goal' }
    });
    assert.equal(editRes.status, 404);
  });

  await env.close();
});

