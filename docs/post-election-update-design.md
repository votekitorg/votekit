# VoteKit v0.15.0 post-election update

## Scope and acceptance

Jud authorised implementing and releasing the seven outstanding post-election
items on 23 September 2026. CiviCRM is explicitly excluded. Production inspection
found only closed and draft elections. Never modify existing ballots, results,
thresholds or deadlines automatically.

## Workflows and implementation plan

1. Existing-user invitations use one current-password field, with a username
   autofill field; only new users see password creation and confirmation.
   Server-side verification and single-use invitations remain mandatory.
2. Ballot submission failures appear next to submission controls on review;
   preserve selections, clear loading, never imply success after rejection.
3. Distinguish voting ended from finalised. Before deadline: Close Voting Early;
   after deadline: Finalise and Count Votes. Explain shuffling, encrypted recovery
   and unresolved ties. No automatic finalisation or late voting.
4. Authorised election managers can extend an open election's deadline, including
   after expiry, but never after finalisation has begun. Reason required; reject
   shortening, invalid dates and stale concurrent edits. No electorate changes.
   Display immutable extension history in admin, voting and results/exports.
5. Rankings start empty and use tap-to-rank plus accessible reorder/remove
   controls. Compulsory rankings require all options. Show question numbers,
   answered count, visible error summary, focus/scroll to the first omission.
6. Closed voting has a neutral status screen; missing links and technical errors
   remain distinct. Finalised elections retain their existing results redirect.
7. Optional SFC rule for single-winner Condorcet questions only. Configure an
   existing reference option (its option text is the configurable label), exact
   rational candidate-support threshold, strict/inclusive comparison. Default
   2/3 strict. Ranked beats omitted; both omitted contribute neither side.
   Zero denominator fails. SFC is not a candidate for election. Exclude failing
   candidates, then use the existing Condorcet/Schulze method among qualifiers,
   using original pairwise preferences. No qualifiers means no elected candidate;
   remaining ties stay unresolved. Display every comparison in HTML/PDF/CSV.
   No new STV counting mode and no changes to elections without this opt-in rule.

## Data model and encrypted deadline design

Add nullable questions.sfc_rule JSON; absent means legacy behaviour. Include it
in newly configured encrypted manifests only when enabled, preserving all old
manifest hashes. Published question configuration remains immutable.

Add plebiscites.manifest_close_date and election_deadline_extensions (old/new
deadline, actor/name, reason, timestamp). On the first extension preserve the
original close_date as manifest_close_date and change only the operational
close_date. The manifest continues using the original cryptographic close date;
the current operational deadline and public audit history are separate metadata.
Never regenerate keys, rewrite ciphertext or change the authenticated manifest.
All vote acceptance remains governed by current close_date. The audit is an
administrator action history, not a new cryptographic signature protocol.
Perform deadline update, history insertion and admin audit in one transaction.
Additive migrations permit code rollback (extensions must be reviewed before
rolling back to a version without manifest_close_date support).

## Verification and release checklist

- Invitation field variants and unchanged password authentication.
- Missing answers, untouched rankings, optional/compulsory completion, visible
  review failures, focus and responsive widths 320/390/430px.
- Open, expired, closing, finalised, invalid-link and network-error states.
- Extension authorisation/CSRF, exact boundary, shortening/stale/finalised
  rejection, immutable history, same manifest hash and decryption before/after.
- SFC rational boundaries, incomplete rankings, zero denominator, one/no
  qualifiers, ties, disabled compatibility and independent pairwise fixtures.
- Setup/draft/proof/public disclosure, HTML/PDF/CSV and migration preservation.
- Full tests, lint, regression checks, type-check, build and dependency audit.
- Production-copy migration rehearsal, backup integrity, annotated release tag,
  exact-SHA production health verification and post-release backup.
