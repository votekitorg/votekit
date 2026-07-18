# Voter access testing checklist

- [ ] Existing email voter can authenticate and vote once.
- [ ] Phone-only voter can authenticate by SMS and vote once.
- [ ] Registered voter one-click link authenticates only for its election.
- [x] Admin can generate 500 anonymous codes and export codes plus links.
- [x] Database contains hashes, never plaintext anonymous or voter-link tokens.
- [x] Anonymous code link does not put the credential in an HTTP request URL.
- [x] Anonymous code is consumed only with a successful ballot transaction.
- [ ] Concurrent use of one anonymous code produces exactly one ballot.
- [x] Draft anonymous election opens without a voter roll when codes exist.
- [x] Draft voter-roll election still requires at least one voter.
- [x] Access configuration is locked after opening.
- [x] Observer cannot generate codes, links, or modify voters.
- [x] Close-time cleanup and ballot shuffling remain intact.
- [x] Lint, tests, regression checks, type-check, build, and audit pass.
