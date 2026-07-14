# VoteKit Standalone Encrypted Ballot Testing Checklist

Status: automated core protocol and route lifecycle tests pass; manual/review gates remain  
Date: 2026-07-14

## Key and recovery

- [x] Keypair and 256-bit close secret are generated in the administrator browser.
- [x] Server receives only public key and authenticated encrypted private key.
- [ ] Close secret never reaches SQLite, logs, URL, analytics, or localStorage.
- [x] Wrong/tampered secret or key package fails without partial output.
- [ ] Offline recovery kit works on a clean machine and warns that loss is final.

## Ballot encryption

- [x] Receipt contains 256 random bits and exists only in browser/plaintext envelope.
- [ ] Complete ballot canonicalisation matches across supported browsers.
- [x] Every valid ballot shape produces the same package length per election.
- [x] Re-encrypting ballots produces different ciphertext.
- [x] Ciphertext and close-secret alteration fails authentication.
- [ ] Browser network capture contains no plaintext answer or receipt.

## Acceptance and lifecycle

- [x] Ciphertext and participation commit atomically and exactly once.
- [x] An acknowledged submission retry cannot duplicate a ballot.
- [ ] Questions, keys, protocol, close time, and threshold freeze at open.
- [x] `closing` permanently stops new verification and ballots.
- [x] Only `closed` exposes results, exports, or receipt lookup.

## Memory-only close

- [x] Complete accepted manifest freezes before key unlock.
- [ ] Closing browser decrypts every accepted package and reconciles counts.
- [ ] Invalid/missing/duplicate package fails closed.
- [ ] CSPRNG Fisher-Yates shuffle passes deterministic and statistical tests.
- [ ] No pre-shuffle plaintext file, response, log, trace, or download exists.
- [x] Output contains no input ID, order, timestamp, commitment, IV, wrapped key,
      voter reference, or permutation.
- [ ] Closing-page refresh/crash creates no recoverable plaintext residue and can
      retry against the same frozen input.

## Results

- [x] Every accepted valid ballot appears exactly once after closure.
- [x] One private receipt finds one complete identical ballot.
- [ ] Unknown receipt response reveals no voter information.
- [x] Existing Yes/No, multiple-choice, IRV, and Condorcet tally fixtures still pass.
- [ ] Independent verifier reproduces published counts and tallies.
- [ ] Below-threshold policy prevents unsafe individual-ballot publication.

## Storage inspection

- [ ] Open SQLite, WAL/SHM, backups, logs, and crash reports contain no canary
      answers, receipts, private keys, or close secrets.
- [x] Closed storage contains only already-shuffled plaintext ballots.
- [ ] Recovery kit is excluded from server backups and deployment artifacts.

## Release gates

- [ ] Unit, property, concurrency, fuzz, and cross-browser crypto tests pass.
- [ ] Existing regression, lint, type-check, build, and dependency audit pass.
- [ ] Synthetic election and backup/restore rehearsal pass.
- [ ] Independent security review findings are resolved or explicitly accepted.
- [ ] Malformed-ciphertext denial-of-service risk is mitigated or explicitly accepted.
- [ ] Jud owner UAT passes before enabling encrypted mode for real elections.
