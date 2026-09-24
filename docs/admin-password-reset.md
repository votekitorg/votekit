# Owner-assisted password recovery

## Scope and workflow
Owner selects **Send password reset** for an active non-Owner account in
Organisation Roles and confirms the recipient. The existing email address is
used; no manual password entry or account deactivation. Recipient opens a link,
enters and confirms a new password, then signs in normally. No automatic email
is sent to Guy or any real account during release/testing. No public reset-request
endpoint, Owner-account recovery or changes to invitation/role permissions.

## Security and data design
- Additive `admin_password_resets` table; 256-bit random token, SHA-256 digest
  only in storage, 30-minute expiry, single-use atomic completion.
- Link uses configured HTTPS origin, token in fragment (removed immediately),
  no-referrer/no-store page; no tokens/passwords in audit, logs or API responses.
- Owner-only sending, CSRF throughout, target active/non-Owner, 60-second resend
  cooldown, five requests per account/hour and 20 per Owner/hour. Public token
  operations rate limited separately from login.
- New requests revoke old links. Failed email submission revokes that link.
- Completion rechecks active recipient, active Owner issuer, expiry and account
  fingerprint after password hashing, atomically updates password, consumes link,
  revokes other reset links and all recipient sessions, and writes audit history.
- Email/role/password/activation changes revoke outstanding recovery links.
- Sending alone never changes password, active state, sessions or election scope.
- Completion sends a password-changed notice without credentials. Delivery failure
  does not undo a completed reset; audit records notification failure.
- New passwords require at least 12 characters; values exceeding bcrypt's 72-byte
  input limit are rejected rather than silently truncated.

Based on [OWASP password-recovery guidance](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html).

## Acceptance / release plan
Test Owner-only/CSRF/target guards, token secrecy/expiry/replacement/replay,
concurrent consumption, delivery failure, changed/deactivated account, stale
links after manual account edits, unchanged role/teams, session revocation and
normal sign-in. Mock all email delivery in tests. Browser-test confirmation,
failure/success, reset validation and mobile layout. Run full release gates and
production-copy migration rehearsal; release v0.15.3 and verify preserved data,
exact live SHA, services and backups. Migration is additive and rollback-compatible.
