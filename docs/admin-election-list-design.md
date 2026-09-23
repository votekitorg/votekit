# Admin election list, v0.15.1

Jud approved option A with the existing Admin Panel sidebar on 23 September 2026.
Keep the current green, typography, navigation, role controls and mobile menu.
Replace headline statistics and shortcut panels with elections, search, filters,
key dates and relevant actions. No schema, election-rule or voter-facing changes.

## Workflow and data

- Sign in -> Elections -> search/filter -> existing election management/results
  or setup draft workflow. Finalise links open management, never count directly.
- Load all accessible elections, not only the ten most recent. Select only list
  fields; remove aggregate participation/voter queries.
- Merge autosaved setup drafts into the list. Preserve proof links, ownership and
  audited Owner takeover. Published-but-not-open elections are not editable drafts.
- Keep archives Owner-only and separate from the default list.
- Observer actions say View election; management actions depend on election role.
- A deadline passing or finalisation starting means voting has ended. Show failed
  finalisation as needing review, not open. Use Brisbane dates; do not pretend the
  scheduled close date is the actual finalisation timestamp.
- Default order: requires finalisation, open, drafts/not open, finalised.
- Small screens stack row fields and wrap filters, preserving readable actions.

## Acceptance and implementation

1. Replace server page/data query and add client-side list/search/filter rendering.
2. Rename sidebar Dashboard to Elections without removing admin navigation.
3. Verify all status filters, search and empty states, drafts/proof/takeover,
   archives, role restrictions, >10 elections and 320/390/1536px layouts.
4. Run existing release gates, publish patch release and verify production.

No member data or voting credentials are introduced into the list. Existing
authorisation remains server-side. No new data model or write API is required.
