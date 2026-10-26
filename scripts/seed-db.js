import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { getDb, initDb, closeDb } from '../src/database/db.js';
import { getCurrentPeriod, getTodayDateString } from '../src/utils/date.js';

console.log('Seeding SmartPocket development database...');

const db = getDb();
initDb(db);

const period = getCurrentPeriod();
const today = getTodayDateString();
const now = new Date().toISOString();

const demoEmail = 'student@example.edu';
const demoPassword = 'Password123!';
const demoName = 'Aarav Sharma';

// Check if demo user already exists
let user = db.prepare('SELECT id FROM users WHERE email = ?').get(demoEmail);

if (!user) {
  const passwordHash = bcrypt.hashSync(demoPassword, 12);
  const userId = crypto.randomUUID();
  db.prepare(`
    INSERT INTO users (id, email, password_hash, full_name, totp_enabled, created_at, updated_at)
    VALUES (?, ?, ?, ?, 0, ?, ?)
  `).run(userId, demoEmail, passwordHash, demoName, now, now);
  user = { id: userId };
  console.log(`Created demo user: ${demoEmail}`);
}

const userId = user.id;

// Seed Monthly Budget (₹10,000: 50% needs, 30% wants, 20% savings)
db.prepare(`
  INSERT INTO budgets (id, user_id, period, total_budget_paise, needs_target_pct, wants_target_pct, savings_target_pct, version, created_at, updated_at)
  VALUES (?, ?, ?, 1000000, 50, 30, 20, 1, ?, ?)
  ON CONFLICT(user_id, period) DO UPDATE SET total_budget_paise = 1000000
`).run(crypto.randomUUID(), userId, period, now, now);

// Seed Transactions
const txList = [
  // Income
  { amount: 1200000, type: 'income', catId: 'cat_inc_allowance', cat: 'Pocket Money / Allowance', cls: 'income', desc: 'Monthly allowance from parents', date: `${period}-01` },
  { amount: 150000, type: 'income', catId: 'cat_inc_freelance', cat: 'Freelance / Projects', cls: 'income', desc: 'Campus web design gig', date: `${period}-08` },

  // Essential Needs (₹4,850 total)
  { amount: 220000, type: 'expense', catId: 'cat_need_food', cat: 'Food & Groceries', cls: 'need', desc: 'Hostel mess monthly advance', date: `${period}-02` },
  { amount: 85000, type: 'expense', catId: 'cat_need_books', cat: 'Books & Stationery', cls: 'need', desc: 'Engineering textbooks & notebooks', date: `${period}-05` },
  { amount: 60000, type: 'expense', catId: 'cat_need_transport', cat: 'Transport & Commute', cls: 'need', desc: 'Monthly metro pass recharge', date: `${period}-06` },
  { amount: 45000, type: 'expense', catId: 'cat_need_health', cat: 'Medicine & Healthcare', cls: 'need', desc: 'Vitamins and pharmacy essentials', date: `${period}-12` },
  { amount: 75000, type: 'expense', catId: 'cat_need_food', cat: 'Food & Groceries', cls: 'need', desc: 'Weekly fruit and dorm groceries', date: `${period}-18` },

  // Discretionary Wants (₹2,180 total)
  { amount: 42000, type: 'expense', catId: 'cat_want_cafes', cat: 'Cafes & Dining Out', cls: 'want', desc: 'Coffee and snacks with study group', date: `${period}-04` },
  { amount: 36000, type: 'expense', catId: 'cat_want_entertainment', cat: 'Entertainment & Movies', cls: 'want', desc: 'Weekend movie ticket with friends', date: `${period}-10` },
  { amount: 80000, type: 'expense', catId: 'cat_want_shopping', cat: 'Shopping & Apparel', cls: 'want', desc: 'College festival t-shirt', date: `${period}-14` },
  { amount: 60000, type: 'expense', catId: 'cat_want_cafes', cat: 'Cafes & Dining Out', cls: 'want', desc: 'Pizza celebration after midterms', date: today }
];

const insertTx = db.prepare(`
  INSERT INTO transactions (id, user_id, amount_paise, type, category_id, category_name, classification, description, date, version, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
`);

for (const tx of txList) {
  insertTx.run(crypto.randomUUID(), userId, tx.amount, tx.type, tx.catId, tx.cat, tx.cls, tx.desc, tx.date, now, now);
}

// Seed Savings Goals
const goal1Id = crypto.randomUUID();
const goal2Id = crypto.randomUUID();

db.prepare(`
  INSERT INTO savings_goals (id, user_id, title, target_amount_paise, current_saved_paise, target_date, description, status, version, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, 'active', 1, ?, ?)
`).run(goal1Id, userId, 'Semester Textbooks & Reference Guides', 300000, 150000, `${period}-28`, 'Core curriculum books', now, now);

db.prepare(`
  INSERT INTO savings_goals (id, user_id, title, target_amount_paise, current_saved_paise, target_date, description, status, version, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, 'active', 1, ?, ?)
`).run(goal2Id, userId, 'Coding Laptop Upgrade Fund', 2500000, 500000, '2027-02-15', 'MacBook / ThinkPad for project work', now, now);

// Link Savings Transfer
db.prepare(`
  INSERT INTO transactions (id, user_id, amount_paise, type, category_id, category_name, classification, description, date, version, created_at, updated_at)
  VALUES (?, ?, 200000, 'transfer_savings', 'cat_save_goal', 'Savings Goal Deposit', 'savings', 'Deposit to Textbooks & Laptop Goals', ?, 1, ?, ?)
`).run(crypto.randomUUID(), userId, `${period}-03`, now, now);

console.log('Seed completed successfully!');
console.log('----------------------------------------------------');
console.log('Demo Account:');
console.log(`Email:    ${demoEmail}`);
console.log(`Password: ${demoPassword}`);
console.log('----------------------------------------------------');

closeDb();
