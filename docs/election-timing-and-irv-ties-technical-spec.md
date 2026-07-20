# Election Timing and IRV Tie Resolution Technical Spec

## Schema

- `plebiscites.opening_mode`: `immediate` or `scheduled`
- `plebiscites.actual_opened_at`: actual successful transition time
- `plebiscites.scheduled_open_attempted_at`: prevents unexpected later retries
- `plebiscites.scheduled_open_error`: readiness failure shown to administrators
- `irv_tie_resolutions`: immutable question/round decision, tied set, selected option, method, note, actor and timestamp

## Opening lifecycle

`openElectionNow` is the shared readiness and transition authority for manual and scheduled opening. It checks questions, the selected credential mode, the hard closing cutoff and encrypted recovery readiness, then performs a status-guarded transition and audit event.

`reconcileScheduledElection` runs from the public election endpoint, authentication entry points and administrative pages. This makes a due election available when a voter arrives without treating a scheduled time as permission to bypass readiness safeguards.

## Counting lifecycle

`tabulateIRV` remains a pure deterministic function. It accepts previously audited resolutions and returns either a winner or one `pendingTie`. Countback decisions are derived from prior rounds. Manual decisions are loaded from the database by the shared results service, so HTML, JSON, CSV and PDF always use the same count.

The resolution endpoint recomputes the current count before insertion, accepts only the current pending tie, restricts decisions to Owners and Returning Officers, and inserts the decision plus audit event transactionally.

## Rollback

The migration is additive. Existing elections default to immediate/manual opening semantics. Tie resolutions remain inert on an older release; ballots are never rewritten.
