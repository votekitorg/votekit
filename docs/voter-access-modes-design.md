# VoteKit voter access modes

## Decision

Each election chooses one access model while it is a draft:

1. `voter_roll`: eligibility is attached to an imported voter record. A voter
   may authenticate by email OTP, SMS phone verification, or a VoteKit-issued
   one-click link.
2. `anonymous_codes`: an administrator generates a fixed pool of single-use
   codes without importing personal details. Each code also has a link form.

The access model is immutable after opening.

## Anonymous-code privacy

- Generate codes with at least 128 bits of cryptographic randomness.
- Return plaintext codes and links only in the generation response. Store only
  SHA-256 hashes in SQLite.
- Put link credentials in the URL fragment so reverse proxies, access logs, and
  referrer headers do not receive the plaintext code.
- Code validation creates a short-lived HTTP-only voter session. The code is
  consumed atomically with ballot submission, not when the link is opened.
- Participation stores only the anonymous code row ID and never a receipt code,
  ballot ID, choices, or timestamp.
- Ballots remain in the existing anonymous ballot tables. Close-time shuffling
  and session cleanup remain mandatory.
- Encrypted-ballot mode is initially restricted to voter-roll elections until
  its envelope tables support anonymous credentials explicitly.

## Registered-voter privacy

- Email and phone are alternative eligibility identifiers; at least one is
  required per voter record.
- Phone numbers are normalized to E.164 before storage and lookup.
- One-click voter-link tokens are high entropy and stored only as hashes.
- Authentication sessions identify the voter-roll row internally, avoiding
  ambiguous email/phone lookups.
- No authentication mechanism may store a voter-to-receipt or voter-to-ballot
  relationship.

## Lifecycle guardrails

- Draft voter-roll elections need at least one voter before opening.
- Draft anonymous-code elections need at least one generated code before opening.
- Voter records, access mode, and code pool are locked after opening.
- Code generation is capped per request and audited by count only. Plaintext
  codes never enter the audit log.

## Release checks

- Migration preserves all current elections, voter IDs, participation, votes,
  sessions, and admin roles.
- One code cannot cast two ballots, including concurrent submissions.
- Opening rules match the selected access model.
- Invalid code responses do not reveal valid/used state before authentication.
- Close removes voter sessions and temporary verification artifacts.
- Existing email elections and all current regression tests continue to pass.
