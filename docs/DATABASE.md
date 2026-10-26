# SmartPocket Database Documentation

SmartPocket uses SQLite via Node.js's native `node:sqlite` module (`DatabaseSync`). The database operates in Write-Ahead Logging (`WAL`) mode with `foreign_keys = ON` to ensure relational integrity, atomic commits, and fast read concurrency.

---

## 1. Entity-Relationship Schema

```
 [users] 1 ----- * [sessions]
    |
    +----------- * [recovery_codes]
    |
    +----------- * [transactions] >----- 0..1 [categories]
    |
    +----------- * [budgets]
    |
    +----------- * [savings_goals] 1 ----- * [savings_movements]
    |
    +----------- 1 [sync_metadata]
```

---

## 2. Table Specifications

### 2.1 `users`
| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | TEXT | PRIMARY KEY | UUID v4 |
| `email` | TEXT | UNIQUE, NOT NULL | Normalized lowercase email |
| `password_hash` | TEXT | NOT NULL | bcrypt hash (factor 12) |
| `full_name` | TEXT | NOT NULL | Student's name |
| `totp_enabled` | INTEGER | NOT NULL DEFAULT 0 | 1 if 2FA is active, 0 otherwise |
| `totp_secret_encrypted` | TEXT | DEFAULT NULL | AES-256-GCM encrypted secret (`iv:tag:cipher`) |
| `created_at` | TEXT | NOT NULL | ISO 8601 timestamp |
| `updated_at` | TEXT | NOT NULL | ISO 8601 timestamp |

### 2.2 `sessions`
| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | TEXT | PRIMARY KEY | 64-char cryptographically random hex token |
| `user_id` | TEXT | NOT NULL, REFERENCES users(id) ON DELETE CASCADE | Scoped user |
| `expires_at` | TEXT | NOT NULL | Expiration timestamp (default 7 days) |
| `created_at` | TEXT | NOT NULL | Creation timestamp |

### 2.3 `transactions`
| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | TEXT | PRIMARY KEY | Unique UUID or client sync ID |
| `user_id` | TEXT | NOT NULL, REFERENCES users(id) ON DELETE CASCADE | Scoped user |
| `amount_paise` | INTEGER | NOT NULL | Amount in integer paise (100 paise = ₹1) |
| `type` | TEXT | CHECK(type IN ('income', 'expense', 'transfer_savings')) | Financial flow type |
| `category_id` | TEXT | REFERENCES categories(id) | Associated category |
| `category_name` | TEXT | NOT NULL | Denormalized category name for offline display |
| `classification` | TEXT | CHECK(classification IN ('income', 'need', 'want', 'savings')) | 50/30/20 category |
| `description` | TEXT | DEFAULT '' | User note |
| `date` | TEXT | NOT NULL | YYYY-MM-DD |
| `version` | INTEGER | NOT NULL DEFAULT 1 | Version counter for sync conflict resolution |
| `created_at` | TEXT | NOT NULL | ISO timestamp |
| `updated_at` | TEXT | NOT NULL | ISO timestamp |

### 2.4 `budgets`
| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | TEXT | PRIMARY KEY | UUID |
| `user_id` | TEXT | NOT NULL, REFERENCES users(id) ON DELETE CASCADE | Scoped user |
| `period` | TEXT | NOT NULL | YYYY-MM |
| `total_budget_paise` | INTEGER | NOT NULL DEFAULT 0 | Total monthly cap in paise |
| `needs_target_pct` | INTEGER | NOT NULL DEFAULT 50 | 50/30/20 target for needs |
| `wants_target_pct` | INTEGER | NOT NULL DEFAULT 30 | 50/30/20 target for wants |
| `savings_target_pct` | INTEGER | NOT NULL DEFAULT 20 | 50/30/20 target for savings |
| `version` | INTEGER | NOT NULL DEFAULT 1 | Version counter |
| `created_at` | TEXT | NOT NULL | ISO timestamp |
| `updated_at` | TEXT | NOT NULL | ISO timestamp |
| UNIQUE | | (user_id, period) | One budget per user per month |

### 2.5 `savings_goals`
| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | TEXT | PRIMARY KEY | UUID |
| `user_id` | TEXT | NOT NULL, REFERENCES users(id) ON DELETE CASCADE | Scoped user |
| `title` | TEXT | NOT NULL | Goal title (e.g. "Textbooks") |
| `target_amount_paise` | INTEGER | NOT NULL | Target goal in paise |
| `current_saved_paise` | INTEGER | NOT NULL DEFAULT 0 | Current saved amount in paise |
| `target_date` | TEXT | DEFAULT NULL | YYYY-MM-DD deadline |
| `description` | TEXT | DEFAULT '' | Goal note |
| `status` | TEXT | DEFAULT 'active' CHECK(status IN ('active', 'paused', 'completed')) | Goal state |
| `version` | INTEGER | NOT NULL DEFAULT 1 | Version counter |
| `created_at` | TEXT | NOT NULL | ISO timestamp |
| `updated_at` | TEXT | NOT NULL | ISO timestamp |

### 2.6 `savings_movements`
Audit trail of deposits and withdrawals for goals.
| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | TEXT | PRIMARY KEY | UUID |
| `goal_id` | TEXT | NOT NULL, REFERENCES savings_goals(id) ON DELETE CASCADE | Goal ID |
| `user_id` | TEXT | NOT NULL, REFERENCES users(id) ON DELETE CASCADE | User ID |
| `amount_paise` | INTEGER | NOT NULL | Positive for deposit, negative for withdrawal |
| `note` | TEXT | DEFAULT '' | Movement note |
| `created_at` | TEXT | NOT NULL | ISO timestamp |

---

## 3. Database Management Commands
- `npm run db:init`: Creates directories, tables, indexes, and default categories.
- `npm run db:seed`: Seeds demo user (`student@example.edu` / `Password123!`), realistic student transactions, monthly budget, and savings goals.

