# Self-service account recovery (v0.15.4)

## Requirement and workflow
People who have forgotten a password must be able to request a link when ready,
without contacting an Owner. Sign in → Forgot password? → enter email → generic
check-your-email response → existing 30-minute single-use reset form → sign in.
All active account roles, including Owner, are eligible. Inactive accounts and
unaccepted invitations are not activated by recovery. Owner-assisted recovery
remains available with its existing target restrictions.

## Technical design
- Public CSRF-protected request route accepts a bounded, normalised email.
- Return identical success response for eligible, missing, inactive and throttled
  addresses. Account lookup and awaited email delivery run in Next.js `after`,
  after the response is sent, so mail delivery/account existence cannot affect
  response timing. No detached promise; no durable retry is promised. If mail
  does not arrive, the user may retry after a minute or seek assistance.
- SQLite-backed atomic admission limits: 20 requests/IP/hour, 200 globally/hour,
  5/address/hour. Hashed email rate keys; independent of login counters. Additional
  existing account cooldown (60 seconds) and five issued links/hour apply.
- Self-service requests do not revoke a still-valid earlier link. Any successful
  completion consumes its link and revokes every other link and existing session.
  Authenticated Owner-assisted replacement behaviour remains unchanged.
- Existing reset schema changes only `requested_by` to nullable. NULL explicitly
  means unauthenticated self-service, never an impersonated administrator. Rebuild
  the table transactionally preserving every field/row/index and sequence high
  water mark. Validate active target and account fingerprint at issue and consume.
- Email uses configured HTTPS origin, fragment token, hash-only token storage,
  no secret logging and credential-free audit. Failed send revokes the new link.
- No automatic real emails during implementation or release. No role, election
  access, invitation or account activation changes.

## Implementation and acceptance checklist
1. Migration and shared issuance/validation, source-aware email copy.
2. Public request route and login/forgot/invalid-link UI with current branding.
3. Tests: all roles, enumeration, deferred delivery, invalid/CSRF input, IP/email/
   global limits, failed delivery, concurrent requests, older-link survival,
   session revocation, account changes, Owner-assisted regression, data migration.
4. Browser checks: login navigation, submission states, generic success, failures,
   expired-link route back, mobile sizes. Mock email only.
5. Full release gates, fresh production-copy migration/data comparison, v0.15.4
   deployment and live health/header/database/backup verification.
