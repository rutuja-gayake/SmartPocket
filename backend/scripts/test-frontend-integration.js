import assert from 'node:assert/strict';

const BASE_URL = 'http://127.0.0.1:3000';

async function runSimulation() {
  console.log('1. Checking Server & Health...');
  const healthRes = await fetch(`${BASE_URL}/api/health`);
  assert.equal(healthRes.status, 200, 'Health check failed');
  const healthData = await healthRes.json();
  console.log('   Health OK:', healthData.status, 'DB:', healthData.database);

  console.log('2. Checking App Shell HTML & CSP Headers...');
  const htmlRes = await fetch(`${BASE_URL}/`);
  assert.equal(htmlRes.status, 200, 'HTML failed to load');
  const csp = htmlRes.headers.get('content-security-policy');
  assert.ok(csp.includes("script-src 'self' 'unsafe-inline'"), 'CSP must allow inline scripts');
  console.log('   CSP OK:', csp);

  console.log('3. Checking Static JS & Asset Serving...');
  const assets = [
    '/js/app.js',
    '/js/api.js',
    '/js/db.js',
    '/js/sync.js',
    '/js/auth.js',
    '/js/calculations.js',
    '/js/charts.js',
    '/js/ui.js',
    '/assets/chart.umd.min.js',
    '/css/theme.css',
    '/css/main.css',
    '/service-worker.js'
  ];
  for (const asset of assets) {
    const res = await fetch(`${BASE_URL}${asset}`);
    assert.equal(res.status, 200, `Asset ${asset} failed to load (status ${res.status})`);
  }
  console.log('   All 12 critical static assets verified (HTTP 200).');

  console.log('4. Logging in as Demo Student (student@example.edu)...');
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'student@example.edu',
      password: 'Password123!'
    })
  });
  assert.equal(loginRes.status, 200, 'Demo login failed');
  const cookieHeader = loginRes.headers.get('set-cookie');
  assert.ok(cookieHeader, 'Expected set-cookie header');
  const sessionCookie = cookieHeader.split(';')[0];
  console.log('   Login successful. Session cookie received.');

  console.log('5. Verifying /api/auth/me...');
  const meRes = await fetch(`${BASE_URL}/api/auth/me`, {
    headers: { Cookie: sessionCookie }
  });
  assert.equal(meRes.status, 200);
  const meData = await meRes.json();
  console.log('   Authenticated as:', meData.user.fullName, `(${meData.user.email})`);

  console.log('6. Loading Dashboard Data (Transactions, Budget, Goals)...');
  const period = '2026-10';
  const [txRes, budgetRes, goalsRes] = await Promise.all([
    fetch(`${BASE_URL}/api/transactions?period=${period}`, { headers: { Cookie: sessionCookie } }),
    fetch(`${BASE_URL}/api/budgets?period=${period}`, { headers: { Cookie: sessionCookie } }),
    fetch(`${BASE_URL}/api/goals`, { headers: { Cookie: sessionCookie } })
  ]);
  assert.equal(txRes.status, 200);
  assert.equal(budgetRes.status, 200);
  assert.equal(goalsRes.status, 200);

  const txData = await txRes.json();
  const budgetData = await budgetRes.json();
  const goalsData = await goalsRes.json();

  console.log(`   Transactions: ${txData.transactions.length} items`);
  console.log(`   Total Income: ₹${(txData.summary.total_income_paise / 100).toFixed(2)}`);
  console.log(`   Total Expense: ₹${(txData.summary.total_expense_paise / 100).toFixed(2)}`);
  console.log(`   Safe Daily Spend: ₹${(budgetData.safeDaily.safeDailyPaise / 100).toFixed(2)}/day (${budgetData.safeDaily.status})`);
  console.log(`   Active Goals: ${goalsData.goals.length}`);

  console.log('7. Testing Add Transaction Workflow...');
  const addTxRes = await fetch(`${BASE_URL}/api/transactions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: sessionCookie
    },
    body: JSON.stringify({
      amount: 450,
      type: 'expense',
      category_name: 'Cafes & Dining Out',
      classification: 'want',
      description: 'Study group snacks',
      date: '2026-10-26'
    })
  });
  assert.equal(addTxRes.status, 201, 'Failed to add transaction');
  const createdTx = await addTxRes.json();
  console.log('   Transaction created:', createdTx.transaction.id, `₹${createdTx.transaction.amount_paise / 100}`);

  console.log('8. Testing Pocket AI Advisor Query with Groq...');
  const advisorRes = await fetch(`${BASE_URL}/api/advisor/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: sessionCookie
    },
    body: JSON.stringify({
      query: 'Can I afford ₹800 shoes?',
      preferCloud: true
    })
  });
  assert.equal(advisorRes.status, 200, 'Advisor query failed');
  const advisorData = await advisorRes.json();
  console.log('   Advisor Response Mode:', advisorData.mode, advisorData.provider || '');
  console.log('   Advisor Answer:', advisorData.answer);

  console.log('\n========================================');
  console.log('ALL WORKFLOWS AND INTEGRATIONS VERIFIED!');
  console.log('========================================');
}

runSimulation().catch((err) => {
  console.error('Simulation Failed:', err);
  process.exit(1);
});

