# VoteKit Local Encrypted-Until-Shuffled Ballots PRD

Status: implemented behind a disabled feature flag; security review and UAT pending  
Decision owner: Jud Campbell  
Date: 2026-07-14

## Product requirement

VoteKit must remain a standalone, low-infrastructure application. A complete
installation must run on one ordinary laptop, mini-PC, or server with SQLite and
modern browsers. AWS, another cloud service, trustees, and specialised hardware
must not be required.

While an election is open, VoteKit must store only encrypted ballot envelopes.
The complete decrypt-and-shuffle operation occurs in the trusted administrator's
browser memory at closure. Only shuffled plaintext ballots may be returned to
the server or written to disk.

Jud is the trusted software operator. The design protects against routine admin
access, database browsing, stolen database files, and backups. It does not claim
to resist a malicious person who controls the installed VoteKit code, the host
operating system, or the closing browser.

## Required workflow

### Election preparation

1. The administrator's browser generates a per-election public/private keypair
   and a random 256-bit close secret.
2. The browser encrypts the private key using the close secret.
3. VoteKit stores the public key and encrypted private-key package.
4. The administrator saves the close secret or an offline recovery kit. VoteKit
   cannot recover it.
5. Questions, options, key material, ballot schema, and scheduled close time
   become immutable when voting opens.

### Voting

1. The voter authenticates through the existing eligibility flow.
2. The browser creates one random 256-bit receipt for the complete ballot.
3. The browser encrypts the receipt and all answers before submission.
4. SQLite stores the ciphertext and a separate participation record.
5. The voter saves the receipt after durable acceptance.

### Closure

1. VoteKit enters `closing` and permanently stops ballot acceptance.
2. The closing browser downloads the complete encrypted ballot box and encrypted
   private-key package.
3. The administrator supplies the offline close secret.
4. The browser decrypts and validates every ballot in memory.
5. It cryptographically shuffles the complete valid ballot set.
6. It creates fresh output objects containing only receipts and semantic answers.
7. It uploads the shuffled artifact. No pre-shuffle plaintext file is created.
8. VoteKit verifies counts and commits the artifact, results, cleanup, and
   `closed` state atomically.

## Requirements

- One encrypted envelope represents one voter's complete election ballot.
- Every valid ballot shape for an election produces an equal-length ciphertext
  package.
- The receipt is generated and retained by the voter, never associated with
  their identity, and published only after shuffling.
- Submission and closure are idempotent and fail closed.
- A close retry must use the same accepted ballot manifest and final artifact.
- Results remain unavailable until the election is `closed`.
- Yes/No, multiple choice, IRV, and Condorcet remain independently re-tallyable.
- Existing legacy elections remain compatible and are never silently migrated.
- Individual ballots should not be published below a configured anonymity
  threshold. Recommended default: five valid ballots.

## Explicit limits

- A person controlling the VoteKit source/runtime can change the closing code or
  inspect browser memory. Jud has accepted this local trust boundary.
- Malware or extensions on voter/administrator devices are outside the claim.
- Losing the close secret makes the election undecryptable.
- Losing a private receipt makes that voter's ballot unrecoverable by receipt.
- Sharing a receipt proves the ballot. Voters may voluntarily do so.
- Small elections allow inference even after correct shuffling.

## Success criteria

- Open SQLite, WAL, logs, and backups contain no plaintext answers or receipts.
- Browser network captures contain no plaintext voter ballot during submission.
- Closing writes or uploads no plaintext until after the shuffle.
- The published artifact contains no submission ID, order, timestamp,
  ciphertext commitment, voter reference, or input-to-output mapping.
- Every accepted valid ballot appears exactly once with the original receipt and
  answers after closure.
- Existing tally fixtures produce identical results from shuffled ballots.
