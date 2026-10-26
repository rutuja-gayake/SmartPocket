# SmartPocket Testing & Quality Assurance

SmartPocket employs Node.js's built-in native test runner (`node:test`) and assertion library (`node:assert/strict`) for rapid, isolated, and deterministic test execution.

---

## 1. Test Suite Structure

```
tests/
  testHelper.js                  # Ephemeral server & in-memory SQLite harness
  unit/
    calculations.test.js         # Pure financial formulas & edge cases
    currency.test.js             # Paise conversions & INR formatting
  integration/
    auth.test.js                 # Registration, login, session revocation
    transactions.test.js         # Transaction CRUD & financial aggregation
    budgetsAndGoals.test.js      # Budget targets, goal deposits, balance integrity
    syncAndAdvisor.test.js       # Offline sync push/pull, rule engine intents
    totp2fa.test.js              # TOTP enrollment, validation, recovery codes
    userIsolation.test.js        # Cross-user multi-tenant access prevention
```

---

## 2. Test Execution Commands

Run all tests:
```bash
npm test
```

Run unit tests only:
```bash
npm run test:unit
```

Run integration and security tests only:
```bash
npm run test:integration
```

---

## 3. Test Coverage Highlights

### 3.1 Financial Calculation Correctness
- Safe daily allowance calculation across leap years, month ends, and zero balances.
- Denominator guard preventing division by zero or negative days remaining.
- 50/30/20 guideline metrics handling zero income scenarios without errors.
- Double-counting prevention on savings deposits and withdrawals.

### 3.2 Multi-User Isolation & Security
- Verifies that User B cannot read, edit, or delete transactions created by User A.
- Verifies that User B cannot read or modify User A's savings goals.
- Verifies that session cookies are revoked on logout and expired sessions return 401.

### 3.3 Two-Factor Authentication (TOTP)
- Generates RFC 6238 TOTP secrets and QR code data URLs.
- Simulates real TOTP codes using `otpauth`.
- Enrolls and verifies 6-digit codes.
- Verifies backup recovery code generation, single-use consumption, and secure deletion.
