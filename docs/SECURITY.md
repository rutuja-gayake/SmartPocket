# SmartPocket Security & Data Privacy

SmartPocket is engineered with student financial privacy and security as primary design requirements.

---

## 1. Password Security
- User passwords are validated for minimum length (8+ chars) and character complexity.
- Passwords are hashed using `bcryptjs` with a work factor of 12.
- Authentication responses use generic error messages ("Invalid email or password") to prevent user enumeration.

---

## 2. Session Management
- Sessions are stored in the server-side SQLite `sessions` table.
- Session IDs are 64-character cryptographically random hex strings.
- Cookies are issued with:
  - `HttpOnly`: Prevents client-side script access to session tokens.
  - `SameSite=Lax`: Defends against Cross-Site Request Forgery (CSRF).
  - `Secure`: Can be toggled to `true` in HTTPS environments via `COOKIE_SECURE=true`.
- Sessions are regenerated upon login and invalidated on logout.

---

## 3. Two-Factor Authentication (TOTP)
- Standard RFC 6238 time-based one-time passwords compatible with Google Authenticator, Authy, Microsoft Authenticator, and 1Password.
- Encrypted secrets at rest using AES-256-GCM.
- 8 single-use recovery codes generated during enrollment; stored hashed (SHA-256) and immediately consumed upon use.
- Re-authentication with account password required before disabling 2FA.

---

## 4. Multi-Tenant Data Isolation
- User ID is derived exclusively from the verified server-side session.
- Client-supplied IDs in request bodies are never trusted to establish identity.
- Database queries scope all operations by `WHERE user_id = ?`.

---

## 5. Security Headers & Rate Limiting
- `Content-Security-Policy`: Restricts resource loading to self and trusted inline tokens.
- `X-Frame-Options: DENY`: Defends against clickjacking.
- `X-Content-Type-Options: nosniff`: Prevents MIME-sniffing.
- `Referrer-Policy: strict-origin-when-cross-origin`.
- Rate limiting middleware restricts login and registration attempts to 30 requests per 15 minutes per IP address.

