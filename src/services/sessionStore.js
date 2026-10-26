import crypto from 'node:crypto';
import { getDb } from '../database/db.js';
import { config } from '../config/index.js';

/**
 * Creates a new server-side session for a user in the SQLite database.
 * @param {string} userId
 * @returns {string} sessionId
 */
export function createSession(userId) {
  const db = getDb();
  const sessionId = crypto.randomBytes(32).toString('hex');
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + config.session.maxAgeMs).toISOString();

  const insert = db.prepare(`
    INSERT INTO sessions (id, user_id, expires_at, created_at)
    VALUES (?, ?, ?, ?)
  `);
  insert.run(sessionId, userId, expiresAt, createdAt);

  return sessionId;
}

/**
 * Retrieves an active session and associated user info.
 * Deletes the session if expired.
 * @param {string} sessionId
 * @returns {Object|null}
 */
export function getSession(sessionId) {
  if (!sessionId) return null;
  const db = getDb();

  const session = db.prepare(`
    SELECT s.id, s.user_id, s.expires_at, u.email, u.full_name, u.totp_enabled
    FROM sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.id = ?
  `).get(sessionId);

  if (!session) return null;

  const now = new Date().toISOString();
  if (session.expires_at < now) {
    // Session expired
    deleteSession(sessionId);
    return null;
  }

  return session;
}

/**
 * Deletes a session by ID.
 * @param {string} sessionId
 */
export function deleteSession(sessionId) {
  if (!sessionId) return;
  const db = getDb();
  db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
}

/**
 * Deletes all sessions for a user (e.g. password change or remote logout).
 * @param {string} userId
 */
export function deleteUserSessions(userId) {
  if (!userId) return;
  const db = getDb();
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
}

/**
 * Periodically deletes expired sessions from the database.
 */
export function cleanupExpiredSessions() {
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now);
}
