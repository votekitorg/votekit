# VoteKit Results Report

## Problem

Election results are correct and verifiable, but the current presentation does not communicate that confidence clearly enough. The earlier VoteKit results experience had richer visual summaries and print styling, but only offered browser printing rather than a true PDF download.

## Goal

Make closed-election results immediately understandable, professionally presentable and independently verifiable on screen and in a durable PDF report.

## Users

- Voters confirming the outcome and their receipt
- Election administrators publishing a formal result
- Observers reviewing the method and count
- Organisations retaining or distributing a result record

## Requirements

- A prominent result-at-a-glance section with participation and report identity
- Clear outcomes, exact counts and percentages for every question
- Round-by-round IRV detail, including exhausted ballots and ties
- Condorcet rankings, pairwise information and method explanation
- Privacy and receipt-verification explanation without exposing voter identity
- Encrypted-election audit hashes when present
- One-click PDF download and existing CSV data export
- A report fingerprint derived from the published result data
- Mobile, desktop and print-friendly presentation

## Privacy and trust rules

- Never include voter identity or voter-roll data in results or reports
- Eligibility is presented only as an aggregate credential count
- Individual anonymous ballots remain subject to the existing publication threshold
- The PDF summarises verification and hashes; raw anonymous ballots remain in the online/CSV verification data
- Do not call a scheduled date an actual event timestamp

## Acceptance criteria

- Closed results expose an attractive PDF download with the correct filename and content type
- The PDF opens successfully and contains all election questions and outcomes
- The public page shows ballots cast, eligible credentials, participation rate, question count and fingerprint
- All supported voting methods have an intuitive summary plus exact detailed results
- Existing CSV and receipt verification continue to work
- Tests, lint, type-check, regression checks and production build pass
