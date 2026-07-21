# GitHub Feedback Release Plan

Date: 2026-07-21
Issues: #4, #5, #6, #7, #8

## Product decisions

### Form colour accessibility (#4)

VoteKit does not yet offer a complete dark theme. The site will explicitly use
light form controls and explicit foreground/background colours so an operating
system dark preference cannot produce unreadable text.

### Anonymous ballot publication (#5)

- Aggregate results and winners remain available to authorised results viewers.
- Individual anonymous ballot records are published only when the election's
  publication rule permits it.
- The default rule is a minimum of 20 accepted ballots.
- An Owner may set a higher threshold, or explicitly choose to always publish,
  while the election is a draft.
- The rule is locked when voting opens and every change is audited.
- A holder of a valid private receipt may still retrieve the matching recorded
  ballot after close, even when the public ballot list is suppressed.
- Existing elections that still use the former system default are migrated to
  the safer threshold of 20 unless they had an explicit always-publish setting.

### Pre-opening voter experience (#6)

- A guessed or unauthorised draft URL continues to reveal no election details.
- A valid private voter-link token or anonymous voting code may retrieve a
  limited preview containing the election name and scheduled Brisbane opening
  time.
- Preview validation must not create a session, mark a code used, or disclose
  voter identity.

### Closing time (#7)

- The election creation form no longer pre-fills a closing timestamp.
- The organiser must deliberately choose a fixed closing date and time.
- The interface states that all times are Australia/Brisbane and shows the
  selected instant on review.
- This avoids silently promising a seven-day voting period while preserving the
  closing date bound into an encrypted election's recovery manifest.

### Alternative counts (#8)

- Owners and Returning Officers may create an alternative count for a closed
  IRV or Condorcet question using either compatible method.
- A count run never changes the declared result or the frozen ballots.
- Each run stores the method, full result snapshot, applicable IRV tie
  decisions, creator, timestamp, source ballot-set fingerprint and result
  fingerprint.
- Alternative counts are visible in the official results and exports.
- An unresolved IRV tie is recorded as pending rather than resolved
  arbitrarily; after an audited tie decision, a new run can be created.

## Acceptance criteria

1. Dark-preferring browsers display readable text in every standard VoteKit
   input, textarea and select.
2. New elections default to a public-ballot threshold of 20.
3. Only an Owner can change the publication rule, only before opening.
4. Public ballot arrays and exports obey the rule for encrypted and legacy
   elections, while receipt lookup remains functional.
5. Invalid draft links return the existing generic response; valid private
   credentials receive the limited pre-opening preview.
6. Election creation cannot proceed without an explicit valid closing time.
7. An alternative IRV or Condorcet count can be created only for a compatible
   ranked question in a closed, accessible election.
8. Count runs are immutable, audited and fingerprinted, and appear without
   replacing the primary result.
9. Migrations are backwards compatible and pass against a production-shaped
   database copy.
10. Unit, route, security, regression, lint, type-check and production build
    gates pass before release.

## Rollback

The release remains compatible with the current SQLite data. Rollback uses the
previous immutable release and database backup. New publication settings and
count-run tables are additive; an older release ignores them.
