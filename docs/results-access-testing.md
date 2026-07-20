# Results access testing

- [x] A closed private election rejects a visitor who only has its URL.
- [x] JSON, PDF and CSV routes enforce the same authorization.
- [x] A used anonymous voting code grants results access without becoming
  reusable for voting.
- [x] A registered elector can establish access with a fresh email code.
- [x] The Owner can read private results.
- [x] An unrelated VoteKit account cannot read the election.
- [x] Public access works only after the election setting is explicitly public.
- [x] Archived results remain Owner-only.
- [x] Result-access sessions are scoped to one election and expire.
- [x] Voter-facing copy explains the post-close access method before and after
  ballot submission.
- [ ] Production smoke: bare URL is denied, Owner session is accepted, and an
  Owner-approved test credential can access HTML/PDF/CSV.
