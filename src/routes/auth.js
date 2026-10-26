import express from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { getDb } from '../database/db.js';
import { config } from '../config/index.js';
import { createSession, deleteSession } from '../services/sessionStore.js';
import {
  generateTotpSetup,
  verifyTotpToken,
  enableTotpForUser,
  disableTotpForUser,
  verifyAndConsumeRecoveryCode,
  getUserTotpSecret
} from '../services/totp.js';
import { requireAuth } from '../middleware/auth.js';
import { authRateLimiter } from '../middleware/rateLimit.js';
import { validateEmail, validatePassword } from '../validators/index.js';

export const authRouter = express.Router();

// In-memory store for pending 2FA login verifications: tempToken -> { userId, expiresAt }
const pending2faLogins = new Map();

function cleanPending2fa() {
  const now = Date.now();
  for (const [token, data] of pending2faLogins.entries()) {
    if (data.expiresAt < now) pending2faLogins.delete(token);
  }
}

/**
 * Cookie helper
 */
function setSessionCookie(res, sessionId) {
  res.cookie(config.session.cookieName, sessionId, {
    httpOnly: true,
    secure: config.session.secure,
    sameSite: config.session.sameSite,
    maxAge: config.session.maxAgeMs,
    path: '/'
  });
}

/**
 * POST /api/auth/register
 */
