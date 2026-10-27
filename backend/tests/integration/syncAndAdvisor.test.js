import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp } from '../testHelper.js';

test('Integration - Sync Push/Pull and Pocket AI Advisor', async (t) => {
  const env = await createTestApp();

  const regRes = await env.request('/api/auth/register', {
    method: 'POST',
    body: { email: 'sync_user@test.edu', password: 'Password123!', fullName: 'Rohan Mehra' }
  });
  const cookie = regRes.headers.get('set-cookie').split(';')[0];

  await t.test('1. Sync push creates offline transactions idempotently', async () => {
    const offlineTx = {
      operationId: 'op_123',
      entity: 'transaction',
      type: 'create',
      recordId: 'tx_offline_001',
      payload: {
        amount: 500,
        type: 'expense',
        category_name: 'Food & Groceries',
        classification: 'need',
        description: 'Offline grocery shopping',
        date: '2026-10-15'
      },
      version: 1
    };

    const pushRes = await env.request('/api/sync/push', {
      method: 'POST',
      headers: { Cookie: cookie },
      body: { operations: [offlineTx] }
    });

    assert.equal(pushRes.status, 200);
    const data = await pushRes.json();
    assert.equal(data.success, true);
    assert.equal(data.processed.length, 1);
    assert.equal(data.processed[0].status, 'created');
  });

  await t.test('2. Sync pull retrieves synced records', async () => {
    const pullRes = await env.request('/api/sync/pull', {
      headers: { Cookie: cookie }
    });
    assert.equal(pullRes.status, 200);
    const data = await pullRes.json();
    assert.ok(data.records.transactions.length >= 1);
    assert.equal(data.records.transactions[0].id, 'tx_offline_001');
  });

  await t.test('3. Pocket Advisor evaluates offline queries deterministically', async () => {
    // First give user some allowance so they have cash
    await env.request('/api/transactions', {
      method: 'POST',
      headers: { Cookie: cookie },
      body: {
        amount: 6000,
        type: 'income',
        category_name: 'Allowance',
        classification: 'income',
        date: '2026-10-01'
      }
    });

    // Query 1: Daily limit (explicit offline mode)
    const dailyRes = await env.request('/api/advisor/query', {
      method: 'POST',
      headers: { Cookie: cookie },
      body: { query: 'How much can I spend today?', preferCloud: false }
    });
    assert.equal(dailyRes.status, 200);
    const dailyData = await dailyRes.json();
    assert.equal(dailyData.mode, 'offline');
    assert.ok(dailyData.answer.includes('safe daily spending allowance'));

    // Query 2: Affordability check (explicit offline mode)
    const affordRes = await env.request('/api/advisor/query', {
      method: 'POST',
      headers: { Cookie: cookie },
      body: { query: 'Can I afford ₹800 shoes?', preferCloud: false }
    });
    assert.equal(affordRes.status, 200);
    const affordData = await affordRes.json();
    assert.equal(affordData.mode, 'offline');
    assert.ok(affordData.answer.includes('Yes') || affordData.answer.includes('afford'));

    // Query 3: Wants ratio (explicit offline mode)
    const wantsRes = await env.request('/api/advisor/query', {
      method: 'POST',
      headers: { Cookie: cookie },
      body: { query: 'Am I spending too much on wants?', preferCloud: false }
    });
    assert.equal(wantsRes.status, 200);
    const wantsData = await wantsRes.json();
    assert.equal(wantsData.mode, 'offline');
    assert.ok(wantsData.answer.includes('Wants'));
  });

  await env.close();
});

