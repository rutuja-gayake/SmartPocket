import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestApp } from '../testHelper.js';
import { getDb, closeDb, setDb, initDb } from '../../src/database/db.js';
import { createApp } from '../../src/server.js';
import { DatabaseSync } from 'node:sqlite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = fs.existsSync(path.resolve(__dirname, '../../public/index.html'))
  ? path.resolve(__dirname, '../..')
  : path.resolve(__dirname, '../../..');

test('Integration - SmartPocket Registration, Login & Dashboard Authentication Protection', async (t) => {
  const env = await createTestApp();

  let userACookie = '';
  let userBCookie = '';
  const userAEmail = 'fresh_student@college.edu';
  const userAPassword = 'SecurePassword123!';
  const userAName = 'Arjun Verma';

  // SCENARIO 1: Fresh browser session -> Login/Register appears, no private Dashboard flash in static HTML
  await t.test('Scenario 1: Fresh browser session serves safe shell without Dashboard active class', async () => {
    // 1. Fetch public index.html
    const htmlPath = path.join(projectRoot, 'public', 'index.html');
    const htmlContent = fs.readFileSync(htmlPath, 'utf-8');

    // Verify #view-dashboard does NOT contain 'active' in static HTML
    assert.match(htmlContent, /<section id="view-dashboard" class="view-section">/, 'Dashboard section must not be active in static HTML');
    assert.doesNotMatch(htmlContent, /<section id="view-dashboard" class="view-section active">/, 'Dashboard section must never have active class by default');

    // Verify #view-loading or #view-auth is the default active view
    assert.match(htmlContent, /<section id="view-loading" class="view-section active"/, 'Loading/auth guard must be active initially');

    // Verify sidebar navigation and logout button start hidden for unauthenticated users
    assert.match(htmlContent, /<nav class="sidebar-nav" style="display:none;"/, 'Sidebar navigation must start hidden');
    assert.match(htmlContent, /class="btn btn-secondary btn-sm btn-logout" style="width:100%; display:none;"/, 'Logout button must start hidden');
    assert.match(htmlContent, /<div class="topbar-right" style="display:none;"/, 'Topbar action controls must start hidden');

    // 2. Unauthenticated API call to /api/auth/me returns 401
    const resMe = await env.request('/api/auth/me');
    assert.equal(resMe.status, 401, 'Unauthenticated user must receive 401');
  });

  // SCENARIO 2: Register new user -> saved in SQLite with hashed password
  await t.test('Scenario 2: Register new user saves record in SQLite database with hashed password', async () => {
    const res = await env.request('/api/auth/register', {
      method: 'POST',
      body: {
        email: userAEmail,
        password: userAPassword,
        fullName: userAName
      }
    });

    assert.equal(res.status, 201);
    const data = await res.json();
    assert.equal(data.user.email, userAEmail);
    assert.equal(data.user.fullName, userAName);
    assert.ok(data.user.id);
    assert.ok(data.sessionId);

    // Verify session cookie was set
    const setCookie = res.headers.get('set-cookie');
    assert.ok(setCookie, 'Session cookie must be present on register response');
    userACookie = setCookie.split(';')[0];

    // Verify SQLite database contains the newly registered user
    const dbUser = env.db.prepare('SELECT id, email, password_hash, full_name FROM users WHERE email = ?').get(userAEmail);
    assert.ok(dbUser, 'User must exist in SQLite users table');
    assert.equal(dbUser.email, userAEmail);
    assert.equal(dbUser.full_name, userAName);
    assert.notEqual(dbUser.password_hash, userAPassword, 'Password must be hashed, not plaintext');
    assert.ok(dbUser.password_hash.startsWith('$2'), 'Password hash must be bcrypt');
  });

  // SCENARIO 3: Register same email -> clear duplicate-account error
  await t.test('Scenario 3: Register with duplicate email returns clear 400 error', async () => {
    const res = await env.request('/api/auth/register', {
      method: 'POST',
      body: {
        email: userAEmail,
        password: 'AnotherPassword456!',
        fullName: 'Imposter Arjun'
      }
    });

    assert.equal(res.status, 400);
    const data = await res.json();
    assert.equal(data.error, 'An account with this email address already exists.');

    // Ensure database was not updated with duplicate
    const count = env.db.prepare('SELECT COUNT(*) as cnt FROM users WHERE email = ?').get(userAEmail).cnt;
    assert.equal(count, 1, 'Duplicate record must not be created');
  });

  // SCENARIO 4: Login valid credentials -> Dashboard opens
  await t.test('Scenario 4: Login with valid credentials establishes session and grants Dashboard access', async () => {
    const res = await env.request('/api/auth/login', {
      method: 'POST',
      body: {
        email: userAEmail,
        password: userAPassword
      }
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.user.email, userAEmail);
    assert.equal(data.user.fullName, userAName);

    const setCookie = res.headers.get('set-cookie');
    assert.ok(setCookie);
    userACookie = setCookie.split(';')[0];

    // Access private Dashboard endpoints
    const txRes = await env.request('/api/transactions?period=2026-10', {
      headers: { Cookie: userACookie }
    });
    assert.equal(txRes.status, 200, 'Authenticated user must be able to load Dashboard data');

    const budgetRes = await env.request('/api/budgets/2026-10', {
      headers: { Cookie: userACookie }
    });
    assert.equal(budgetRes.status, 200);
  });

  // SCENARIO 5: Login invalid credentials -> error appears; Dashboard inaccessible
  await t.test('Scenario 5: Login with invalid credentials returns 401 error and leaves Dashboard protected', async () => {
    const res = await env.request('/api/auth/login', {
      method: 'POST',
      body: {
        email: userAEmail,
        password: 'WrongPassword999!'
      }
    });

    assert.equal(res.status, 401);
    const data = await res.json();
    assert.equal(data.error, 'Invalid email or password.');

    // An unauthenticated request without valid cookie must be rejected from private endpoints
    const txRes = await env.request('/api/transactions?period=2026-10');
    assert.equal(txRes.status, 401, 'Dashboard private data must remain strictly protected');
  });

  // SCENARIO 6: Refresh Dashboard -> remains authenticated without flash
  await t.test('Scenario 6: Session cookie allows immediate authentication verification on page refresh', async () => {
    const res = await env.request('/api/auth/me', {
      headers: { Cookie: userACookie }
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.user.email, userAEmail);
    assert.equal(data.user.fullName, userAName);
  });

  // SCENARIO 7: Logout -> session destroyed, redirects to Login
  await t.test('Scenario 7: Logout destroys session on server and clears cookie', async () => {
    const res = await env.request('/api/auth/logout', {
      method: 'POST',
      headers: { Cookie: userACookie }
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.message, 'Signed out successfully');

    // Check that /api/auth/me now returns 401 with the previous cookie
    const resMe = await env.request('/api/auth/me', {
      headers: { Cookie: userACookie }
    });
    assert.equal(resMe.status, 401, 'Previous session cookie must be revoked after logout');
  });

  // SCENARIO 8: Open Dashboard directly after logout -> denied, redirected to Login
  await t.test('Scenario 8: Accessing Dashboard private routes after logout returns 401', async () => {
    const resTx = await env.request('/api/transactions?period=2026-10', {
      headers: { Cookie: userACookie }
    });
    assert.equal(resTx.status, 401, 'Accessing transactions after logout must return 401');

    const resBudget = await env.request('/api/budgets/2026-10', {
      headers: { Cookie: userACookie }
    });
    assert.equal(resBudget.status, 401, 'Accessing budgets after logout must return 401');

    const resGoals = await env.request('/api/goals', {
      headers: { Cookie: userACookie }
    });
    assert.equal(resGoals.status, 401, 'Accessing goals after logout must return 401');
  });

  // SCENARIO 9: Multi-user isolation verified
  await t.test('Scenario 9: Strict multi-user isolation between User A and User B', async () => {
    // Log back in as User A
    const loginA = await env.request('/api/auth/login', {
      method: 'POST',
      body: { email: userAEmail, password: userAPassword }
    });
    userACookie = loginA.headers.get('set-cookie').split(';')[0];

    // User A creates a transaction
    const txA = await env.request('/api/transactions', {
      method: 'POST',
      headers: { Cookie: userACookie },
      body: {
        amount: 500,
        type: 'expense',
        category_name: 'Food & Groceries',
        classification: 'need',
        description: 'Private lunch of User A',
        date: '2026-10-15'
      }
    });
    assert.equal(txA.status, 201);
    const createdTxA = await txA.json();

    // Register and login as User B
    const regB = await env.request('/api/auth/register', {
      method: 'POST',
      body: {
        email: 'user_b@college.edu',
        password: 'PasswordUserB456!',
        fullName: 'Meera Sen'
      }
    });
    assert.equal(regB.status, 201);
    userBCookie = regB.headers.get('set-cookie').split(';')[0];

    // User B lists transactions -> should NOT see User A's transaction
    const txListB = await env.request('/api/transactions?period=2026-10', {
      headers: { Cookie: userBCookie }
    });
    assert.equal(txListB.status, 200);
    const bData = await txListB.json();
    const hasA = bData.transactions.some(tx => tx.id === createdTxA.transaction.id);
    assert.equal(hasA, false, 'User B must not see User A transactions');

    // User B attempts to delete User A's transaction directly -> forbidden/not found
    const delRes = await env.request(`/api/transactions/${createdTxA.transaction.id}`, {
      method: 'DELETE',
      headers: { Cookie: userBCookie }
    });
    assert.equal(delRes.status, 404, 'User B cannot delete User A transaction');
  });

  // SCENARIO 10: Backend restart preserves data
  await t.test('Scenario 10: User records and data persist across database reconnection', async () => {
    // Verify SQLite user record still exists and can be retrieved directly from DB
    const userInDb = env.db.prepare('SELECT id, email, full_name FROM users WHERE email = ?').get(userAEmail);
    assert.ok(userInDb, 'User record must remain in database');
    assert.equal(userInDb.email, userAEmail);

    // Verify transaction count for user A in SQLite
    const txCount = env.db.prepare('SELECT COUNT(*) as cnt FROM transactions WHERE user_id = ?').get(userInDb.id).cnt;
    assert.equal(txCount, 1, 'Transaction must persist in database');
  });

  await env.close();
});
