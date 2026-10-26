import * as OTPAuth from 'otpauth';
import QRCode from 'qrcode';
import { getDb } from '../database/db.js';
import { encryptText, decryptText, generateRecoveryCodes, hashRecoveryCode } from '../utils/crypto.js';

const ISSUER = 'SmartPocket';

/**
 * Generates a new TOTP secret, enrollment URI, and QR code data URL.
 * @param {string} email
 * @returns {Promise<{ secret: string, uri: string, qrCodeDataUrl: string }>}
 */
export async function generateTotpSetup(email) {
  const secretObj = new OTPAuth.Secret({ size: 20 });
  const secret = secretObj.base32;

  const totp = new OTPAuth.TOTP({
    issuer: ISSUER,
    label: email,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: secretObj
  });

  const uri = totp.toString();
  const qrCodeDataUrl = await QRCode.toDataURL(uri, {
    errorCorrectionLevel: 'M',
    margin: 2,
    color: {
      dark: '#173F35',
      light: '#FFFFFF'
    }
  });

  return {
    secret,
    uri,
    qrCodeDataUrl
  };
}

/**
 * Validates a 6-digit TOTP code against a plaintext or decrypted secret.
 * Allows a clock drift window of 1 step (±30 seconds).
 * @param {string} token
 * @param {string} secretBase32
 * @returns {boolean}
 */
export function verifyTotpToken(token, secretBase32) {
  if (!token || !secretBase32) return false;
  try {
    const totp = new OTPAuth.TOTP({
      issuer: ISSUER,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(secretBase32)
    });

    const delta = totp.validate({
      token: token.trim(),
      window: 1
    });

    return delta !== null;
  } catch (err) {
    return false;
  }
}

/**
 * Saves encrypted TOTP secret, generates 8 hashed recovery codes, and marks 2FA enabled.
 * Runs atomically in a database transaction.
 * @param {string} userId
 * @param {string} secretBase32
 * @returns {string[]} Array of plaintext recovery codes for user backup
 */
export function enableTotpForUser(userId, secretBase32) {
  const db = getDb();
  const encryptedSecret = encryptText(secretBase32);
  const recoveryCodes = generateRecoveryCodes(8);
  const now = new Date().toISOString();

  // Atomically update user and store hashed recovery codes
  db.exec('BEGIN TRANSACTION;');
  try {
    db.prepare(`
      UPDATE users
      SET totp_enabled = 1, totp_secret_encrypted = ?, updated_at = ?
      WHERE id = ?
    `).run(encryptedSecret, now, userId);

    // Delete any old recovery codes
    db.prepare('DELETE FROM recovery_codes WHERE user_id = ?').run(userId);

    const insertCode = db.prepare(`
      INSERT INTO recovery_codes (id, user_id, code_hash, used, created_at)
      VALUES (?, ?, ?, 0, ?)
    `);

    for (const code of recoveryCodes) {
      const codeId = crypto.randomUUID();
      insertCode.run(codeId, userId, hashRecoveryCode(code), now);
    }

    db.exec('COMMIT;');
    return recoveryCodes;
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }
}

/**
 * Disables 2FA and deletes recovery codes for user.
 * @param {string} userId
 */
export function disableTotpForUser(userId) {
  const db = getDb();
  const now = new Date().toISOString();

  db.exec('BEGIN TRANSACTION;');
  try {
    db.prepare(`
      UPDATE users
      SET totp_enabled = 0, totp_secret_encrypted = NULL, updated_at = ?
      WHERE id = ?
    `).run(now, userId);

    db.prepare('DELETE FROM recovery_codes WHERE user_id = ?').run(userId);
    db.exec('COMMIT;');
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }
}

/**
 * Validates and consumes a single-use recovery code.
 * @param {string} userId
 * @param {string} recoveryCode
 * @returns {boolean}
 */
export function verifyAndConsumeRecoveryCode(userId, recoveryCode) {
  if (!recoveryCode) return false;
  const db = getDb();
  const hash = hashRecoveryCode(recoveryCode);

  const codeRow = db.prepare(`
    SELECT id, used FROM recovery_codes
    WHERE user_id = ? AND code_hash = ? AND used = 0
  `).get(userId, hash);

  if (!codeRow) return false;

  const now = new Date().toISOString();
  db.prepare(`
    UPDATE recovery_codes
    SET used = 1, used_at = ?
    WHERE id = ?
  `).run(now, codeRow.id);

  return true;
}

/**
 * Retrieves the decrypted TOTP secret for a user.
 * @param {string} userId
 * @returns {string|null}
 */
export function getUserTotpSecret(userId) {
  const db = getDb();
  const user = db.prepare('SELECT totp_secret_encrypted FROM users WHERE id = ?').get(userId);
  if (!user || !user.totp_secret_encrypted) return null;
  return decryptText(user.totp_secret_encrypted);
}
