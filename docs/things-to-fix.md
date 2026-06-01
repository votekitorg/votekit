# VoteKit Things To Fix

Last updated: 2026-06-01

This list captures Ty's feedback, the review-panel findings, and Jud's receipt-based verification design.


## Completed in implementation pass 2026-06-01

- Removed the direct voter identity -> receipt code linkage from new participation records.
- Added privacy migrations to remove `receipt_codes`/`voted_at` from `participation` and `created_at` from `votes` on existing databases when the app starts.
- Switched receipt-code generation to cryptographic randomness.
- Fixed backend optional preferential validation for ranked-choice and Condorcet questions.
- Added Condorcet to the fresh database question type constraint and migration path.
- Published anonymous ballots with receipt codes in results JSON/CSV and on the results page after admin close.
- Changed IRV full/final tie handling to report ties instead of silently picking alphabetically/by order.
- Tightened admin auth status validation, voter lookup by election, and draft -> open -> closed lifecycle transitions.
- Added `npm run regression-check` to guard the core privacy/voting assumptions.

## Critical: ballot anonymity and receipt-code linkage

### Problem

Current VoteKit design appears to store receipt codes in both:

- `votes.receipt_code`, linked to the ballot contents.
- `participation.receipt_codes`, linked to the voter identity / voter roll row.

That creates a direct database path:

voter identity -> participation receipt code -> ballot receipt code -> vote contents

This is incompatible with the intended privacy guarantee. Public receipt codes are fine, but the system must not store the voter's receipt code against their identity.

### Fix direction

- Remove receipt codes from `participation` or otherwise prevent any persistent voter-to-receipt mapping.
- Keep only enough participation data to enforce one vote per eligible voter.
- Keep ballot receipt codes in the anonymous ballot table for public verification.
- Update any voter confirmation screen/email flow so the receipt is shown to the voter but not retained against their identity.
- Add tests proving no database query can directly link voter identity to ballot contents through receipt codes.

## Critical: timestamp correlation risk

### Problem

Ty reported that vote timestamps can be used to link voters to ballots. This is valid, especially in small elections.

Risky fields include:

- `votes.created_at`
- `participation.voted_at`
- session/auth timestamps where they can be correlated with ballot submission

Even after receipt-code linkage is removed, matching precise timestamps can still deanonymise ballots.

### Fix direction

- Remove precise timestamps from anonymous ballot records unless strictly required.
- Avoid storing matching precise participation timestamps.
- Consider coarse timestamps, batching, shuffling, or delayed publication/insertion where needed.
- Clear session records once operationally unnecessary.
- Document the residual timing-correlation risk for small elections.

## Critical: optional preferential voting rejected by API

### Problem

The UI supports optional preferential voting, but the vote submission API still requires ranked-choice/Condorcet ballots to rank every option.

This means a valid optional preferential ballot can pass the front end and then fail at submission.

### Fix direction

- Make API validation aware of `preferential_type`.
- For compulsory preferential: require all options to be ranked.
- For optional preferential: allow partial rankings, with the configured minimum, likely at least one ranked option.
- Ensure IRV and Condorcet validators match the same rule.
- Add tests for partial rankings in ranked-choice and Condorcet elections.

## High: Condorcet schema support may be inconsistent

### Problem

The app/admin UI supports `condorcet`, but the base question type constraint appears to allow only:

- `yes_no`
- `multiple_choice`
- `ranked_choice`

Depending on the live migration state, creating Condorcet questions may fail or behave inconsistently.

### Fix direction

- Add `condorcet` to the database constraint/migration path.
- Verify fresh installs and existing databases both support Condorcet.
- Add a migration test or setup test for a new Condorcet election.

## High: publish anonymous ballots with receipt codes after close

### Requirement

After voting closes, VoteKit should publish every accepted anonymous ballot with its receipt code so voters can verify their ballot and observers can independently re-tally.

### Fix direction

- Add a results/export view containing receipt code + ballot contents for each ballot.
- Ensure this view is unavailable before the election closes.
- Ensure the export contains no voter identity, auth token, email, phone, session ID, IP address, or participation record identifier.
- Include machine-readable export, probably CSV/JSON, for independent re-tallying.
- Add tests that published ballot data contains receipt codes and vote contents, but no identity fields.

## Medium: IRV tie policy is inconsistent

### Problem

IRV tie handling appears inconsistent. Some paths use alphabetical ordering, while others rely on current ordering or eliminate multiple tied candidates at once.

This may not matter for the immediate PDC AGM if tied candidates would both be appointed, but the platform needs a declared policy.

### Fix direction

- Decide and document tie policy.
- Preferred default: report true ties as ties and let election administrators resolve them according to the organisation's rules.
- If automatic tie-breaking is kept, make it deterministic, documented, visible in results, and tested.
- Avoid silent alphabetic winner selection unless explicitly chosen by election rules.

## Medium: double-submit and concurrency hardening

### Problem

The participation table has a uniqueness constraint, which helps, but the vote flow still needs explicit testing for simultaneous submissions and retry behaviour.

### Fix direction

- Add tests for two near-simultaneous submissions from the same voter/session.
- Ensure the transaction either accepts exactly one complete ballot set or rejects cleanly without partial vote inserts.
- Make error messages safe and clear if a duplicate submission occurs.

## Medium: admin auth/session/security review

### Problem

The review panel flagged areas needing deeper verification around admin session validation, CSRF protection, and in-memory security state.

### Fix direction

- Confirm every admin route validates a real admin session.
- Add CSRF protection or equivalent SameSite/session protections for state-changing admin routes.
- Avoid in-memory security state for anything that must survive restarts.
- Add middleware or shared route guards so new admin routes are protected by default.

## Medium: election lifecycle controls

### Problem

Election lifecycle transitions need to be strict. Reopening a closed election after results were visible would damage trust.

### Fix direction

- Enforce `draft -> open -> closed` unless an explicit audited override exists.
- Prevent voting after close.
- Prevent publishing final ballot exports until close.
- Log lifecycle transitions in an immutable audit trail.

## Medium: tests are missing

### Problem

Election software needs automated tests for core voting and privacy guarantees. Current coverage appears insufficient or absent.

### Fix direction

Add tests for:

- Receipt-code anonymity and absence of voter-to-ballot linkage.
- Published ballot export privacy.
- Optional preferential submission.
- Compulsory preferential rejection of incomplete rankings.
- IRV tie scenarios.
- Condorcet creation and tabulation.
- Duplicate vote attempts.
- Election close/results visibility rules.

## Documentation updates needed

- Update README privacy claims once the anonymity model is fixed.
- Document exactly what receipt verification proves and does not prove.
- Document residual risks: database administrator trust, timing correlation, small-election privacy, device/browser compromise, and vote buying/coercion limits.
- Add a public technical explanation of the receipt-code model.
