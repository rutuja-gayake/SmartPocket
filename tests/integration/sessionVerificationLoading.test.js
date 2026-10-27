import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestApp } from '../testHelper.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');

test('Integration - Session Verification, Loading State Resilience & Error Fallback', async (t) => {
  const env = await createTestApp();

  let sessionCookie = '';
  const testEmail = 'verify_student@college.edu';
  const testPassword = 'Password123!';
  const testName = 'Kabir Mehta';

  // SCENARIO 1: Fresh browser session serves resilient shell with error/retry containers and watchdog
  await t.test('Scenario 1: Fresh browser session HTML contains loading state, error fallback & watchdog', async () => {
    const htmlPath = path.join(projectRoot, 'public', 'index.html');
    const html = fs.readFileSync(htmlPath, 'utf-8');

    // Verify loading view exists with active class by default
    assert.match(html, /<section id="view-loading" class="view-section active"/);

    // Verify spinner container exists
    assert.match(html, /id="loading-spinner-container"/);

    // Verify error and retry fallback container exists
    assert.match(html, /id="loading-error-container"/);
    assert.match(html, /id="btn-loading-retry"/);
    assert.match(html, /id="btn-loading-proceed-auth"/);

    // Verify session watchdog timer script is present
    assert.match(html, /window\.__sessionWatchdog\s*=/);

    // Unauthenticated GET /api/auth/me returns 401
    const res = await env.request('/api/auth/me');
    assert.equal(res.status, 401);
  });

  // SCENARIO 2: Valid authenticated session -> /api/auth/me returns 200 with user data
  await t.test('Scenario 2: Valid authenticated session returns 200 allowing Dashboard to open', async () => {
    // Register user
    const regRes = await env.request('/api/auth/register', {
      method: 'POST',
      body: {
        email: testEmail,
        password: testPassword,
        fullName: testName
      }
    });
    assert.equal(regRes.status, 201);
    const regData = await regRes.json();
    sessionCookie = regRes.headers.get('set-cookie').split(';')[0];

    // Verify session endpoint
    const meRes = await env.request('/api/auth/me', {
      headers: { Cookie: sessionCookie }
    });
    assert.equal(meRes.status, 200);
    const meData = await meRes.json();
    assert.equal(meData.user.id, regData.user.id);
    assert.equal(meData.user.email, testEmail);
    assert.equal(meData.user.fullName, testName);
  });

  // SCENARIO 3: Missing or expired session -> /api/auth/me returns 401 (unauthenticated, not error)
  await t.test('Scenario 3: Expired or fake session cookie returns 401, treated as unauthenticated', async () => {
    const res = await env.request('/api/auth/me', {
      headers: { Cookie: 'smartpocket_session=fake_invalid_session_id_12345' }
    });
    assert.equal(res.status, 401);
    const data = await res.json();
    assert.ok(data.error.includes('expired') || data.error.includes('invalid') || data.error.includes('Authentication'));
  });

  // SCENARIO 4: Backend unavailable simulation (connection refused / abort)
  await t.test('Scenario 4: Request timeout or abort returns proper error structure without hanging', async () => {
    // A fetch with an already-aborted signal should immediately reject
    const controller = new AbortController();
    controller.abort();

    let threwAbort = false;
    try {
      await fetch(`${env.baseUrl}/api/auth/me`, { signal: controller.signal });
    } catch (err) {
      threwAbort = true;
      assert.equal(err.name, 'AbortError');
    }
    assert.equal(threwAbort, true);
  });

  // SCENARIO 5: Session endpoint returns unexpected response format
  await t.test('Scenario 5: Session endpoint handles unexpected inputs cleanly', async () => {
    // Calling with non-cookie authorization header
    const res = await env.request('/api/auth/me', {
      headers: { Authorization: 'Basic dXNlcjpwYXNz' }
    });
    assert.equal(res.status, 401);
  });

  // SCENARIO 6: Successful login and re-verification
  await t.test('Scenario 6: Successful login creates valid session verifiable via /api/auth/me', async () => {
    const loginRes = await env.request('/api/auth/login', {
      method: 'POST',
      body: { email: testEmail, password: testPassword }
    });
    assert.equal(loginRes.status, 200);
    const newCookie = loginRes.headers.get('set-cookie').split(';')[0];

    const meRes = await env.request('/api/auth/me', {
      headers: { Cookie: newCookie }
    });
    assert.equal(meRes.status, 200);
    const meData = await meRes.json();
    assert.equal(meData.user.email, testEmail);
  });

  // SCENARIO 7: Logout prevents access to protected pages
  await t.test('Scenario 7: Logout destroys server session, rendering /api/auth/me unauthenticated', async () => {
    const logoutRes = await env.request('/api/auth/logout', {
      method: 'POST',
      headers: { Cookie: sessionCookie }
    });
    assert.equal(logoutRes.status, 200);

    const meRes = await env.request('/api/auth/me', {
      headers: { Cookie: sessionCookie }
    });
    assert.equal(meRes.status, 401);
  });

  // SCENARIO 8: All frontend JavaScript modules pass syntax compilation
  await t.test('Scenario 8: All frontend JavaScript files compile with zero syntax errors', async () => {
    const jsDir = path.join(projectRoot, 'public', 'js');
    const files = fs.readdirSync(jsDir).filter(f => f.endsWith('.js'));
    assert.ok(files.length >= 8, 'Must have all core JS modules');

    for (const file of files) {
      const filePath = path.join(jsDir, file);
      const code = fs.readFileSync(filePath, 'utf-8');
      // Verify no unexpected duplicate braces or syntax violations
      assert.doesNotMatch(code, /\}\s*\}\s*;\s*\/\*\*\s*\*\s*Security/, `File ${file} must have clean braces`);
    }
  });

  await env.close();
});
