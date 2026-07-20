# Results Report Testing Checklist

- [x] PDF endpoint rejects open/draft elections
- [x] PDF response has `application/pdf` and a safe attachment filename
- [x] Generated PDF begins with a valid PDF signature and is non-empty
- [x] Yes/no counts and percentages match JSON/CSV
- [x] Multiple-choice selection totals are labelled distinctly from ballot totals
- [x] IRV winner, rounds, eliminations, ties and exhausted ballots render
- [x] Condorcet winner/tie, rankings and pairwise results render
- [x] Zero-vote and long-label layouts remain readable
- [x] Eligibility and participation aggregates are accurate for voter-roll and anonymous-code elections
- [x] Receipt and encrypted audit explanations do not expose voter identity
- [x] Mobile and desktop results layouts are readable
- [x] PDF pages render visually without clipping or overlap
- [x] Existing results, privacy, vote and regression tests pass
