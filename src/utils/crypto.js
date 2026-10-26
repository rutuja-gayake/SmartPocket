import crypto from 'node:crypto';
import { config } from '../config/index.js';

const ALGORITHM = 'aes-256-gcm';

/**
 * Derives a 32-byte Buffer from the configured encryption key.
 */
function getKeyBuffer() {
  return crypto.createHash('sha256').update(String(config.security.encryptionKey)).digest();
}

/**
 * Encrypts a plaintext string with AES-256-GCM.
 * Returns a string formatted as "iv:authTag:ciphertext" in hex.
 * @param {string} text
 * @returns {string}
 */
export function encryptText(text) {
  if (!text) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, getKeyBuffer(), iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypts an encrypted string created by encryptText.
 * @param {string} encryptedPayload "iv:authTag:ciphertext"
 * @returns {string}
 */
export function decryptText(encryptedPayload) {
  if (!encryptedPayload) return null;
  const parts = encryptedPayload.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted payload format');
  }
  const [ivHex, authTagHex, encrypted] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, getKeyBuffer(), iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

/**
 * Hashes a recovery code for secure database storage.
 * @param {string} code
 * @returns {string}
 */
export function hashRecoveryCode(code) {
  return crypto.createHash('sha256').update(code.trim().toUpperCase()).digest('hex');
}

/**
 * Generates N cryptographically random recovery codes.
 * Format: 8 uppercase characters grouped as XXXX-XXXX
 * @param {number} count
 * @returns {string[]}
 */
export function generateRecoveryCodes(count = 8) {
  const codes = [];
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // base32 Crockford-like (no confusing 0/O/1/I)
  for (let i = 0; i < count; i++) {
    let code = '';
    const bytes = crypto.randomBytes(8);
    for (let b = 0; b < 8; b++) {
      code += chars[bytes[b] % chars.length];
    }
    codes.push(`${code.slice(0, 4)}-${code.slice(4)}`);
  }
  return codes;
}

