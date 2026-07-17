# VoteKit Roles and Invitations

Status: implementation specification  
Decision owner: Jud Campbell  
Date: 2026-07-17

## Goal

Give each VoteKit installation a protected organisation owner, allow authority to
be delegated using election terminology, and replace shared temporary passwords
with a polished, auditable invitation flow.

## Roles

| Role | Election operations | Account governance |
| --- | --- | --- |
| Owner | Full access | Appoints and removes Returning Officers, Admins, and Observers |
| Returning Officer | Full access | Appoints and removes Admins and Observers |
| Admin | Full election operations | No privileged-account management |
| Observer | Read-only | None |

The first existing active Admin is promoted to Owner during migration. There must
always be at least one active Owner. The normal user-management interface cannot
deactivate, demote, or delete an Owner; ownership transfer is a separate future
workflow requiring explicit confirmation.

For safe code rollback, the legacy `role` column remains `admin` or `observer`.
The four-level authority is stored in a separate constrained `authority_role`
column. A previous VoteKit release therefore continues to recognise Owners and
Returning Officers as legacy Admins if a release health check rolls code back.

## Invitation workflow

1. An Owner or Returning Officer enters the recipient's email, optional name,
   and an allowed role.
2. VoteKit creates a cryptographically random, single-use invitation and stores
   only its SHA-256 hash.
3. VoteKit emails an activation link. The secret is placed in the URL fragment,
   so it is not sent in the initial HTTP request or written to normal access logs.
4. The recipient sees the assigned role and expiry, then chooses their own
   password of at least 12 characters.
5. Acceptance atomically creates the active account, marks the invitation used,
   records an audit event, and redirects to sign-in.

Invitations expire after 48 hours. A replacement invitation revokes any earlier
pending invitation for the same address. Pending invitations can be resent or
revoked by an authorised role.

## Authentication decision

Email-only login codes are not the default for privileged VoteKit accounts.
Although convenient, they make the security of the election administration
account no stronger than the recipient's email account. NIST SP 800-63B-4 says
email must not be used as an out-of-band authenticator.

This release therefore uses email for one-time account activation and retains
the existing password login, rate limiting, session invalidation, and audit
logging. Passkeys/WebAuthn are the preferred future passwordless login method.

## Acceptance criteria

- Existing installations migrate without losing accounts, sessions, or audits.
- The earliest active existing Admin becomes Owner if no Owner exists.
- Owners can invite and manage Returning Officers, Admins, and Observers.
- Returning Officers can invite and manage only Admins and Observers.
- Admins retain election-management access but cannot access user management.
- Observers remain read-only.
- No role can deactivate or change an Owner through the normal API.
- A user cannot deactivate or change their own role.
- Invitation secrets are random, hashed at rest, single-use, and expire.
- Account and invitation actions are written to the admin audit log.
- Full tests, regression checks, lint, type-check, build, and audit pass.

## Deferred

- Passkey/WebAuthn enrolment and recovery.
- Formal ownership transfer.
- Multi-organisation tenancy and billing roles.
