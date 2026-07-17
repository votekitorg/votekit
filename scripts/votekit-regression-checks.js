#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const assert = (condition, message) => {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exitCode = 1;
  } else {
    console.log(`PASS: ${message}`);
  }
};

const db = read('src/lib/db.ts');
const voteRoute = read('src/app/api/vote/route.ts');
const resultsRoute = read('src/app/api/results/[slug]/route.ts');
const resultsLib = read('src/lib/results.ts');
const irv = read('src/lib/irv.ts');
const condorcet = read('src/lib/condorcet.ts');
const email = read('src/lib/email.ts');
const auth = read('src/lib/auth.ts');
const adminAuthRoute = read('src/app/api/admin/auth/route.ts');
const adminUsersRoute = read('src/app/api/admin/users/route.ts');
const adminInvitationsRoute = read('src/app/api/admin/invitations/route.ts');
const adminVotersRoute = read('src/app/api/admin/voters/route.ts');
const verifyRoute = read('src/app/api/auth/verify/route.ts');
const confirmRoute = read('src/app/api/auth/confirm/route.ts');
const electionsRoute = read('src/app/api/elections/[slug]/route.ts');
const electionWindow = read('src/lib/election-window.ts');
const adminPlebiscitesRoute = read('src/app/api/admin/plebiscites/route.ts');
const resultsPage = read('src/app/results/[slug]/page.tsx');
const readme = read('README.md');
const envExample = read('.env.example');
const csrfRoute = read('src/app/api/csrf/route.ts');

const participationCreate = db.match(/CREATE TABLE IF NOT EXISTS participation \([\s\S]*?\);/);
assert(Boolean(participationCreate), 'participation table definition exists');
if (participationCreate) {
  assert(!participationCreate[0].includes('receipt_codes'), 'participation table does not store receipt codes');
  assert(!participationCreate[0].includes('voted_at'), 'participation table does not store precise voted_at timestamp');
}

const votesCreate = db.match(/CREATE TABLE IF NOT EXISTS votes \([\s\S]*?\);/);
assert(Boolean(votesCreate), 'votes table definition exists');
if (votesCreate) {
  assert(!votesCreate[0].includes('created_at'), 'anonymous votes table does not store precise created_at timestamp');
}

