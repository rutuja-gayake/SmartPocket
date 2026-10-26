# SmartPocket — Student Budget & Savings Advisor

[![Node.js](https://img.shields.io/badge/Node.js-24%2B-173F35.svg)](https://nodejs.org)
[![Database](https://img.shields.io/badge/Database-SQLite%20(node:sqlite)-A8B9A5.svg)](https://nodejs.org/api/sqlite.html)
[![PWA](https://img.shields.io/badge/PWA-Offline--First-059669.svg)](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps)
[![Tests](https://img.shields.io/badge/Tests-42%20passing-173F35.svg)](tests/)

**SmartPocket** is an offline-first Progressive Web App designed specifically for college students to manage pocket money, control unnecessary spending, track expenses, and build savings habits.

The application helps students answer five critical financial questions:
1. **How much money do I currently have?**
2. **How much can I safely spend today?**
3. **Where is my money going?**
4. **Am I spending too much on wants?**
5. **Am I making progress toward my savings goals?**

Primary Currency: **Indian Rupee (₹ / INR)** with integer paise arithmetic and Indian numbering format (`₹1,23,456.78`).

---

## 1. Features

- **Safe Daily Spending Allowance:** Dynamic pace calculator (`max(0, min(balance, remainingBudget) / remainingDays)`).
- **50/30/20 Student Budgeting:** Configurable guideline tracking Essential Needs (50%), Discretionary Wants (30%), and Savings (20%).
- **Pocket AI Advisor:** Deterministic offline natural language rule engine answering affordability questions, budget health analysis, and spending breakdown without external network or API keys. Optional server-side Cloud AI support.
- **Offline-First PWA:** Full functionality without internet. Service Worker static caching and IndexedDB (`smartpocket_idb`) local storage.
- **Automatic & Manual Synchronization:** Background sync queue, retry logic, idempotent operations, and conflict resolution.
- **Savings Goals & Movements:** Target dates, suggested weekly contributions, deposit/withdrawal ledger with money-conservation guarantee.
- **Enterprise-Grade Security:** RFC 6238 TOTP two-factor authentication, QR code enrollment, encrypted secrets at rest (AES-256-GCM), 8 hashed recovery codes, bcrypt password hashing (factor 12), and strict multi-tenant data isolation.
- **Accessible & Restrained Visual Design:** Warm ivory (`#F8F7F2`), deep forest green (`#173F35`), soft mint (`#E7EFE7`), responsive desktop persistent sidebar, and mobile bottom navigation.

---

## 2. Technology Stack

- **Frontend:** Semantic HTML5, CSS3 Custom Properties (Design Tokens), Vanilla JavaScript (ES Modules), Chart.js (vendored locally for 100% offline support), IndexedDB (`smartpocket_idb`), Service Workers, Web App Manifest.
- **Backend:** Node.js (v24.18.1+), Express REST API, SQLite using native `node:sqlite` (`DatabaseSync`), bcryptjs, otpauth, qrcode, express-rate-limit.
- **Testing:** Node.js built-in test runner (`node:test`) and strict assertions (`node:assert/strict`).

---

## 3. Directory Structure

```
SmartPocket/
├── public/                     # Static PWA assets & frontend code
│   ├── index.html              # Single page application markup
│   ├── manifest.json           # Web app manifest
│   ├── service-worker.js       # App shell caching & offline fallback
│   ├── assets/                 # Icons & vendored Chart.js UMD bundle
│   ├── css/
│   │   ├── theme.css           # Color tokens & typography
│   │   └── main.css            # Responsive layout & components
│   └── js/
│       ├── app.js              # Application controller & SPA router
│       ├── api.js              # REST API client
│       ├── db.js               # IndexedDB wrapper (smartpocket_idb)
│       ├── sync.js             # Offline synchronization manager
│       ├── auth.js             # Client authentication state
│       ├── calculations.js     # Shared financial calculation formulas
│       ├── charts.js           # Chart.js visualization handlers
│       └── ui.js               # UI notifications & modal handlers
├── src/                        # Backend Node.js server
│   ├── server.js               # Express application entrypoint
│   ├── config/                 # Environment & app configuration
│   ├── database/               # SQLite schema, migrations, connection
│   ├── middleware/             # Auth, security headers, rate limiting
│   ├── routes/                 # Express REST endpoint routers
│   ├── services/               # Financial calculations, TOTP, session store, advisor
│   ├── utils/                  # Currency (paise), date utilities, crypto
│   └── validators/             # Request payload validation
├── tests/                      # Automated test suite (42 tests)
│   ├── testHelper.js           # Ephemeral server & in-memory DB harness
│   ├── unit/                   # Financial rules, dates, currency
│   └── integration/            # Auth, transactions, budgets, isolation, 2FA
├── scripts/
│   ├── init-db.js              # Initialize SQLite tables & default categories
│   └── seed-db.js              # Seed realistic demo data
├── docs/                       # Comprehensive documentation
│   ├── ARCHITECTURE.md
│   ├── DATABASE.md
│   ├── API.md
│   ├── TESTING.md
│   ├── SECURITY.md
│   └── USER_GUIDE.md
├── .env.example                # Example environment variables
├── package.json
└── README.md
```

---

## 4. Installation & Setup

### Prerequisites
- Node.js `v22.5.0` or higher (tested with `v24.18.1`).
- npm `v10.0.0` or higher.

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
*(On Windows PowerShell: `Copy-Item .env.example .env`)*

### 3. Initialize & Seed Database
```bash
# Initialize schema and default categories
npm run db:init

# Optional: Seed realistic demo data
npm run db:seed
```

Demo account credentials created by `db:seed`:
- **Email:** `student@example.edu`
- **Password:** `Password123!`

---

## 5. Running the Application

### Development Mode (with hot-reload)
```bash
npm run dev
```

### Production Mode
```bash
npm start
```
The server will start at `http://127.0.0.1:3000`.

---

## 6. Running Tests

SmartPocket includes a comprehensive automated test suite covering unit formulas, REST endpoints, user isolation, TOTP 2FA, and offline sync.

```bash
# Run all 42 tests
npm test

# Run unit tests only
npm run test:unit

# Run integration tests only
npm run test:integration
```

Actual test result:
```
✔ Financial Calculations - Available Balance
✔ Financial Calculations - Safe Daily Spending States
✔ Financial Calculations - 50/30/20 Guidelines
✔ Financial Calculations - Savings Goal Progress
✔ Currency Utilities - Integer Paise Conversions & INR Formatting
✔ Integration - Auth Endpoints (Register, Login, Session, Logout)
✔ Integration - Budgets, 50/30/20, and Savings Goals Ledger
✔ Integration - Transactions CRUD and Financial Filtering
✔ Integration - TOTP 2FA Enrollment, Verification, Recovery Codes
✔ Security Integration - Multi-User Isolation & Ownership Verification
✔ Integration - Sync Push/Pull and Pocket AI Advisor
ℹ tests 42 | pass 42 | fail 0
```

---

## 7. Financial Calculation Rules

### Available Spendable Balance
$$\text{Available Balance} = \text{Opening Balance} + \sum \text{Income} - \sum \text{Expenses} - \sum \text{Net Savings Transfers}$$

### Safe Daily Spending Allowance
$$\text{Safe Daily Allowance} = \max\left(0, \frac{\min(\text{Available Balance}, \text{Remaining Budget})}{\text{Remaining Days in Month}}\right)$$
*Remaining days is always $\ge 1$ (denominator is guarded against zero or negative values).*

---

## 8. Offline & Synchronization Strategy

1. **Service Worker:** Caches application shell, CSS design tokens, icons, and local `chart.umd.min.js`.
2. **IndexedDB:** Database `smartpocket_idb` stores transactions, budgets, goals, and pending operations locally.
3. **Queue & Sync:** When offline, writes are enqueued to `pendingSyncQueue`. When online, queued items are pushed to `POST /api/sync/push`, and remote updates are pulled via `GET /api/sync/pull`.
4. **Privacy:** Calling `logoutUser()` wipes local IndexedDB tables to prevent private financial information from leaking on shared student devices.

---

## 9. Security Design

- **Password Policy:** Minimum 8 characters, requiring letters and numbers/special characters. Hashed using `bcryptjs` (factor 12).
- **Two-Factor Authentication:** TOTP (RFC 6238) with QR code enrollment, AES-256-GCM encrypted secrets at rest, and 8 hashed backup recovery codes.
- **Session Security:** `HttpOnly`, `SameSite=Lax` cookies, with session revocation on logout.
- **Multi-Tenant Data Isolation:** Queries strictly scoped by `WHERE user_id = ?`. User identity is never accepted from the request body.

---

## 10. Troubleshooting

- **Database Lock / Busy:** SQLite runs in WAL mode. If a process terminates abruptly, restart the application with `npm start`.
- **Offline Sync Pill indicates 'Offline':** The application is working fully in local-first mode. Reconnecting to the network automatically drains pending changes.
- **Port Conflict:** Set `PORT=3001` in your `.env` file.

---

## 11. Documentation Links
- [Architecture Guide](docs/ARCHITECTURE.md)
- [Database Schema & Migration](docs/DATABASE.md)
- [REST API Reference](docs/API.md)
- [Testing & Quality Assurance](docs/TESTING.md)
- [Security & Data Privacy](docs/SECURITY.md)
- [Student User Guide](docs/USER_GUIDE.md)

---

## License
MIT License. Built for students to manage pocket money and build lasting financial habits.

