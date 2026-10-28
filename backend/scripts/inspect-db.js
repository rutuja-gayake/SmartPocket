import { getDb, closeDb } from '../src/database/db.js';

console.log('=== SmartPocket Database Inspector ===\n');

try {
  const db = getDb();
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();

  console.log(`Database tables found (${tables.length}):`);
  for (const t of tables) {
    const count = db.prepare(`SELECT COUNT(*) AS c FROM "${t.name}"`).get().c;
    console.log(` • ${t.name.padEnd(20)}: ${count} record(s)`);
  }

  // Summary counts
  console.log('\n--- Recent Records Preview ---');
  const userCount = db.prepare("SELECT COUNT(*) AS c FROM users").get().c;
  if (userCount > 0) {
    const users = db.prepare("SELECT id, email, full_name, created_at FROM users LIMIT 5").all();
    console.log('\nUsers:');
    console.table(users);
  }

  const txCount = db.prepare("SELECT COUNT(*) AS c FROM transactions").get().c;
  if (txCount > 0) {
    const txs = db.prepare("SELECT type, classification, amount_paise / 100.0 AS amount_inr, description, date FROM transactions ORDER BY created_at DESC LIMIT 5").all();
    console.log('\nLatest Transactions:');
    console.table(txs);
  }

  const goalCount = db.prepare("SELECT COUNT(*) AS c FROM savings_goals").get().c;
  if (goalCount > 0) {
    const goals = db.prepare("SELECT title, target_amount_paise / 100.0 AS target_inr, current_saved_paise / 100.0 AS saved_inr, status FROM savings_goals LIMIT 5").all();
    console.log('\nSavings Goals:');
    console.table(goals);
  }

  const allowanceCount = db.prepare("SELECT COUNT(*) AS c FROM allowances").get().c;
  if (allowanceCount > 0) {
    const allowances = db.prepare("SELECT period, amount_paise / 100.0 AS allowance_inr, notes FROM allowances ORDER BY period DESC LIMIT 5").all();
    console.log('\nMonthly Allowances:');
    console.table(allowances);
  }
} catch (err) {
  console.error('Inspection failed:', err);
} finally {
  closeDb();
}
