import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp } from '../testHelper.js';
import { getCurrentPeriod } from '../../src/utils/date.js';

test('Integration - Professional Monthly Allowance & Financial Accounting Accounting Engine', async (t) => {
  const env = await createTestApp();
  let authCookie = '';
  const currentPeriod = getCurrentPeriod();

  // Helper to extract session cookie from response
  function extractCookie(res) {
    const raw = res.headers.get('set-cookie');
    if (!raw) return '';
    return raw.split(';')[0];
  }

  // 1. Setup authenticated student user
  await t.test('1. Register student account', async () => {
    const res = await env.request('/api/auth/register', {
      method: 'POST',
      body: {
        email: 'allowance_student@college.edu',
        password: 'ValidPassword123!',
        fullName: 'Kavya Sharma'
      }
    });
    assert.equal(res.status, 201);
    authCookie = extractCookie(res);
    assert.ok(authCookie.includes('smartpocket_sid'));
  });

  // 2. Setting Monthly Allowance
  await t.test('2. Set monthly allowance to ₹5,000', async () => {
    const res = await env.request(`/api/allowances/${currentPeriod}`, {
      method: 'PUT',
      headers: { Cookie: authCookie },
      body: { amount: 5000, notes: 'Monthly pocket money from parents' }
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.details.monthlyAllowancePaise, 500000);
    assert.equal(data.details.monthlySpentPaise, 0);
    assert.equal(data.details.netSavingsAllocatedPaise, 0);
    assert.equal(data.details.availableToSpendPaise, 500000);
  });

  // 3. Section 6 Required Real-Life Scenario Step 1:
  // Student deposits ₹200 into a savings goal
  let goalId = '';
  await t.test('3. Section 6 Step 1: Create goal and deposit ₹200 from allowance', async () => {
    // Create goal
    const goalRes = await env.request('/api/goals', {
      method: 'POST',
      headers: { Cookie: authCookie },
      body: { title: 'Textbooks Fund', target_amount: 2000 }
    });
    assert.equal(goalRes.status, 201);
    const goalData = await goalRes.json();
    goalId = goalData.goal.id;

    // Deposit ₹200
    const depRes = await env.request(`/api/goals/${goalId}/movements`, {
      method: 'POST',
      headers: { Cookie: authCookie },
      body: { amount: 200, type: 'deposit', note: 'First book savings' }
    });
    assert.equal(depRes.status, 201);

    // Verify allowance accounting
    const allowRes = await env.request(`/api/allowances?period=${currentPeriod}`, {
      headers: { Cookie: authCookie }
    });
    assert.equal(allowRes.status, 200);
    const state = await allowRes.json();

    // EXPECTED:
    // Monthly Allowance: ₹5,000 (unchanged)
    // Monthly Spent: ₹0 (unchanged)
    // Savings Allocated: ₹200
    // Available to Spend: ₹4,800
    // Goal Balance: ₹200
    assert.equal(state.monthlyAllowancePaise, 500000, 'Monthly Allowance must remain ₹5,000');
    assert.equal(state.monthlySpentPaise, 0, 'Monthly Spent must remain strictly ₹0');
    assert.equal(state.savingsDepositsPaise, 20000, 'Savings deposits must be ₹200');
    assert.equal(state.netSavingsAllocatedPaise, 20000, 'Net savings allocated must be ₹200');
    assert.equal(state.availableToSpendPaise, 480000, 'Available to Spend must be ₹4,800');

    // Verify Goal balance
    const checkGoalRes = await env.request('/api/goals', { headers: { Cookie: authCookie } });
    const checkGoalData = await checkGoalRes.json();
    const g = checkGoalData.goals.find(x => x.id === goalId);
    assert.equal(g.current_saved_paise, 20000, 'Goal saved balance must increase by ₹200 (₹200.00)');
    assert.equal(g.analysis.progressPct, 10, 'Progress must be (200 / 2000) * 100 = 10%');
  });

  // 4. Section 6 Required Real-Life Scenario Step 2:
  // Student spends ₹500 on food
  await t.test('4. Section 6 Step 2: Spend ₹500 on food', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const txRes = await env.request('/api/transactions', {
      method: 'POST',
      headers: { Cookie: authCookie },
      body: {
        amount: 500,
        type: 'expense',
        classification: 'need',
        category_name: 'Food & Meals',
        description: 'Campus cafeteria lunch',
        date: today
      }
    });
    assert.equal(txRes.status, 201);

    // Verify allowance accounting
    const allowRes = await env.request(`/api/allowances?period=${currentPeriod}`, {
      headers: { Cookie: authCookie }
    });
    assert.equal(allowRes.status, 200);
    const state = await allowRes.json();

    // EXPECTED:
    // Monthly Allowance: ₹5,000
    // Monthly Spent: ₹500
    // Savings Allocated: ₹200
    // Available to Spend: ₹4,300 (5000 - 500 - 200)
    assert.equal(state.monthlyAllowancePaise, 500000, 'Monthly Allowance remains ₹5,000');
    assert.equal(state.monthlySpentPaise, 50000, 'Monthly Spent must be ₹500');
    assert.equal(state.netSavingsAllocatedPaise, 20000, 'Net savings allocated remains ₹200');
    assert.equal(state.availableToSpendPaise, 430000, 'Available to Spend must be strictly ₹4,300');
  });

  // 5. Section 6 Required Real-Life Scenario Step 3:
  // Student withdraws ₹50 from savings
  await t.test('5. Section 6 Step 3: Withdraw ₹50 from savings goal', async () => {
    const withdrawRes = await env.request(`/api/goals/${goalId}/movements`, {
      method: 'POST',
      headers: { Cookie: authCookie },
      body: { amount: 50, type: 'withdrawal', note: 'Photocopy emergency' }
    });
    assert.equal(withdrawRes.status, 201);

    // Verify allowance accounting
    const allowRes = await env.request(`/api/allowances?period=${currentPeriod}`, {
      headers: { Cookie: authCookie }
    });
    assert.equal(allowRes.status, 200);
    const state = await allowRes.json();

    // EXPECTED:
    // Monthly Allowance: ₹5,000
    // Monthly Spent: ₹500
    // Net Savings Allocated: ₹150 (200 - 50)
    // Available to Spend: ₹4,350 (5000 - 500 - 150)
    // Savings Goal Balance decreases by ₹50 (to ₹150)
    assert.equal(state.monthlyAllowancePaise, 500000, 'Monthly Allowance remains ₹5,000');
    assert.equal(state.monthlySpentPaise, 50000, 'Monthly Spent remains ₹500');
    assert.equal(state.savingsDepositsPaise, 20000, 'Historical deposits: ₹200');
    assert.equal(state.savingsWithdrawalsPaise, 5000, 'Historical withdrawals: ₹50');
    assert.equal(state.netSavingsAllocatedPaise, 15000, 'Net savings allocated must be ₹150');
    assert.equal(state.availableToSpendPaise, 435000, 'Available to Spend must be strictly ₹4,350');

    // Verify Goal balance
    const checkGoalRes = await env.request('/api/goals', { headers: { Cookie: authCookie } });
    const checkGoalData = await checkGoalRes.json();
    const g = checkGoalData.goals.find(x => x.id === goalId);
    assert.equal(g.current_saved_paise, 15000, 'Goal saved balance must be ₹150 (decreased by ₹50)');
    assert.equal(g.analysis.progressPct, 8, 'Progress must be (150 / 2000) * 100 = 7.5% -> 8%');
  });

  // 6. Prevent withdrawal beyond goal balance
  await t.test('6. Prevent withdrawal exceeding current saved balance', async () => {
    // Current saved is ₹150; attempt to withdraw ₹200
    const res = await env.request(`/api/goals/${goalId}/movements`, {
      method: 'POST',
      headers: { Cookie: authCookie },
      body: { amount: 200, type: 'withdrawal' }
    });
    assert.equal(res.status, 400);
    const err = await res.json();
    assert.ok(err.error.includes('Cannot withdraw more than current saved amount'));
  });

  // 7. Prevent deposit beyond available spendable funds
  await t.test('7. Prevent deposit beyond available spendable funds', async () => {
    // Available to spend is ₹4,350; attempt to deposit ₹5,000
    const res = await env.request(`/api/goals/${goalId}/movements`, {
      method: 'POST',
      headers: { Cookie: authCookie },
      body: { amount: 5000, type: 'deposit' }
    });
    assert.equal(res.status, 400);
    const err = await res.json();
    assert.ok(err.error.includes('Insufficient available balance'));
  });

  // 8. Editing allowance preserves history and updates Available to Spend
  await t.test('8. Edit allowance to ₹6,000 preserves transactions and updates available amount', async () => {
    const res = await env.request(`/api/allowances/${currentPeriod}`, {
      method: 'PUT',
      headers: { Cookie: authCookie },
      body: { amount: 6000, notes: 'Parent bonus sent' }
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    // Monthly Allowance: ₹6,000
    // Monthly Spent: ₹500
    // Net Savings Allocated: ₹150
    // Available to Spend: ₹5,350 (6000 - 500 - 150)
    assert.equal(data.details.monthlyAllowancePaise, 600000);
    assert.equal(data.details.monthlySpentPaise, 50000);
    assert.equal(data.details.netSavingsAllocatedPaise, 15000);
    assert.equal(data.details.availableToSpendPaise, 535000);
  });

  // 9. Historical Allowance Records for Previous Months
  await t.test('9. Set past month allowance and query history', async () => {
    const pastPeriod = '2026-09';
    const putRes = await env.request(`/api/allowances/${pastPeriod}`, {
      method: 'PUT',
      headers: { Cookie: authCookie },
      body: { amount: 4500, notes: 'September allowance' }
    });
    assert.equal(putRes.status, 200);

    const histRes = await env.request('/api/allowances/history', {
      headers: { Cookie: authCookie }
    });
    assert.equal(histRes.status, 200);
    const histData = await histRes.json();
    assert.equal(histData.allowances.length, 2);
    assert.equal(histData.allowances[0].period, currentPeriod);
    assert.equal(histData.allowances[1].period, '2026-09');
  });

  // 10. Multi-user isolation for allowances
  await t.test('10. Multi-user isolation: User B cannot access User A allowance or goals', async () => {
    // Register User B
    const bReg = await env.request('/api/auth/register', {
      method: 'POST',
      body: {
        email: 'user_b_isolation@college.edu',
        password: 'Password999!',
        fullName: 'Bhavna Sen'
      }
    });
    assert.equal(bReg.status, 201);
    const bCookie = extractCookie(bReg);

    // User B checks allowance: should be empty / zero
    const bAllow = await env.request(`/api/allowances?period=${currentPeriod}`, {
      headers: { Cookie: bCookie }
    });
    assert.equal(bAllow.status, 200);
    const bData = await bAllow.json();
    assert.equal(bData.hasAllowance, false);
    assert.equal(bData.monthlyAllowancePaise, 0);

    // User B attempts to withdraw from User A goal
    const bWithdraw = await env.request(`/api/goals/${goalId}/movements`, {
      method: 'POST',
      headers: { Cookie: bCookie },
      body: { amount: 50, type: 'withdrawal' }
    });
    assert.equal(bWithdraw.status, 404);
  });

  await env.close();
});

