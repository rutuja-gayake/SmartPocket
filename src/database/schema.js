/**
 * SmartPocket Database Schema & Default Seed Data
 */

export const SCHEMA_SQL = `
-- Users table
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  totp_enabled INTEGER NOT NULL DEFAULT 0,
  totp_secret_encrypted TEXT DEFAULT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Sessions table
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

-- 2FA Recovery Codes table
CREATE TABLE IF NOT EXISTS recovery_codes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  used_at TEXT DEFAULT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_recovery_codes_user ON recovery_codes(user_id);

-- Categories table
CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('income', 'need', 'want', 'savings')),
  icon TEXT DEFAULT 'tag',
  color TEXT DEFAULT '#173F35',
  is_custom INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_categories_user ON categories(user_id);

-- Transactions table
CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount_paise INTEGER NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('income', 'expense', 'transfer_savings')),
  category_id TEXT REFERENCES categories(id),
  category_name TEXT NOT NULL,
  classification TEXT NOT NULL CHECK(classification IN ('income', 'need', 'want', 'savings')),
  description TEXT DEFAULT '',
  date TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON transactions(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_user_type ON transactions(user_id, type);
CREATE INDEX IF NOT EXISTS idx_transactions_user_classification ON transactions(user_id, classification);

-- Monthly Budgets table
CREATE TABLE IF NOT EXISTS budgets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period TEXT NOT NULL,
  total_budget_paise INTEGER NOT NULL DEFAULT 0,
  needs_target_pct INTEGER NOT NULL DEFAULT 50,
  wants_target_pct INTEGER NOT NULL DEFAULT 30,
  savings_target_pct INTEGER NOT NULL DEFAULT 20,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(user_id, period)
);
CREATE INDEX IF NOT EXISTS idx_budgets_user_period ON budgets(user_id, period);

-- Savings Goals table
CREATE TABLE IF NOT EXISTS savings_goals (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  target_amount_paise INTEGER NOT NULL,
  current_saved_paise INTEGER NOT NULL DEFAULT 0,
  target_date TEXT DEFAULT NULL,
  description TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'paused', 'completed')),
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_savings_goals_user ON savings_goals(user_id);

-- Savings Movements table (Audit trail for goal deposits/withdrawals)
CREATE TABLE IF NOT EXISTS savings_movements (
  id TEXT PRIMARY KEY,
  goal_id TEXT NOT NULL REFERENCES savings_goals(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount_paise INTEGER NOT NULL,
  note TEXT DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_savings_movements_goal ON savings_movements(goal_id);
CREATE INDEX IF NOT EXISTS idx_savings_movements_user ON savings_movements(user_id);

-- Synchronization Metadata table
CREATE TABLE IF NOT EXISTS sync_metadata (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  last_sync_timestamp TEXT NOT NULL
);
`;

export const DEFAULT_CATEGORIES = [
  // Income
  { id: 'cat_inc_allowance', name: 'Pocket Money / Allowance', type: 'income', icon: 'wallet', color: '#173F35' },
  { id: 'cat_inc_stipend', name: 'Stipend / Part-time', type: 'income', icon: 'briefcase', color: '#276749' },
  { id: 'cat_inc_freelance', name: 'Freelance / Projects', type: 'income', icon: 'laptop', color: '#2C7A7B' },
  { id: 'cat_inc_scholarship', name: 'Scholarship / Grants', type: 'income', icon: 'award', color: '#319795' },
  { id: 'cat_inc_gift', name: 'Gift / Cash Received', type: 'income', icon: 'gift', color: '#38A169' },
  { id: 'cat_inc_other', name: 'Other Income', type: 'income', icon: 'plus-circle', color: '#48BB78' },

  // Needs (Essential 50%)
  { id: 'cat_need_food', name: 'Food & Groceries', type: 'need', icon: 'shopping-cart', color: '#2E7D32' },
  { id: 'cat_need_transport', name: 'Transport & Commute', type: 'need', icon: 'navigation', color: '#1565C0' },
  { id: 'cat_need_books', name: 'Books & Stationery', type: 'need', icon: 'book', color: '#6A1B9A' },
  { id: 'cat_need_education', name: 'Education & Fees', type: 'need', icon: 'award', color: '#4527A0' },
  { id: 'cat_need_rent', name: 'Rent & Hostel Bills', type: 'need', icon: 'home', color: '#00695C' },
  { id: 'cat_need_health', name: 'Medicine & Healthcare', type: 'need', icon: 'heart', color: '#C2185B' },
  { id: 'cat_need_other', name: 'Other Essentials', type: 'need', icon: 'check-circle', color: '#37474F' },

  // Wants (Discretionary 30%)
  { id: 'cat_want_cafes', name: 'Cafes & Dining Out', type: 'want', icon: 'coffee', color: '#D97706' },
  { id: 'cat_want_shopping', name: 'Shopping & Apparel', type: 'want', icon: 'shopping-bag', color: '#DC2626' },
  { id: 'cat_want_entertainment', name: 'Entertainment & Movies', type: 'want', icon: 'film', color: '#9333EA' },
  { id: 'cat_want_gaming', name: 'Gaming & Tech Hobbies', type: 'want', icon: 'play', color: '#2563EB' },
  { id: 'cat_want_subs', name: 'Subscriptions & Media', type: 'want', icon: 'tv', color: '#059669' },
  { id: 'cat_want_travel', name: 'Travel & Outings', type: 'want', icon: 'map-pin', color: '#E11D48' },
  { id: 'cat_want_other', name: 'Other Discretionary', type: 'want', icon: 'smile', color: '#6B7280' },

  // Savings (20%)
  { id: 'cat_save_goal', name: 'Savings Goal Deposit', type: 'savings', icon: 'piggy-bank', color: '#10B981' }
];

