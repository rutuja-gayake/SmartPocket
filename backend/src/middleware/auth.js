import { getSession } from '../services/sessionStore.js';
import { config } from '../config/index.js';

/**
 * Authentication middleware that verifies session token and populates req.user.
 * Rejects requests without valid active session with HTTP 401.
 */
export function requireAuth(req, res, next) {
  // Check cookie or Bearer token header
  let sessionId = req.cookies?.[config.session.cookieName];

  if (!sessionId && req.headers.authorization) {
    const parts = req.headers.authorization.split(' ');
    if (parts.length === 2 && parts[0] === 'Bearer') {
      sessionId = parts[1];
    }
  }

  if (!sessionId) {
    return res.status(401).json({
      error: 'Authentication required. Please sign in.'
    });
  }

  const session = getSession(sessionId);
  if (!session) {
    // Clear invalid cookie
    res.clearCookie(config.session.cookieName);
    return res.status(401).json({
      error: 'Session expired or invalid. Please sign in again.'
    });
  }

  req.user = {
    id: session.user_id,
    email: session.email,
    fullName: session.full_name,
    totpEnabled: Boolean(session.totp_enabled)
  };
  req.sessionId = session.id;

  next();
}

/**
 * Optional authentication middleware: populates req.user if present, but does not block.
 */
export function optionalAuth(req, res, next) {
  let sessionId = req.cookies?.[config.session.cookieName];
  if (!sessionId && req.headers.authorization) {
    const parts = req.headers.authorization.split(' ');
    if (parts.length === 2 && parts[0] === 'Bearer') {
      sessionId = parts[1];
    }
  }

  if (sessionId) {
    const session = getSession(sessionId);
    if (session) {
      req.user = {
        id: session.user_id,
        email: session.email,
        fullName: session.full_name,
        totpEnabled: Boolean(session.totp_enabled)
      };
      req.sessionId = session.id;
    }
  }

  next();
}

