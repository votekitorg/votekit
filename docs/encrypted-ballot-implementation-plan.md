# VoteKit Standalone Encrypted Ballot Implementation Plan

Status: milestones 0-4 implemented; milestone 5 release gates remain  
Date: 2026-07-14

## Delivery rule

Keep the live legacy path unchanged until the complete local encrypted path has
passed staging, independent review, recovery rehearsal, and owner UAT. No cloud
service is required.

## Milestone 0 - local protocol feasibility

Implemented and covered by reproducible Web Crypto tests.

- Prove browser-compatible RSA-OAEP/AES-GCM envelope creation.
- Prove equal package length across ballot shapes.
- Prove encrypted private-key package plus offline 256-bit close secret.
- Prove complete in-memory decrypt, validation, CSPRNG shuffle, and fresh output.
- Prove tampering fails and no input identifiers reach output.
- Publish protocol test vectors and obtain specialist feedback.

## Milestone 1 - additive lifecycle and schema

Implemented additively. Existing elections remain in `legacy` privacy mode.

- Add stable election/question/option UUIDs and canonical manifest hashing.
- Add encrypted privacy mode in draft only.
- Add key package, ciphertext ballot, published ballot, close artifact, and
  lifecycle fields/tables.
- Freeze manifest, close time, protocol, envelope size, and threshold at open.
- Preserve every legacy election and migration path.

## Milestone 2 - browser key and ballot modules

Implemented behind `VOTEKIT_ENCRYPTED_BALLOTS_ENABLED=false` by default.

- Build a small audited Web Crypto module.
- Build election key creation and offline recovery-kit UX.
- Build fixed-length complete-ballot encryption and private receipt UX.
- Prevent secret/receipt/ciphertext bodies from logs, URLs, analytics, and storage.
- Test supported desktop and mobile browsers.

## Milestone 3 - encrypted acceptance

Implemented with immediate SQLite transactions and a frozen commitment manifest.

- Add atomic ciphertext plus participation commit.
- Add idempotent retry and concurrency handling.
- Add count/commitment reconciliation and frozen accepted manifest.
- Ensure no vote plaintext reaches Next.js or SQLite.

## Milestone 4 - local memory-only close

Implemented in the administrator browser. The optional recovery CLI is not yet needed.

- Add `closing`/`close_failed` states and permanent intake stop.
- Add closing-browser key unlock, full decrypt, validation, shuffle, output rebuild,
  zeroisation/best-effort state clearing, and artifact hashing.
- Add atomic server-side artifact verification and publication.
- Add a recovery CLI only if browser memory limits require it.

## Milestone 5 - verifier and release

- Build receipt lookup and independent result verifier.
- Run all existing tally fixtures plus privacy/failure tests.
- Complete independent cryptographic/application review.
- Run synthetic election, backup/restore rehearsal, and owner UAT.
- Release behind a disabled feature flag, then approve a controlled pilot.

## Open product decisions

1. Minimum individual-ballot publication threshold. Recommendation: five.
2. Whether an encrypted election may be cancelled without results after opening.
3. Offline recovery-kit format: printable code, file, QR, or all three.
4. Maximum ballot/elector count supported by browser-only close before CLI is
   required.

## Stop conditions

- VoteKit receives ballot plaintext before shuffle.
- The close secret or private receipt reaches server storage/logs.
- A pre-shuffle plaintext file is created.
- Closing can operate on an unfrozen subset without visible failure.
- Retry can omit, duplicate, or alter an accepted ballot.
- Existing IRV or Condorcet results change for equivalent ballots.
