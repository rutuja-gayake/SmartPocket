import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config/index.js';
import { SCHEMA_SQL, DEFAULT_CATEGORIES } from './schema.js';

let dbInstance = null;

/**
 * Returns the active SQLite database instance.
 * @param {string} [filePath]
 * @returns {DatabaseSync}
 */
export function getDb(filePath = config.dbFile) {
  if (dbInstance) return dbInstance;

  if (filePath !== ':memory:') {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  dbInstance = new DatabaseSync(filePath);
  dbInstance.exec('PRAGMA foreign_keys = ON;');
  dbInstance.exec('PRAGMA journal_mode = WAL;');

  return dbInstance;
}

/**
 * Closes the active database connection (useful for clean test teardowns).
 */
export function closeDb() {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

/**
 * Sets a custom database instance (e.g. in-memory database for tests).
 * @param {DatabaseSync} db
 */
export function setDb(db) {
  if (dbInstance) {
    try { dbInstance.close(); } catch (_) {}
  }
  dbInstance = db;
}

/**
 * Initializes schema and default categories.
 * @param {DatabaseSync} [db]
 */
export function initDb(db = getDb()) {
  db.exec(SCHEMA_SQL);

  // Seed default categories if none exist
  const countRow = db.prepare('SELECT COUNT(*) as count FROM categories WHERE user_id IS NULL').get();
  if (countRow.count === 0) {
    const insertCat = db.prepare(`
      INSERT INTO categories (id, user_id, name, type, icon, color, is_custom, created_at)
      VALUES (?, NULL, ?, ?, ?, ?, 0, ?)
    `);

    const now = new Date().toISOString();
    for (const cat of DEFAULT_CATEGORIES) {
      insertCat.run(cat.id, cat.name, cat.type, cat.icon, cat.color, now);
    }
  }
}

