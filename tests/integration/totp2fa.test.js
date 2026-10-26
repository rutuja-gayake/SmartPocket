import test from 'node:test';
import assert from 'node:assert/strict';
import * as OTPAuth from 'otpauth';
import { createTestApp } from '../testHelper.js';

test('Integration - TOTP 2FA Enrollment, Verification, Recovery Codes, and Disable', async (t) => {
  const env = await createTestApp();

  // Register user
  const regRes = await env.request('/api/auth/register', {
    method: 'POST',
    body: { email: 'totp_user@test.edu', password: 'Password123!', fullName: 'Vikram Joshi' }
  });
  const cookie = regRes.headers.get('set-cookie').split(';')[0];

  let totpSecret = '';
  let recoveryCodes = [];

  await t.test('1. Setup 2FA: generates secret and QR code', async () => {
    const res = await env.request('/api/auth/2fa/setup', {
      method: 'POST',
      headers: { Cookie: cookie }
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(data.secret);
    assert.ok(data.qrCodeDataUrl.startsWith('data:image/png;base64,'));
    totpSecret = data.secret;
  });

  await t.test('2. Enable 2FA: verifies 6-digit TOTP code and returns backup recovery codes', async () => {
    // Generate valid TOTP token using otpauth
    const totp = new OTPAuth.TOTP({
      issuer: 'SmartPocket',
      label: 'totp_user@test.edu',
      secret: OTPAuth.Secret.fromBase32(totpSecret)
    });
    const validCode = totp.generate();

    const verifyRes = await env.request('/api/auth/2fa/verify', {
      method: 'POST',
      headers: { Cookie: cookie },
      body: {
        secret: totpSecret,
        token: validCode
      }
    });

    assert.equal(verifyRes.status, 200);
    const data = await verifyRes.json();
    assert.equal(data.success, true);
    assert.equal(data.recoveryCodes.length, 8);
    recoveryCodes = data.recoveryCodes;
  });

  let tempToken = '';

  await t.test('3. Login with 2FA enabled: triggers 2FA challenge', async () => {
    const loginRes = await env.request('/api/auth/login', {
      method: 'POST',
      body: {
        email: 'totp_user@test.edu',
        password: 'Password123!'
      }
    });

    assert.equal(loginRes.status, 200);
    const data = await loginRes.json();
    assert.equal(data.requires2fa, true);
    assert.ok(data.tempToken);
    tempToken = data.tempToken;
  });

  await t.test('4. Complete 2FA login with valid code', async () => {
    const totp = new OTPAuth.TOTP({
      issuer: 'SmartPocket',
      label: 'totp_user@test.edu',
      secret: OTPAuth.Secret.fromBase32(totpSecret)
    });
    const code = totp.generate();

    const completeRes = await env.request('/api/auth/2fa/verify', {
      method: 'POST',
      body: {
        tempToken,
        token: code
      }
    });

    assert.equal(completeRes.status, 200);
    const data = await completeRes.json();
    assert.equal(data.user.email, 'totp_user@test.edu');
    assert.equal(data.user.totpEnabled, true);
  });

  await t.test('5. Disable 2FA with password confirmation', async () => {
    const disableRes = await env.request('/api/auth/2fa/disable', {
      method: 'POST',
      headers: { Cookie: cookie },
      body: { password: 'Password123!' }
    });
    assert.equal(disableRes.status, 200);
    const data = await disableRes.json();
    assert.equal(data.success, true);
  });

  await env.close();
});