authRouter.post('/register', authRateLimiter, async (req, res) => {
  try {
    const { email, password, fullName } = req.body;

    if (!validateEmail(email)) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }
    if (!validatePassword(password)) {
      return res.status(400).json({
        error: 'Password must be at least 8 characters long and contain both letters and numbers/special characters.'
      });
    }
    if (!fullName || typeof fullName !== 'string' || fullName.trim().length === 0) {
      return res.status(400).json({ error: 'Full name is required.' });
    }

    const db = getDb();
    const normalizedEmail = email.trim().toLowerCase();

    const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail);
    if (existingUser) {
      return res.status(400).json({ error: 'An account with this email address already exists.' });
    }

    const passwordHash = await bcrypt.hash(password, config.security.bcryptWorkFactor);
    const userId = crypto.randomUUID();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO users (id, email, password_hash, full_name, totp_enabled, created_at, updated_at)
      VALUES (?, ?, ?, ?, 0, ?, ?)
    `).run(userId, normalizedEmail, passwordHash, fullName.trim(), now, now);

    const sessionId = createSession(userId);
    setSessionCookie(res, sessionId);

    return res.status(201).json({
      message: 'Account created successfully',
      user: {
        id: userId,
        email: normalizedEmail,
        fullName: fullName.trim(),
        totpEnabled: false
      },
      sessionId
    });
  } catch (err) {
    console.error('Registration error:', err);
    return res.status(500).json({ error: 'Failed to create account. Please try again.' });
  }
});

/**
 * POST /api/auth/login
 */
authRouter.post('/login', authRateLimiter, async (req, res) => {
  try {
    cleanPending2fa();
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const db = getDb();
    const normalizedEmail = String(email).trim().toLowerCase();

    const user = db.prepare(`
      SELECT id, email, password_hash, full_name, totp_enabled
      FROM users WHERE email = ?
    `).get(normalizedEmail);

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    // If TOTP is enabled, require 2FA verification step
    if (user.totp_enabled) {
      const tempToken = crypto.randomBytes(32).toString('hex');
      pending2faLogins.set(tempToken, {
        userId: user.id,
        email: user.email,
        expiresAt: Date.now() + 5 * 60 * 1000 // 5 minutes validity
      });

      return res.json({
        requires2fa: true,
        tempToken,
        message: 'Two-factor authentication code required.'
      });
    }

    // Standard login without 2FA
    const sessionId = createSession(user.id);
    setSessionCookie(res, sessionId);

    return res.json({
      message: 'Signed in successfully',
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        totpEnabled: false
      },
      sessionId
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Failed to sign in. Please try again.' });
  }
});

/**
 * POST /api/auth/logout
 */
authRouter.post('/logout', (req, res) => {
  const sessionId = req.cookies?.[config.session.cookieName] ||
    (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null);

  if (sessionId) {
    deleteSession(sessionId);
  }
  res.clearCookie(config.session.cookieName);
  return res.json({ message: 'Signed out successfully' });
});

/**
 * GET /api/auth/me
 */
authRouter.get('/me', requireAuth, (req, res) => {
  return res.json({
    user: req.user
  });
});

/**
 * POST /api/auth/2fa/setup
 */
authRouter.post('/2fa/setup', requireAuth, async (req, res) => {
  try {
    const setup = await generateTotpSetup(req.user.email);
    return res.json({
      secret: setup.secret,
      qrCodeDataUrl: setup.qrCodeDataUrl
    });
  } catch (err) {
    console.error('2FA setup error:', err);
    return res.status(500).json({ error: 'Failed to initiate 2FA setup.' });
  }
});

/**
 * POST /api/auth/2fa/verify
 * Supports two flows:
 * 1. Activation during setup: req.user is authenticated, passes { secret, token }
 * 2. Completion during login: unauthenticated, passes { tempToken, token }
 */
authRouter.post('/2fa/verify', authRateLimiter, (req, res) => {
  try {
    const { token, secret, tempToken } = req.body;

    if (!token || typeof token !== 'string') {
      return res.status(400).json({ error: 'A 6-digit verification code is required.' });
    }

    // Flow 1: Enabling 2FA while signed in
    if (secret) {
      if (!req.cookies?.[config.session.cookieName] && !req.headers.authorization) {
        return res.status(401).json({ error: 'Authentication required to enable 2FA.' });
      }

      // Read current authenticated user
      let sid = req.cookies?.[config.session.cookieName];
      if (!sid && req.headers.authorization?.startsWith('Bearer ')) {
        sid = req.headers.authorization.slice(7);
      }
      const db = getDb();
      const session = db.prepare('SELECT user_id FROM sessions WHERE id = ?').get(sid);
      if (!session) {
        return res.status(401).json({ error: 'Invalid session.' });
      }

      const isValid = verifyTotpToken(token, secret);
      if (!isValid) {
        return res.status(400).json({ error: 'Invalid authenticator code. Check your device time and try again.' });
      }

      const recoveryCodes = enableTotpForUser(session.user_id, secret);
      return res.json({
        success: true,
        message: 'Two-factor authentication successfully enabled.',
        recoveryCodes
      });
    }

    // Flow 2: Completing login with 2FA
    if (tempToken) {
      cleanPending2fa();
      const pending = pending2faLogins.get(tempToken);
      if (!pending || pending.expiresAt < Date.now()) {
        pending2faLogins.delete(tempToken);
        return res.status(400).json({ error: '2FA session expired. Please sign in again.' });
      }

      const secretBase32 = getUserTotpSecret(pending.userId);
      if (!secretBase32) {
        return res.status(500).json({ error: 'User 2FA secret not found.' });
      }

      const isValid = verifyTotpToken(token, secretBase32);
      if (!isValid) {
        return res.status(401).json({ error: 'Invalid authenticator code. Please try again.' });
      }

      pending2faLogins.delete(tempToken);

      const db = getDb();
      const user = db.prepare('SELECT id, email, full_name, totp_enabled FROM users WHERE id = ?').get(pending.userId);
      const sessionId = createSession(user.id);
      setSessionCookie(res, sessionId);

      return res.json({
        message: 'Signed in successfully with 2FA',
        user: {
          id: user.id,
          email: user.email,
          fullName: user.full_name,
          totpEnabled: true
        },
        sessionId
      });
    }

    return res.status(400).json({ error: 'Invalid verification request parameters.' });
  } catch (err) {
    console.error('2FA verification error:', err);
    return res.status(500).json({ error: 'Verification failed.' });
  }
});

/**
 * POST /api/auth/2fa/recovery
 * Log in using a one-time recovery code
 */
authRouter.post('/api/auth/2fa/recovery', authRateLimiter, (req, res) => {
  try {
    const { tempToken, recoveryCode } = req.body;

    if (!tempToken || !recoveryCode) {
      return res.status(400).json({ error: 'Temporary token and recovery code are required.' });
    }

    cleanPending2fa();
    const pending = pending2faLogins.get(tempToken);
    if (!pending || pending.expiresAt < Date.now()) {
      pending2faLogins.delete(tempToken);
      return res.status(400).json({ error: '2FA session expired. Please sign in again.' });
    }

    const isValid = verifyAndConsumeRecoveryCode(pending.userId, recoveryCode);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid or already used recovery code.' });
    }

    pending2faLogins.delete(tempToken);

    const db = getDb();
    const user = db.prepare('SELECT id, email, full_name, totp_enabled FROM users WHERE id = ?').get(pending.userId);
    const sessionId = createSession(user.id);
    setSessionCookie(res, sessionId);

    return res.json({
      message: 'Signed in successfully using backup recovery code.',
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        totpEnabled: true
      },
      sessionId
    });
  } catch (err) {
    console.error('2FA recovery code error:', err);
    return res.status(500).json({ error: 'Failed to process recovery code.' });
  }
});

/**
 * POST /api/auth/2fa/disable
 */
authRouter.post('/2fa/disable', requireAuth, async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) {
      return res.status(400).json({ error: 'Password confirmation is required to disable 2FA.' });
    }

    const db = getDb();
    const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Incorrect password.' });
    }

    disableTotpForUser(req.user.id);

    return res.json({
      success: true,
      message: 'Two-factor authentication has been disabled.'
    });
  } catch (err) {
    console.error('Disable 2FA error:', err);
    return res.status(500).json({ error: 'Failed to disable 2FA.' });
  }
});
