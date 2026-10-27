import dotenv from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../../');

const resolvedDbFile = process.env.DB_FILE || (
  fs.existsSync(path.join(rootDir, 'data', 'smartpocket.db'))
    ? path.join(rootDir, 'data', 'smartpocket.db')
    : path.join(rootDir, 'backend', 'data', 'smartpocket.db')
);

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || '127.0.0.1',
  rootDir,
  dbFile: resolvedDbFile,
  session: {
    secret: process.env.SESSION_SECRET || 'smartpocket-dev-secret-key-32charsmin!',
    maxAgeMs: parseInt(process.env.SESSION_MAX_AGE_MS || '604800000', 10), // 7 days
    cookieName: 'smartpocket_sid',
    secure: process.env.COOKIE_SECURE === 'true',
    sameSite: process.env.COOKIE_SAME_SITE || 'lax'
  },
  security: {
    encryptionKey: process.env.ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    bcryptWorkFactor: 12
  },
  ai: {
    provider: (process.env.AI_PROVIDER || 'none').toLowerCase(), // 'none' | 'groq' | 'gemini' | 'openai'
    apiKey: process.env.AI_API_KEY || '',
    model: process.env.AI_MODEL || (process.env.AI_PROVIDER === 'groq' ? 'openai/gpt-oss-120b' : 'gemini-1.5-flash')
  }
};

