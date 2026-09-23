# Election setup drafts

## Decision

Election setup and published election management are separate lifecycle stages.

1. The four-step creation wizard autosaves incomplete work to
   `election_setup_drafts`.
2. The organiser can leave and resume their own drafts from the dashboard.
3. Each draft has an unguessable, read-only proofing URL. Anyone deliberately
   given that URL can review the current wording, timing and ballot, but cannot
   vote or edit.
4. `Publish Election` validates the complete setup, creates the existing
   `plebiscites` record and questions in one transaction, and removes the setup
   draft in that same transaction.
5. Published wording, questions, voter-access method and dates are locked.
   Voter credentials and lifecycle actions remain available before opening.

## Security and privacy

- Draft editing and dashboard listing are restricted to the administrator who
  created the draft.
- Proof URLs use 192 bits of random bearer-token entropy, are excluded from
  search indexing and disappear when the draft is published or deleted.
- The proof page is read-only and does not expose administrator identity.
- Draft payloads are size-limited and publication repeats all existing server
  validation.
- A failed publication leaves the draft intact.

## Acceptance checks

- Interrupted setup is recoverable from the dashboard.
- Changes autosave while moving through all four steps.
- Rapid changes are saved sequentially, and the server rejects an update based
  on an older draft revision instead of overwriting newer work.
- Save & Exit keeps the organiser on the form when the latest save is not
  confirmed.
- The proofing page tracks the latest autosaved version.
- Another administrator cannot retrieve or edit a creator's draft.
- Organisation Owners can see all setup drafts and their creators on the
  dashboard for oversight and recovery. They can proof another creator's draft,
  but must explicitly take ownership before editing it. Takeover is audited and
  removes the previous creator's edit access.
- Invalid drafts cannot publish.
- Valid publication removes the setup draft atomically.
- Core configuration edits are rejected after publication.

## Unpublished draft deletion (v0.15.2)

ROs and Owners can delete their own saved setup drafts from the Elections list.
The action is labelled **Delete draft**, names the draft in a confirmation, and
explains that deletion is permanent and invalidates its proof link. Cancelling
does nothing. Pending requests disable the action; errors remain visible and
successful deletion removes the row with a status announcement.

This uses only `DELETE /api/admin/election-drafts?id=...`, with CSRF, role and
current ownership enforced server-side. Deletion and its audit entry run in one
transaction. Published elections (including not-yet-open ones) live in a separate
table and are never touched by this operation. Owner takeover remains required
before deleting another organiser's draft. No archive policy or election-delete
permissions change; ROs cannot delete active or finalised elections.

Implementation/checklist: add the list action; verify cancellation, success,
failure and mobile layout in a browser; test own/other/unauthorised deletion,
CSRF, audit persistence, stale requests after publication and protection of
published/open/closed election records; run release gates and deploy v0.15.2.
No schema migration or automatic deletion is involved.
