import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp } from '../testHelper.js';

test('Integration - Transactions CRUD and Financial Filtering', async (t) => {
  const env = await createTestApp();

  // Register user
  const regRes = await env.request('/api/auth/register', {
    method: 'POST',
    body: { email: 'tx_user@test.edu', password: 'Password123!', fullName: 'Priya Patel' }
  });
  const sessionCookie = regRes.headers.get('set-cookie').split(';')[0];

  let txId1 = '';
  let txId2 = '';

  await t.test('1. Create pocket money income transaction', async () => {
    const res = await env.request('/api/transactions', {
      method: 'POST',
      headers: { Cookie: sessionCookie },
      body: {
        amount: 8000, // ₹8,000 -> 800,000 paise
        type: 'income',
        category_name: 'Pocket Money / Allowance',
        classification: 'income',
        description: 'Monthly allowance from parents',
        date: '2026-10-01'
      }
    });

    assert.equal(res.status, 201);
    const data = await res.json();
    assert.equal(data.transaction.amount_paise, 800000);
    assert.equal(data.transaction.type, 'income');
    txId1 = data.transaction.id;
  });

  await t.test('2. Create essential needs expense', async () => {
    const res = await env.request('/api/transactions', {
      method: 'POST',
      headers: { Cookie: sessionCookie },
      body: {
        amount: '1250.50', // ₹1,250.50 -> 125,050 paise
        type: 'expense',
        category_name: 'Food & Groceries',
        classification: 'need',
        description: 'Hostel mess bill',
        date: '2026-10-05'
      }
    });

    assert.equal(res.status, 201);
    const data = await res.json();
    assert.equal(data.transaction.amount_paise, 125050);
    assert.equal(data.transaction.classification, 'need');
    txId2 = data.transaction.id;
  });

  await t.test('3. List transactions and verify summary totals', async () => {
    const res = await env.request('/api/transactions?period=2026-10', {
      headers: { Cookie: sessionCookie }
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.transactions.length, 2);
    assert.equal(data.summary.total_income_paise, 800000);
    assert.equal(data.summary.total_expense_paise, 125050);
    assert.equal(data.summary.needs_expense_paise, 125050);
  });

  await t.test('4. Update a transaction amount', async () => {
    const res = await env.request(`/api/transactions/${txId2}`, {
      method: 'PATCH',
      headers: { Cookie: sessionCookie },
      body: {
        amount: 1300, // updated to ₹1,300
        description: 'Hostel mess bill + snacks'
      }
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.transaction.amount_paise, 130000);
    assert.equal(data.transaction.version, 2);
  });

  await t.test('5. Delete a transaction', async () => {
    const res = await env.request(`/api/transactions/${txId2}`, {
      method: 'DELETE',
      headers: { Cookie: sessionCookie }
    });

    assert.equal(res.status, 200);

    const listRes = await env.request('/api/transactions?period=2026-10', {
      headers: { Cookie: sessionCookie }
    });
    const data = await listRes.json();
    assert.equal(data.transactions.length, 1);
  });

  await env.close();
});
