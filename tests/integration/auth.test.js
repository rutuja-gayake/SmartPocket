import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp } from '../testHelper.js';

test('Integration - Auth Endpoints (Register, Login, Session, Logout)', async (t) => {
  const env = await createTestApp();

  await t.test('1. Reject invalid email & weak password', async () => {
    const res1 = await env.request('/api/auth/register', {
      method: 'POST',
      body: { email: 'bad-email', password: '123', fullName: 'Test' }
    });
    assert.equal(res1.status, 400);

    const res2 = await env.request('/api/auth/register', {
      method: 'POST',
      body: { email: 'valid@student.edu', password: 'short', fullName: 'Test' }
    });
    assert.equal(res2.status, 400);
  });

  let sessionCookie = '';

  await t.test('2. Successfully register a new user', async () => {
    const res = await env.request('/api/auth/register', {
      method: 'POST',
      body: {
        email: 'student@example.edu',
        password: 'Password123!',
        fullName: 'Aarav Sharma'
      }
    });

    assert.equal(res.status, 201);
    const data = await res.json();
    assert.equal(data.user.email, 'student@example.edu');
    assert.equal(data.user.fullName, 'Aarav Sharma');
    assert.ok(data.sessionId);

    const setCookie = res.headers.get('set-cookie');
    assert.ok(setCookie);
    sessionCookie = setCookie.split(';')[0];
  });

  await t.test('3. Prevent duplicate email registration', async () => {
    const res = await env.request('/api/auth/register', {
      method: 'POST',
      body: {
        email: 'student@example.edu',
        password: 'AnotherPassword123!',
        fullName: 'Another User'
      }
    });
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.ok(data.error.includes('already exists'));
  });

  await t.test('4. Fetch /api/auth/me with session cookie', async () => {
    const res = await env.request('/api/auth/me', {
      headers: { Cookie: sessionCookie }
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.user.email, 'student@example.edu');
  });

  await t.test('5. Reject invalid login credentials', async () => {
    const res = await env.request('/api/auth/login', {
      method: 'POST',
      body: {
        email: 'student@example.edu',
        password: 'WrongPassword999!'
      }
    });
    assert.equal(res.status, 401);
  });

  await t.test('6. Successful login with correct credentials', async () => {
    const res = await env.request('/api/auth/login', {
      method: 'POST',
      body: {
        email: 'student@example.edu',
        password: 'Password123!'
      }
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.user.email, 'student@example.edu');
  });

  await t.test('7. Logout and verify session revocation', async () => {
    const resLogout = await env.request('/api/auth/logout', {
      method: 'POST',
      headers: { Cookie: sessionCookie }
    });
    assert.equal(resLogout.status, 200);

    // /api/auth/me should now return 401
    const resMe = await env.request('/api/auth/me', {
      headers: { Cookie: sessionCookie }
    });
    assert.equal(resMe.status, 401);
  });

  await env.close();
});