assert(db.includes("'condorcet'"), 'questions schema supports Condorcet questions');
assert(db.includes('crypto.randomBytes'), 'receipt codes use cryptographic randomness');
assert(email.includes('crypto.randomInt(100000, 1000000)'), 'verification codes use cryptographic randomness with six-digit bounds');
assert(!email.includes('Math.random'), 'email verification code generation does not use Math.random');
assert(!auth.includes('Math.random'), 'auth credential/session code paths do not use Math.random');
assert(!db.includes('Math.random'), 'database token/receipt code paths do not use Math.random');
assert(!/INSERT INTO participation \([^)]*receipt_codes/.test(voteRoute), 'vote submission does not write receipt codes to participation');
assert(voteRoute.includes('validatePreferentialLength'), 'vote submission validates optional/compulsory preferential length explicitly');
assert(voteRoute.includes('preferential_type'), 'vote submission reads preferential_type');
assert(resultsLib.includes('receipt_code, vote_data'), 'results helper reads receipt codes from anonymous ballot records');
assert(resultsLib.includes('publicBallots'), 'results helper publishes anonymous ballots for verification after close');
assert(irv.includes('tiedCandidates'), 'IRV reports tied candidates instead of silently choosing a winner');
assert(!irv.includes('remainingCandidates.sort()[0]'), 'IRV no longer selects alphabetical winner for full tie');
assert(irv.includes('validPreferences.length === vote.length'), 'IRV validation rejects unknown candidates');
assert(condorcet.includes('validPreferences.length === vote.length'), 'Condorcet validation rejects unknown candidates');
assert(voteRoute.includes('new Set(voteValue).size !== voteValue.length'), 'multiple-choice submission rejects duplicate selections');
assert(resultsLib.includes('new Set<string>(voteData.choices)'), 'multiple-choice tally counts each option at most once per ballot');
assert(condorcet.includes('tiedCandidates'), 'Condorcet/Schulze reports tied candidates instead of silently selecting by candidate order');
assert(resultsLib.includes('condorcetResult.tiedCandidates'), 'results helper exposes Condorcet/Schulze tie information');
assert(db.includes('UNIQUE(email, plebiscite_id)'), 'voter roll uniqueness is per election, not global');
assert(db.includes('INSERT INTO voter_roll_multi_election_migration (id, email, added_at, plebiscite_id)'), 'voter roll migration preserves row IDs referenced by participation');
assert(electionsRoute.includes("plebiscite.status === 'draft'"), 'public election API hides draft elections');
assert(voteRoute.includes('votingClosedError'), 'vote submission enforces the close-date hard cutoff');
assert(voteRoute.includes('submitVotes.immediate'), 'vote submission serializes atomically with election closure');
assert(verifyRoute.includes('votingClosedError'), 'verification enforces the close-date hard cutoff');
assert(confirmRoute.includes('votingClosedError'), 'code confirmation enforces the close-date hard cutoff');
assert(!electionWindow.includes('not_yet_open') && !electionWindow.includes('plebiscite.open_date'), 'open_date is not enforced as a voting blocker (status=open is authoritative)');
assert(resultsLib.includes("plebiscite.status !== 'closed'"), 'results remain unavailable until the election is closed');
assert(electionWindow.includes("`${trimmed}+10:00`"), 'timezone-naive close dates are interpreted as Australia/Brisbane time');
assert(db.includes('closePlebisciteWithPrivacyHardening'), 'close-time privacy hardening exists in the db layer');
assert(adminPlebiscitesRoute.includes('closePlebisciteWithPrivacyHardening'), 'admin close action shuffles ballots and purges identity artifacts');
assert(db.includes('crypto.randomInt('), 'ballot shuffle uses cryptographic randomness');
assert(!resultsPage.includes('localhost:3006') && !resultsPage.includes('VERCEL_URL'), 'results page does not self-fetch through localhost/Vercel URL');
assert(resultsPage.includes('getPlebisciteResults'), 'results page loads results through shared server-side results helper');
assert(!readme.includes('Vercel (Recommended)'), 'README does not recommend Vercel/serverless for real elections');
assert(!readme.includes('production-ready voting platform'), 'README no longer claims production-ready status before Phase 2 is complete');
assert(!readme.includes('JWT_SECRET') && !envExample.includes('JWT_SECRET'), 'unused JWT_SECRET docs are removed');
assert(readme.includes('Double-submit cookie'), 'README describes actual double-submit-cookie CSRF protection');
assert(auth.includes('getAdminRequestIp') && auth.includes("TRUST_PROXY_HEADERS === 'true'"), 'admin IP handling only trusts proxy headers when configured');
assert(auth.includes('.filter(Boolean).pop()'), 'trusted proxy handling ignores spoofable left-most forwarded addresses');
assert(auth.includes('email = ? OR ip_address = ?'), 'admin lockout checks both email and IP buckets');
assert(db.includes('ALTER TABLE admin_login_attempts ADD COLUMN email'), 'admin login attempts support per-email lockout');
assert(auth.includes('recordAdminAuditLog'), 'admin audit log helper exists');
assert(adminAuthRoute.includes('admin.login.success') && adminAuthRoute.includes('admin.login.failure'), 'admin login success and failure are audited');
assert(adminPlebiscitesRoute.includes('plebiscite.open') && adminPlebiscitesRoute.includes('plebiscite.close'), 'plebiscite lifecycle changes are audited');
assert(adminVotersRoute.includes('voter_roll.upload') && adminVotersRoute.includes('voter_roll.delete'), 'voter-roll changes are audited');
assert(adminUsersRoute.includes('admin_user.update') && adminInvitationsRoute.includes('admin_invitation.send') && adminInvitationsRoute.includes('admin_invitation.revoke'), 'admin-user and invitation changes are audited');
assert(auth.includes("'owner' | 'returning_officer' | 'admin' | 'observer'"), 'administrative role hierarchy is defined');
assert(auth.includes('canAssignRole') && auth.includes('canManageUserRole'), 'role assignment is enforced in the domain layer');
assert(db.includes('authority_role') && auth.includes('legacyRoleForAuthority'), 'new authority roles preserve legacy Admin/Observer rollback compatibility');
assert(auth.includes("crypto.randomBytes(32).toString('base64url')") && auth.includes("createHash('sha256')"), 'admin invitations use hashed 256-bit single-use secrets');
assert(db.includes('At least one active Owner') || auth.includes('At least one active Owner'), 'Owner continuity has a hard guardrail');
assert(!auth.includes('const csrfTokens') && !auth.includes('validateCSRFToken('), 'dead in-memory CSRF token store is removed');
assert(verifyRoute.includes('NEUTRAL_VERIFICATION_MESSAGE'), 'verification route uses neutral eligibility response');
assert(verifyRoute.includes('ipRateLimitKey') && verifyRoute.includes('globalRateLimitKey'), 'verification requests are throttled by IP and global buckets as well as email');
assert(verifyRoute.includes('incrementRateLimitKey(ipRateLimitKey)') && verifyRoute.includes('incrementRateLimitKey(globalRateLimitKey)'), 'verification route counts requests against IP and global throttles');
assert(adminVotersRoute.includes('canManageElection(adminSession'), 'unassigned and observer sessions cannot read voter-roll PII');
assert(adminVotersRoute.includes('voter roll is locked once an election opens'), 'voter-roll mutations are frozen after opening');
assert(db.includes('DELETE FROM verification_codes WHERE plebiscite_id = ?'), 'close cleanup purges all verification codes for the plebiscite');
assert(db.includes('DELETE FROM voter_verification_attempts WHERE plebiscite_id = ?'), 'close cleanup purges voter verification attempts');
assert(csrfRoute.includes("dynamic = 'force-dynamic'") && csrfRoute.includes("'Cache-Control': 'no-store, max-age=0'"), 'CSRF tokens are never statically generated or cached');

if (process.exitCode) {
  process.exit(process.exitCode);
}
