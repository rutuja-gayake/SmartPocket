import { getDb, initDb, closeDb } from '../src/database/db.js';

console.log('Initializing SmartPocket SQLite database...');
try {
  const db = getDb();
  initDb(db);
  console.log('Database initialized successfully with schema and default categories.');
} catch (err) {
  console.error('Failed to initialize database:', err);
  process.exit(1);
} finally {
  closeDb();
}
