# VoteKit Fable Review Hardening Plan

Source: Claude Fable 5 read-only review, 2026-07-01.

Purpose: convert the review findings into implementation tickets that can be handed to a coding agent one at a time. This is still a defensive engineering/product trust pass, not an offensive security exercise.

## Product decisions to lock in

Recommended defaults unless Jud says otherwise:

1. **Anonymity model:** accept shuffle-at-close as the near-term mitigation, with docs clearly saying a live admin/database snapshot before close remains a trusted-admin risk. Stronger pre-close unlinkability is a larger design project.
2. **Deployment model:** supported production deployment is a persistent single server with durable SQLite storage, backups, and process manager. Vercel/serverless is not supported for real elections while SQLite is local-file based.
3. **Schulze ties:** true ties must be reported as ties, never silently resolved by candidate order.
4. **Overlapping voter rolls:** required. The same email must be eligible in multiple elections.
5. **IRV batch elimination:** acceptable for now if documented explicitly, but add tests so the behavior is intentional.
6. **Multiple-choice rule:** current behavior is choose one or more valid unique options. “Choose up to N” is a future feature unless requested.
7. **Test framework:** Vitest, because it is lightweight, TypeScript-friendly, and easier to add without reshaping the Next app.

## Phase 1 - must fix before a real election

### Ticket VK-001 - Fix multiple-choice duplicate over-counting

**Severity:** High  
**Files:** `src/app/api/vote/route.ts`, `src/app/api/results/[slug]/route.ts`, tests

**Problem:** API accepts `['A', 'A', 'A']`; tally counts each occurrence.

**Expected behavior:**
- Multiple-choice ballots must be a non-empty array of valid options.
- Each selected option must be unique.
- Duplicate selections return HTTP 400 before any vote is written.

**Implementation notes:**
- Add `new Set(voteValue).size !== voteValue.length` validation in the multiple-choice branch.
- Keep the tally simple once invalid ballots are impossible.

**Tests:**
- Duplicate selected option is rejected.
- Valid multi-selection is accepted.
- Crafted duplicate vote data does not produce inflated official tally if test helpers insert raw rows.

**Acceptance:** build, type-check, regression-check, and new behavioral tests pass.

---

### Ticket VK-002 - Rebuild voter_roll uniqueness per election

**Severity:** High  
**Files:** `src/lib/db.ts`, `src/app/api/admin/voters/route.ts`, tests

**Problem:** `voter_roll.email` still has a global UNIQUE constraint after `plebiscite_id` was added. Returning voters can be silently ignored in later elections.

**Expected behavior:**
- Same email can exist once per plebiscite.
- Same email cannot be duplicated inside the same plebiscite.
- Upload response distinguishes true same-election duplicates from successful cross-election inserts.

**Implementation notes:**
- Add a migration that rebuilds `voter_roll` with `UNIQUE(email, plebiscite_id)`.
- Preserve existing rows and IDs where possible because `participation.voter_roll_id` references them.
- Keep/index `email` and `plebiscite_id` for lookup performance.
- Consider legacy rows with `plebiscite_id IS NULL`; safest near-term behavior is preserve them but ensure new election-specific rows are possible.

**Tests:**
- Same email uploads into two different elections and can verify/vote in both.
- Same email duplicated within one upload/election is counted as duplicate.
- Existing participation references survive migration.

**Acceptance:** database migration is idempotent; build/type-check/tests pass.

---

### Ticket VK-003 - Use cryptographic verification-code generation

**Severity:** High  
**Files:** `src/lib/email.ts`, `scripts/votekit-regression-checks.js`, tests

**Problem:** verification codes use `Math.random()`.

**Expected behavior:**
- Six-digit code generated via `crypto.randomInt(100000, 1000000)`.
- Output remains stringified six digits.

**Tests:**
- Code is always six numeric digits.
- Regression check rejects `Math.random()` in verification-code generation.

**Acceptance:** no `Math.random()` in credential/token generation paths.

---

### Ticket VK-004 - Report Condorcet/Schulze ties instead of silently picking first candidate

**Severity:** High where Condorcet is used  
**Files:** `src/lib/condorcet.ts`, result API/UI/CSV if needed, tests

**Problem:** Schulze fallback ranks candidates by beat-path win count and takes index 0. True ties become candidate-order wins.

**Expected behavior:**
- If the top Schulze score is shared by multiple candidates, `winner` is `null` and tied candidates are exposed.
- CSV/results UI report the tie explicitly.
- Condorcet winner remains unchanged when a candidate strictly beats all others.

**Implementation notes:**
- Extend `CondorcetResult` with `tiedCandidates?: string[]` or similar.
- Have `schulze()` return candidate scores, not only ordered names.
- Update result rendering and export to account for no winner/tie.

**Tests:**
- Two-candidate exact tie reports tied candidates.
- Three-candidate symmetric cycle reports tie when Schulze top score is tied.
- Non-tie Condorcet and Schulze cases still produce winner.

**Acceptance:** no candidate-order tie breaking in tabulation.

---

### Ticket VK-005 - Enforce published voting window and hide draft public elections

**Severity:** Medium-High  
**Files:** `src/app/api/vote/route.ts`, `src/app/api/auth/verify/route.ts`, `src/app/api/auth/confirm/route.ts`, `src/app/api/elections/[slug]/route.ts`, tests

**Problem:** close date is display-only. Voting and verification continue while status remains `open`, even past the published deadline. Draft elections are publicly fetchable by guessed slug.

