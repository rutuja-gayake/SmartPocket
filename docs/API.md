# SmartPocket REST API Documentation

All endpoints return JSON and use standard HTTP status codes. Monetary inputs accept numbers in INR (Rupees), and outputs provide exact integer values in `paise` (1 INR = 100 paise) and formatted strings.

---

## 1. Authentication (`/api/auth`)

### `POST /api/auth/register`
Creates a new student account.
- **Request Body:**
  ```json
  {
    "email": "student@college.edu",
    "password": "Password123!",
    "fullName": "Aarav Sharma"
  }
  ```
- **Responses:**
  - `201 Created`: Sets `smartpocket_sid` cookie and returns user object.
  - `400 Bad Request`: Validation failure or email already taken.

### `POST /api/auth/login`
Authenticates user.
- **Request Body:**
  ```json
  {
    "email": "student@college.edu",
    "password": "Password123!"
  }
  ```
- **Responses:**
  - `200 OK`: Sets cookie and returns `{ user, sessionId }`.
  - `200 OK (2FA Challenge)`: `{ requires2fa: true, tempToken: "..." }`.
  - `401 Unauthorized`: Generic error ("Invalid email or password").

### `POST /api/auth/logout`
Destroys session in SQLite and clears the session cookie.

### `GET /api/auth/me`
Returns details of the currently authenticated user.

### `POST /api/auth/2fa/setup`
Initiates TOTP enrollment.
- **Response:**
  ```json
  {
    "secret": "JBSWY3DPEHPK3PXP",
    "qrCodeDataUrl": "data:image/png;base64,..."
  }
  ```

### `POST /api/auth/2fa/verify`
Verifies 6-digit TOTP token during enrollment or login.
- **Enrollment Payload:** `{ "secret": "...", "token": "123456" }` -> Returns `{ success: true, recoveryCodes: [...] }`.
- **Login Payload:** `{ "tempToken": "...", "token": "123456" }` -> Sets session cookie and returns user.

---

## 2. Transactions (`/api/transactions`)

### `GET /api/transactions`
Retrieves paginated transactions with financial summary totals.
- **Query Parameters:**
  - `period`: `YYYY-MM`
  - `startDate`, `endDate`: `YYYY-MM-DD`
  - `type`: `income` | `expense` | `transfer_savings`
  - `classification`: `need` | `want` | `savings` | `income`
  - `search`: String matching category or description
  - `limit`, `offset`: Pagination controls
- **Response:**
  ```json
  {
    "transactions": [...],
    "pagination": { "total": 24, "limit": 50, "offset": 0, "hasMore": false },
    "summary": {
      "total_income_paise": 1200000,
      "total_expense_paise": 485000,
      "needs_expense_paise": 320000,
      "wants_expense_paise": 165000,
      "savings_transfers_paise": 200000
    }
  }
  ```

### `POST /api/transactions`
Records a transaction in integer paise.
- **Request Body:**
  ```json
  {
    "amount": 1200.50,
    "type": "expense",
    "category_name": "Food & Groceries",
    "classification": "need",
    "description": "Hostel canteen lunch",
    "date": "2026-10-26"
  }
  ```

### `PATCH /api/transactions/:id`
Updates fields of a transaction with ownership validation.

### `DELETE /api/transactions/:id`
Deletes a transaction.

---

## 3. Budgets (`/api/budgets`)

### `GET /api/budgets?period=YYYY-MM`
Returns budget, current month actual spending, safe daily spending pace, and 50/30/20 metrics.

### `PUT /api/budgets/:period`
Upserts monthly budget target and guideline ratios.
- **Request Body:**
  ```json
  {
    "total_budget": 10000,
    "needs_target_pct": 50,
    "wants_target_pct": 30,
    "savings_target_pct": 20
  }
  ```

---

## 4. Savings Goals (`/api/goals`)

### `GET /api/goals`
Lists all user savings goals with real-time target progression.

### `POST /api/goals`
Creates a goal with title, target amount, and optional target date.

### `POST /api/goals/:id/movements`
Records a deposit or withdrawal with an audit entry and updates spendable pocket cash consistency.
- **Request Body:**
  ```json
  {
    "amount": 500,
    "type": "deposit",
    "note": "Saved from weekly allowance"
  }
  ```

---

## 5. Synchronization (`/api/sync`)

### `POST /api/sync/push`
Processes batch of offline operations queued in client IndexedDB.

### `GET /api/sync/pull?since=ISO_TIMESTAMP`
Pulls records modified or created since the given timestamp.

---

## 6. Pocket AI Advisor (`/api/advisor/query`)

### `POST /api/advisor/query`
Evaluates natural language questions against the student's actual financial data using either the offline deterministic rule engine or optional server-side Cloud AI.
- **Request Body:**
  ```json
  {
    "query": "Can I afford ₹800 shoes?",
    "preferCloud": false
  }
  ```
- **Response:**
  ```json
  {
    "answer": "Yes, you can comfortably afford ₹800.00. After this purchase, you will have ₹4,200.00 left, maintaining a safe daily spending pace of ₹381/day for the next 11 days.",
    "mode": "offline",
    "intent": "affordability"
  }
  ```
