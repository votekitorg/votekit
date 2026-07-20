# Election Timing and Preferential Tie Resolution

## Goals

- Remove the fragile creation-time opening timestamp that becomes stale while an election is configured.
- Make opening behaviour explicit, understandable and safe when voting credentials are added after creation.
- Ensure ranked-choice counting never changes an outcome through arbitrary or unsafe batch elimination.
- Make every non-ballot tie-break decision visible and auditable.

## Creation workflow

1. Basic information and voter access method
2. Questions and voting methods
3. Voting timing (the final input step)
4. Review and create

The default is **Open immediately when ready**. The election is created as a draft because voter-roll entries or anonymous codes are deliberately managed on the election page. Once setup is complete, the primary action is **Open Voting Now**.

The alternative is **Schedule opening for later**. VoteKit opens at the selected time only when questions, credentials and any encrypted recovery kit are ready. A scheduled election can always be opened early. If readiness fails at the scheduled time, VoteKit remains closed, records the reason and requires a deliberate manual opening after the issue is corrected.

The closing date defaults to seven days from creation and is always a hard voting cutoff.

## Ranked-choice tie rules

- Exclude exactly one lowest option per round.
- Resolve a tied exclusion by countback to the most recent round that separates the tied options.
- If countback cannot separate them, pause counting for a Returning Officer decision.
- Permitted recorded decisions are a supervised drawing of lots or the election's governing rules.
- A final-two tie also pauses for a recorded decision.
- Never use option order, alphabetical order or silent batch elimination.
- Publish the decision, method, note and subsequent recount on the results page, PDF and CSV, with a separate administrative audit event.

## Acceptance criteria

- Immediate opening is the visible default and no past-time validation occurs while completing earlier steps.
- Timing is the final configuration step.
- Scheduled elections open automatically on the first due system/public access check when ready.
- Incomplete scheduled elections fail closed and do not later open unexpectedly.
- Manual opening can override a future or failed schedule.
- Existing voter/code management remains on the election management page.
- The known seven-ballot test election reports an unresolved tied exclusion until a Returning Officer resolves it.
- A resolution advances the count one exclusion at a time and is immutable and audited.