**Expected behavior:**
- Public election API returns 404 for draft elections.
- Verification, confirmation, and vote submission require status `open` and current time within `[open_date, close_date]`.
- A past close date returns a clear closed/expired response even if admin has not clicked Close.
- Results remain published only after admin closes or an explicit auto-close policy is later implemented.

**Implementation notes:**
- Add shared helper for election window checks to avoid route drift.
- Be careful with timezone: store/compare ISO/UTC consistently.

**Tests:**
- Draft slug returns 404 publicly.
- Vote before open date rejected.
- Vote after close date rejected while status is open.
- Results remain unavailable until status is closed.

**Acceptance:** published deadlines are enforceable.

---

### Ticket VK-006 - Add behavioral test harness

**Severity:** High  
**Files:** `package.json`, `vitest.config.*`, `src/lib/db.ts`, test files

**Problem:** current regression script greps source text. It does not execute tabulation, lifecycle, auth, validation, or privacy behavior. `db.ts` refuses to initialize under `NODE_ENV === 'test'`.

**Expected behavior:**
- Vitest can run unit tests for tabulation and validation.
- Integration-ish DB tests can use isolated temp SQLite files or in-memory SQLite.
- Existing string-grep regression script can remain as a cheap extra guard, not the main proof.

**Implementation notes:**
- Refactor DB initialization to allow `DATABASE_PATH=':memory:'` or a temp path in tests.
- Avoid importing the singleton DB into pure algorithm tests.
- Add scripts: `test`, maybe `test:run`.

**Priority tests:**
1. IRV and Condorcet tie shapes.
2. Multiple-choice duplicate validation.
3. Per-election voter-roll uniqueness.
4. Double-submit returns exactly one ballot set.
5. Vote after `close_date` rejected.
6. Results locked before close.
7. Published exports contain only receipt code + contents.

**Acceptance:** `npm run test`, `npm run regression-check`, `npm run type-check`, and `npm run build` pass.

---

### Ticket VK-007 - Close-time privacy hardening

**Severity:** Critical  
**Files:** `src/lib/db.ts`, `src/app/api/admin/plebiscites/route.ts`, result routes, tests/docs

**Problem:** participation and votes are inserted in correlated order. Database access or backups can reconstruct voter-to-ballot clusters by row ID/order.

**Expected behavior for near-term model:**
- When an election closes, anonymous vote rows are rebuilt in randomized order with fresh IDs before results/export are treated as final.
- Used verification codes for that plebiscite are purged.
- Sessions for that plebiscite are purged.
- Docs state residual trusted-admin/live-DB risk before close.

**Implementation notes:**
- Do this as a transaction inside the admin close action.
- Rebuild only votes belonging to questions in the closing plebiscite.
- Preserve `question_id`, `vote_data`, and `receipt_code` exactly.
- Shuffle rows with cryptographic randomness.
- Do not break receipt-code publication or result reproducibility.
- Add an idempotence marker or make close action only run once from open -> closed.

**Tests:**
- After close, vote IDs/order no longer align with participation IDs/order.
- Receipt codes and vote contents are preserved.
- Sessions and used verification codes for that plebiscite are deleted.
- Close transaction rollback leaves database consistent if an error occurs.

**Acceptance:** public anonymity claim is accurate for post-close database/export, with documented pre-close threat model.

## Phase 2 - should fix before public launch

### Ticket VK-008 - Correct deployment/readme and hardcoded self-fetch

**Scope:** README, deployment docs, `src/app/results/[slug]/page.tsx`.

- Remove “production-ready” until Phase 1 and Phase 2 are complete.
- Document persistent-server SQLite only, plus backups.
- Remove Vercel as a supported real-election deployment unless/until DB is external/durable.
- Remove unused `JWT_SECRET` docs if truly unused.
- Correct CSRF wording to describe the app's actual double-submit-cookie protection.
- Replace hardcoded `http://localhost:3006` self-fetch with direct DB/service call or a robust origin strategy.

### Ticket VK-009 - Admin lockout and audit log

**Scope:** `src/app/api/admin/auth/route.ts`, admin mutation routes, `src/lib/db.ts`, tests.

- Add per-email admin login throttling.
- Trust `x-forwarded-for` only under a known proxy config, otherwise use a safer direct IP source or combine factors.
- Write `admin_audit_log` rows for login success/failure, open/close, voter-roll changes, plebiscite edits, admin-user changes.
- Delete dead CSRF helper code if unused.

### Ticket VK-010 - Voter privacy and retention

**Scope:** auth verify route, rate limits, observer permissions, close cleanup.

- Return neutral eligibility response where appropriate.
- Add per-IP or global abuse throttling in addition to per-email throttling.
- Decide whether observers may see voter-roll PII.
- Purge identity artifacts at close per retention policy.

## Suggested implementation order

1. VK-003 verification code crypto swap.
2. VK-001 multiple-choice duplicate rejection.
3. VK-004 Condorcet/Schulze ties.
4. VK-002 voter-roll uniqueness migration.
5. VK-005 voting window/draft visibility.
6. VK-006 Vitest behavioral harness and tests covering 1-5.
7. VK-007 close-time privacy hardening.
8. Phase 2 tickets.

Reasoning: start with small deterministic fixes, then migration/lifecycle behavior, then the larger anonymity close workflow once test coverage exists.

## Handoff prompt for implementation agent

Use this when starting a coding pass:

> Read `docs/fable-review-hardening-plan.md` first. Implement only ticket `<TICKET-ID>` in this pass. Do not opportunistically fix unrelated issues. Add/adjust behavioral tests for the ticket. Run `npm run test` if available, then `npm run regression-check`, `npm run type-check`, and `npm run build`. Report files changed, tests run, and any unresolved product decision.
