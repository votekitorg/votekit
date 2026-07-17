# Role and Invitation Testing Checklist

Status: automated gates pass; owner UAT pending  
Date: 2026-07-17

## Automated

- [x] Existing Admin migrates to Owner.
- [x] Expanded role constraints preserve foreign-key integrity.
- [x] Migration rehearsed against an integrity-checked production backup; the
      legacy role remains `admin` while the new authority is `owner`.
- [x] Fresh bootstrap account is an Owner.
- [x] Owner can appoint a Returning Officer.
- [x] Returning Officer can appoint Admins and Observers only.
- [x] Admin cannot manage accounts.
- [x] Owner cannot be demoted or deactivated through the normal API.
- [x] Invitation secret has 256 random bits and only its SHA-256 hash is stored.
- [x] Invitation acceptance is single-use and creates the assigned role.
- [x] Full test, regression, lint, type-check, build, and dependency audit gates pass.

## Owner UAT before release

- [ ] Owner sees People & Roles and the correct role badge.
- [ ] Invitation email renders correctly in representative email clients.
- [ ] Activation link opens on desktop and mobile without exposing the secret in server logs.
- [ ] Recipient can choose a password and sign in with the assigned permissions.
- [ ] Resend invalidates the previous invitation link.
- [ ] Revoke prevents acceptance.
- [ ] Owner can deactivate and reactivate a Returning Officer.
- [ ] Returning Officer can manage Admins and Observers but not Owners or Returning Officers.
- [ ] Admin can manage an election but cannot see People & Roles.
- [ ] Observer remains read-only.

## Deferred security enhancement

- [ ] Add passkey/WebAuthn enrolment, login, and recovery design.
- [ ] Add a formal ownership-transfer ceremony.
