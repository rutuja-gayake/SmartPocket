# SmartPocket System Architecture

SmartPocket is an offline-first Progressive Web Application (PWA) designed for college students to manage pocket money, enforce 50/30/20 budgeting, compute safe daily spending allowances, and track savings goals.

---

## 1. High-Level Architectural Diagram

```
+-------------------------------------------------------------------------------+
|                               Browser Client (PWA)                            |
|                                                                               |
|   +-----------------------+   +--------------------+   +------------------+   |
|   |   HTML5 / CSS Tokens  |   |    ES Modules UI   |   | Chart.js (Local) |   |
|   +-----------------------+   +--------------------+   +------------------+   |
|                                                                               |
|   +-----------------------------------------------------------------------+   |
|   |           Offline Engine: Service Worker + IndexedDB                  |   |
|   |           - smartpocket_idb (Stores: tx, budgets, goals, syncQueue)   |   |
|   +-----------------------------------------------------------------------+   |
|                                     |                                         |
+-------------------------------------|-----------------------------------------+
                                      | HTTP REST / Cookies (SameSite=Lax, HttpOnly)
                                      v
+-------------------------------------------------------------------------------+
|                            Node.js Backend Server                             |
|                                                                               |
|   +-----------------------------------------------------------------------+   |
|   | Express App (Security Headers, CORS, Rate Limiters, Cookie Parser)    |   |
|   +-----------------------------------------------------------------------+   |
|                                     |                                         |
|   +-------------------+  +-------------------+  +-------------------------+   |
|   | Auth & 2FA TOTP   |  | Financial Engine  |  | Offline Pocket Advisor  |   |
|   | RFC 6238 / AES    |  | Integer Paise Math|  | Deterministic NLP Rules |   |
|   +-------------------+  +-------------------+  +-------------------------+   |
|                                     |                                         |
|   +-----------------------------------------------------------------------+   |
|   | SQLite Database (node:sqlite DatabaseSync)                            |   |
|   | Foreign keys ON, WAL mode, Scoped queries (user_id isolation)         |   |
|   +-----------------------------------------------------------------------+   |
+-------------------------------------------------------------------------------+
```

---

## 2. Core Architectural Principles

### 2.1 Integer Precision Financial Mathematics
All monetary values in calculations, API payloads, IndexedDB, and SQLite tables are stored in **integer paise** (`1 INR = 100 paise`).
- Avoids IEEE 754 floating-point inaccuracies (e.g. `0.1 + 0.2 !== 0.3`).
- Decimal conversion occurs only at the presentation boundary using `formatINR()` with the Indian numbering format (`1,23,456.78`).

### 2.2 Offline-First Strategy
- The application shell and static assets (including vendored `Chart.js`) are pre-cached by the Service Worker (`smartpocket-shell-v1`).
- The application database `smartpocket_idb` stores transactions, budgets, goals, categories, and a pending synchronization queue.
- If the student is offline:
  - Transactions and goals are immediately persisted locally.
  - Changes are recorded as pending operations in `pendingSyncQueue`.
  - When the browser fires `online`, the Synchronization Manager drains the queue to `POST /api/sync/push` and pulls remote updates via `GET /api/sync/pull`.

### 2.3 User Isolation and Security
- Authentication relies on server-side persistent sessions in SQLite.
- The `smartpocket_sid` session token is transferred in a secure `HttpOnly` cookie.
- Every API endpoint obtains the user identity strictly from `req.user.id` (never from user-submitted request bodies).
- SQLite statements use parameterized queries to prevent SQL injection.
- Passwords are encrypted with `bcryptjs` (work factor 12).
- Two-Factor Authentication uses RFC 6238 TOTP with AES-256-GCM encryption of secret keys at rest.
- Single-use backup recovery codes are stored hashed in `recovery_codes`.
