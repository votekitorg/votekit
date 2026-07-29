# VoteKit Product Requirements Document

Last updated: 2026-07-21

## Product Goal

VoteKit is an open-source election and plebiscite platform for member organisations. It should support secure member authentication, anonymous ballot submission, transparent counting, and independent verification of results.

## Core Principles

1. Eligible voters can vote exactly once.
2. Ballots are anonymous.
3. Voters can verify their own ballot was included and recorded correctly.
4. Where the election's anonymous-ballot publication rule permits, observers can independently re-tally the published ballots.
5. The system must not require voters to trust administrators with their vote choices.
6. Security/privacy guarantees must hold against anyone with ordinary database access, not just against the public results page.

## Receipt-Based Ballot Verification

### Requirement

VoteKit must allow voters to verify that their own ballot was counted correctly without giving up anonymity.

### Intended User Experience

1. A voter authenticates as eligible.
2. The voter submits their ballot.
3. The system returns a random receipt code visible only to that voter.
4. The voter is told to save the receipt code.
5. After voting closes, the voter can enter the private receipt to retrieve the matching anonymous recorded ballot.
6. The voter confirms that the recorded ballot matches how they voted and was included.
7. VoteKit publishes the complete anonymous ballot list only when the election's configured privacy threshold is met or the Owner explicitly selected always-publish before opening.

### Privacy Guarantee

The published data must not link a receipt code to a voter identity.

The internal database must also avoid storing a direct voter-to-receipt-to-ballot link. In particular:

- It is acceptable for a participation record to prove that a voter has voted.
- It is acceptable for a ballot record to contain a receipt code and vote contents.
- It is not acceptable for the participation/voter identity record to store the receipt code used by that voter.
- It is not acceptable for any ordinary query to map voter identity -> receipt code -> ballot.

### Data Model Constraint

The system should separate the following concepts:

- Eligibility: who is allowed to vote.
- Participation: whether an eligible voter has already voted.
- Ballot: the anonymous vote contents and private receipt code, which may also be published when the election's ballot-publication rule permits.

There must be no persistent direct foreign key, receipt-code field, token field, timestamp pair, or equivalent value that links participation records to ballot records.

### Timing Privacy Constraint

Precise vote and participation timestamps can create a correlation attack, especially in small elections. VoteKit should avoid storing precise timestamps on anonymous ballots and should avoid storing matching precise participation timestamps that can be correlated with ballots.

Acceptable approaches may include:

- No ballot timestamp at all.
- Coarse-grained timestamps only where operationally necessary.
- Batch insertion or shuffling before publication.
- Removing session records once no longer needed.

### Approved Encrypted-Until-Shuffled Direction

For future encrypted elections, the approved product direction is to encrypt the
complete ballot and its private receipt in the voter's browser. While the
election is open, VoteKit and its backups may store only ciphertext and
participation evidence. At closure, the trusted administrator's browser loads
the complete frozen ballot set, unlocks the election key using an offline close
secret, decrypts and cryptographically shuffles it in memory, removes all input
identifiers, and returns only shuffled plaintext ballots.

This standalone direction requires no cloud service, specialised hardware, or
trustee ceremony. It preserves exact receipt-based verification and all existing
voting methods after the shuffle. Voters may voluntarily disclose their receipt
and ballot. The installed software and closing device are explicitly trusted.

This architecture is not implemented in release `v0.1.0`. A later implementation
candidate is protected by a disabled feature flag until review, rehearsal, and
owner UAT are complete. The controlling design documents are:

- `docs/encrypted-ballot-privacy-prd.md`
- `docs/encrypted-ballot-threat-model.md`
- `docs/encrypted-ballot-technical-design.md`
- `docs/encrypted-ballot-implementation-plan.md`
- `docs/encrypted-ballot-testing-checklist.md`

### Verification Scope

Receipt-based verification proves:

- My ballot appears in the final published ballot set.
- My ballot contents were recorded as I submitted them.
- The published tally can be independently recalculated.

Receipt-based verification does not, by itself, prove:

- Only eligible voters voted.
- No extra fake ballots were inserted.
- The voter roll was correct.

Those require separate controls: voter-roll auditing, participation counts, immutable admin audit logs, scrutineer review, and election lifecycle controls.

## Voting Method Requirements

VoteKit should support:

- Yes/No questions.
- Multiple-choice questions.
- Ranked-choice / IRV.
- Condorcet.
- Compulsory preferential ballots.
- Optional preferential ballots.

Optional preferential voting means voters may rank as few or as many options as they choose, subject to any election-specific minimum rule.

The front end, API validation, database schema, and tabulation logic must agree on whether a question is compulsory or optional preferential.

## Results Requirements

After voting closes, results should include:

- A setup-stage choice between public link access and eligibility-verified
  access. Public-result elections must not ask voters to retain voting
  credentials solely to see results.
- Final tallies.
- Aggregate results and method-specific tabulation details regardless of whether individual ballots are published.
- Private receipt lookup after close regardless of the public ballot threshold.
- Full anonymous ballots with receipt codes only when at least 20 ballots were accepted by default, a higher Owner-selected threshold was met, or the Owner explicitly selected always-publish before opening.
- Method-specific tabulation details, including IRV rounds or Condorcet pairwise comparisons.
- Participation count.
- An optional, collapsed verification-receipt action after voting. The
  downloaded receipt contains the election name, results link and clearly
  labelled receipt code or codes without burdening voters who do not want to
  verify their ballot later.
- Enough downloadable data for independent re-tallying where anonymous-ballot publication is enabled.
- Immutable alternative IRV and Condorcet count runs for compatible ranked ballots, including the method, result snapshot, applicable tie decisions, administrator, timestamp and source/result fingerprints. Alternative runs never replace the declared result.

## Election Timing Requirements

Election setup remains an autosaved, resumable server-side draft until the
organiser deliberately publishes it. A private bearer-token proofing link
renders the current draft as a read-only ballot for review. Publishing performs
complete validation, creates the election atomically and locks its wording,
questions, access method and voting dates. Voter credentials and opening
controls remain configurable after publication.

- All election times are entered and displayed as Australia/Brisbane time.
- The creation form must not silently derive a closing time from when setup began.
- The organiser must deliberately select the fixed closing date and time.
- The selected close remains a hard cutoff and is bound into the encrypted election manifest.

## Tie Policy Requirement

VoteKit must have an explicit tie policy for each voting method.

The preferred default is to report true ties as ties and require election administrators to resolve them according to the organisation's rules, rather than silently choosing a winner by candidate order or alphabetic order.

If any automatic tie-break rule is implemented, it must be documented, deterministic, and visible in the results output.

## Administrative roles and invitations

VoteKit uses four administrative roles across two access layers. Owners govern
the organisation and can see every election. Returning Officers are global
roles who can create elections, but operate only elections they create or are
assigned to. Admins operate assigned elections only; Observers have read-only
access to assigned elections only. New users join through expiring, single-use
email invitations and choose their own credentials. See
`role-and-invitation-design.md` for the permission matrix, workflow, and
authentication decision.

## Non-Functional Requirements

- Privacy and anonymity should be designed for small elections where timing correlation is realistic.
- Critical election logic must have automated tests.
- State-changing admin and voting endpoints must be protected against common web attacks.
- Election lifecycle transitions must be strict and auditable.
- Deployment must not expose secrets or the SQLite database to unrelated system users.
