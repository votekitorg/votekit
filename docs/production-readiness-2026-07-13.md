# VoteKit Production Readiness Review

Date: 2026-07-13

## Verdict

The July candidate is materially safer than the live March build, but it is a
release candidate rather than an approved production release. Code-level
quality gates pass after the current hardening work. Operational cutover, a
restore rehearsal, email-delivery verification, and owner UAT remain required.

## Post-review status

On 2026-07-13, release `v0.1.0` at commit
`374040021379fa7a2d157b98edc8458f8b68ca00` was pushed and deployed. The
workspace, public GitHub `main`, and production service were verified at that
same commit. The March deployment findings below are retained as the historical
review record.

On 2026-07-14, an encrypted-until-shuffled privacy architecture was approved as
the future direction and documented in `docs/encrypted-ballot-privacy-prd.md`
and its linked threat model, technical design, implementation plan, and testing
checklist. It is not implemented in `v0.1.0`. Until that work passes independent
review and release gates, the trusted-live-database limitation described by the
design remains a production risk for sensitive elections. A local implementation
candidate now exists behind the disabled `VOTEKIT_ENCRYPTED_BALLOTS_ENABLED`
feature flag; it has not been released or enabled on production.

## Confirmed improvements

- Framework moved from vulnerable Next.js 14 to the patched 15.5 backport line.
- Dependency audit reduced from high-severity findings to zero known findings.
- Voting uses an immediate SQLite transaction that serializes with closure.
- Voter rolls become immutable when voting opens.
- Elections cannot open without questions and eligible voters.
- Open elections past their deadline cannot accept votes or appear active.
- Brisbane-local election dates are parsed consistently on UTC servers.
- CSRF tokens are dynamic, non-cacheable, HttpOnly, and SameSite Strict.
- Proxy IP handling ignores spoofable left-most forwarded values.
- Verification responses remain neutral for voter-roll privacy.
- Close-time cleanup removes sessions, codes, and verification-attempt identity data.
- Security headers, release health metadata, and a reproducible tagged deployment flow were added.

## Live environment findings

- The public site runs a build created in March, not the June/July Git history.
- The live working tree contains uncommitted token-voting functionality.
- That token flow is excluded from this candidate because it lacks the newer
  CSRF, close-deadline, concurrency, and privacy protections.
- The live SQLite database passes `quick_check` and has regular local hot backups.
- The Node process listens on all interfaces, although the host firewall blocks
  port 3000. The replacement service binds explicitly to localhost.
- Existing backups are on the same server; encrypted off-server replication and
  a documented restore drill remain launch requirements.

## Required before first real election

1. Review and push the six pre-existing local commits plus this review's commits.
2. Tag the approved release and deploy it through the runbook.
3. Preserve the current server tree and database before cutover.
4. Configure production-only secrets and a verified sender domain.
5. Add encrypted off-server backup replication and complete a restore rehearsal.
6. Run owner UAT and a representative full election rehearsal.
7. Confirm the three existing elections and stored ballots are disposable test
   data or must be retained before migrating the database.
8. Decide whether anonymous link/token voting is a future requirement. If so,
   redesign it against the current privacy and lifecycle model before enabling it.
