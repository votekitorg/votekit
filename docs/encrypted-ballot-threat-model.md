# VoteKit Local Encrypted Ballot Threat Model

Status: approved local trust boundary; implementation awaiting independent review  
Date: 2026-07-14

## Security claim

Before closure, a person who reads the VoteKit database, WAL, application files,
logs, or backups cannot read ballot choices or private receipts. During closure,
plaintext exists only transiently in the trusted closing browser's memory. Only
shuffled ballots without input identifiers are persisted or returned to VoteKit.

## Trusted components and people

- The released VoteKit client and server code.
- Jud, as the only person authorised to change or deploy that code.
- The administrator's closing browser and device during the close operation.
- Standard Web Crypto implementations and operating-system randomness.
- The administrator's handling of the offline close secret.

## Protected against

- Routine VoteKit administrators using the web interface.
- Read-only database or backup access.
- Theft or accidental disclosure of an open-election SQLite database.
- Correlation of participation order with readable ballot order.
- Accidental creation of a pre-shuffle plaintext export or temporary file.
- Replaying, duplicating, altering, or truncating encrypted ballot packages.

## Not protected against

- Jud or another person deliberately replacing the trusted application code.
- Root/physical control of the host or closing device used to inspect process or
  browser memory.
- A compromised voter device or administrator browser.
- An administrator who exposes the offline close secret before closure.
- Manipulation of the voter roll or creation of fake eligible voters.
- Statistical disclosure in very small elections.
- Voluntary receipt sharing or vote selling/coercion based on receipts.

## Critical invariants

1. Ballot plaintext and receipt are created together and encrypted in the voter
   browser before submission.
2. The server has no usable private key or close secret while voting is open.
3. The private key is stored only as an authenticated encrypted package.
4. Closing is a single whole-election operation with no decrypt-one endpoint.
5. The accepted ballot manifest is frozen before key unlock.
6. Decrypt, validate, shuffle, and rebuild occur in memory before any plaintext
   crosses the browser/server boundary.
7. Output is rebuilt from semantic ballot fields and contains no input metadata.
8. Any authentication, count, schema, or commit mismatch leaves results hidden.
9. The close secret is cleared from UI state after closure where the browser
   permits, and never enters logs, URLs, localStorage, analytics, or SQLite.

## Key custody risk

The close secret is deliberately held outside VoteKit. A database copy alone is
therefore insufficient to decrypt ballots. A recovery kit may contain the secret
and encrypted key package, but it must be stored offline and separately from
normal server backups.

There is no password reset. Loss means permanent loss of the encrypted ballots.
Copying the secret allows early decryption by someone willing to write or modify
software. This is accepted because the software operator and close-secret holder
are trusted in the standalone model.

## Small elections

Shuffling cannot hide a ballot when only one person votes, and participants in a
very small election may infer other ballots. Default individual-ballot
publication threshold should be five valid ballots. The configured consequence
must be fixed before opening: extend, cancel, or publish aggregate results only.

## Malformed ciphertext availability risk

The server can validate envelope sizes, encoding, uniqueness, and commitments,
but cannot prove that an opaque ballot decrypts to a valid answer without either
decrypting it early or requiring a substantially more complex zero-knowledge
proof. A malicious eligible voter could therefore submit a structurally valid
but undecryptable package and cause the whole-election close to fail safely.

The current candidate deliberately does not omit such a ballot, because silently
discarding accepted ciphertext would violate completeness. This is a documented
availability risk and must be addressed or explicitly accepted during the
independent security review before encrypted mode is enabled for a real election.

## Review requirement

Before real sensitive elections, independent review should cover browser
canonicalisation, padding, cryptographic primitives, key/secret UX, acceptance
atomicity, memory-only close, output rebuilding, receipts, and crash recovery.
