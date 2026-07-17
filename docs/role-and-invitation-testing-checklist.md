# Role and Invitation Testing Checklist

Status: automated gates pass; owner UAT pending
Date: 2026-07-17

## Automated

- [x] Existing Admin migrates to Owner.
- [x] Expanded role constraints preserve foreign-key integrity.
- [x] Migration rehearsed against an integrity-checked production backup; the
      legacy role remains `admin` while the new authority is `owner`.
- [x] Fresh bootstrap account is an Owner.
- [x] Owner can appoint a global Returning Officer.
- [x] Returning Officer can create an election and becomes its lead Returning Officer.
- [x] Election Admin and Observer invitations carry an election scope.
- [x] Admin cannot invite or change election team members.
- [x] Unassigned users cannot access an unrelated election.
- [x] Owner retains access to every election.
- [x] Admin cannot manage accounts.
- [x] Owner cannot be demoted or deactivated through the normal API.
- [x] Invitation secret has 256 random bits and only its SHA-256 hash is stored.
- [x] Invitation acceptance is single-use and creates the assigned role.
- [x] Full test, regression, lint, type-check, build, and dependency audit gates pass.

## Owner UAT before release

- [ ] Owner sees Organisation Roles and the correct role badge.
- [ ] Invitation email renders correctly in representative email clients.
- [ ] Activation link opens on desktop and mobile without exposing the secret in server logs.
- [ ] Recipient can choose a password and sign in with the assigned permissions.
- [ ] Resend invalidates the previous invitation link.
- [ ] Revoke prevents acceptance.
- [ ] Owner can deactivate and reactivate a Returning Officer.
- [ ] Returning Officer creates an election and is shown as its lead Returning Officer.
- [ ] Returning Officer can assign another global Returning Officer to that election.
- [ ] Returning Officer can invite scoped Admins and Observers from Election Team.
- [ ] Returning Officer cannot see an unrelated election created by someone else.
- [ ] Admin can manage only an assigned election and cannot manage its team.
- [ ] Observer can view only an assigned election and remains read-only.
- [ ] Removing election access leaves the person's other election assignments intact.

## Deferred security enhancement

- [ ] Add passkey/WebAuthn enrolment, login, and recovery design.
- [ ] Add a formal ownership-transfer ceremony.
