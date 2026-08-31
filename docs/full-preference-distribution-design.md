# Full Preference Distribution

## Product requirements

### Problem

VoteKit's IRV count stops when an option first receives a majority of active
ballots. That correctly determines the winner, but it can hide useful preference
flows from lower-ranked options when the winner already has a first-round
majority.

### Goal

Allow a ranked-choice question to continue exclusions after the official winner
is determined, solely to publish a final-two preference distribution. Allow the
same reporting mode to be run after closure as an immutable audited supplementary
count without changing the election's original configuration or declared result.

### Non-goals

- Do not transfer a winning option's ballots or change the declared winner.
- Do not rewrite closed-election configuration.
- Do not alter stored ballots, voter records, receipts or privacy controls.
- Do not silently resolve exclusion ties.

### User stories and acceptance criteria

- As an election creator, I can select `Continue to a final-two preference
  distribution after the winner is determined` for an IRV question.
- The option is off by default, saved in setup drafts and shown in review.
- The official winner and decisive round remain the first majority result.
- When enabled, the lowest continuing option is excluded after that point until
  two options remain; every transfer and exhausted ballot is reported.
- Post-majority rounds are labelled `Supplementary distribution` in HTML, PDF
  and CSV and cannot be mistaken for rounds that determined the winner.
- Existing questions retain current stop-at-majority behaviour.
- An Owner or Returning Officer can create an immutable audited full-distribution
  run from a closed question's frozen ballots.
- Source/settings/result fingerprints bind the reporting mode and output.
- Unresolved exclusion ties pause the supplementary count without undoing the
  already-declared official winner.

## Workflow and UX

### Election setup

Within the ranked-choice voting requirements card:

1. Choose compulsory or optional preferential voting.
2. Optionally check `Continue to a final-two preference distribution after the
   winner is determined`.
3. Explain that this publishes preference flows for reporting only and never
   changes the winner declared at the first majority.
4. Repeat the selection on the final review screen.

### Closed election

The alternative count panel offers `Run full preference distribution`. After
confirmation, VoteKit records a new immutable count run. Public results show it
under `Supplementary preference distribution`, with the official winner and
decisive round stated before the additional transfer rounds.

## Data model

- Add `questions.continue_after_majority INTEGER NOT NULL DEFAULT 0`.
- Extend IRV results with `decisiveRound` and `continuedForReporting`.
- Mark each post-majority round `supplementary: true`.
- Keep `result_count_runs.method = 'irv'`; bind
  `continueAfterMajority: true` and algorithm
  `votekit-irv-full-distribution-v1` into `settings_json` and the result hash.

The migration is additive and backward compatible. Rollback code ignores the new
column; no existing record is rewritten.

## Technical design

- Extend `tabulateIRV` with an options object while preserving existing callers.
- Freeze `result.winner` on the first majority. In reporting mode, continue
  excluding one lowest option per round until the final-two tally is recorded.
- Reuse existing countback and audited tie-resolution rules.
- Pass the question setting through primary result generation.
- Add a full-distribution flag to the audited count-run API and manager.
- Update result summaries, HTML, PDF and CSV to distinguish decisive and
  supplementary rounds.
- Include the new question setting and result metadata in existing result
  fingerprints through the authoritative result model.

## Implementation tasks

1. Add migration and creation API persistence.
2. Add setup/draft/review UI.
3. Extend IRV tabulation and tests.
4. Add audited full-distribution count runs and permissions tests.
5. Update web, PDF and CSV presentation.
6. Rehearse migration against a production database copy.
7. Release through the tagged deployment pipeline.
8. Create the authorised supplementary run for the closed fuel-price election
   and verify its public result without modifying the original question setting.

## Testing checklist

- Existing stop-at-majority behaviour is unchanged.
- First-round majority plus a lower abstention option distributes correctly.
- Partial preferences exhaust correctly.
- Official winner and decisive round never change during supplementary rounds.
- Final-two tally is recorded once.
- Supplementary exclusion ties pause safely and use audited decisions when given.
- Setup default, draft persistence, API validation and database persistence work.
- Unauthorised count-run requests remain forbidden.
- HTML, PDF and CSV contain reporting-only labels and transfer detail.
- Full lint, unit/integration suite, regression checks, type-check, build and
  dependency audit pass.
- Production and backup databases pass `PRAGMA quick_check`; ballot and election
  aggregates remain unchanged by deployment and the supplementary run.

## Release and rollback

Release as an additive schema migration. The deployment pipeline takes a hot
SQLite backup before switching code. Code rollback is safe because the prior
release ignores the new question column and count-run settings. The historical
supplementary run is immutable evidence and may remain published after rollback.
