# Results access

## Decision

Election results are private by default. Closing an election makes its final
count available, but possession of the results URL alone grants no access.

The authorization matrix is:

- The VoteKit Owner may view every election, including archived elections.
- Returning Officers, Admins and Observers may view only elections to which
  they are assigned. Archived elections remain Owner-only.
- Voter-roll electors re-verify a registered email address or phone number.
  Existing private voter links can also establish results access.
- Anonymous-code electors enter the original voting code. A used code remains
  valid for reading results but can never be used to submit another ballot.
- Anyone may view only when the Owner explicitly changes Results visibility to
  Public for that election.

The same authorization is enforced by the HTML results page, JSON API, receipt
lookup, PDF report and CSV export. A successful elector check creates a private
12-hour HTTP-only results session scoped to that election.

## Privacy boundary

Results authorization proves only that a credential belongs to the election.
The voter-roll row or anonymous-code row is never joined to ballot contents.
Receipt lookup continues to operate only against the shuffled anonymous ballot
publication. Result visibility changes are recorded in the admin audit log.

## Elector communication

Before ballot submission and on the confirmation screen VoteKit explains how
to return after close:

- voter-roll electors use their registered email or phone;
- anonymous-code electors retain and reuse their original voting code;
- eligibility verification is separate from the anonymous ballot.

The original private ballot link preserves its credential fragment when it
redirects from a closed election to the results page.
