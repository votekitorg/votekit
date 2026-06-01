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
const irv = read('src/lib/irv.ts');
const condorcet = read('src/lib/condorcet.ts');

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
assert(!/INSERT INTO participation \([^)]*receipt_codes/.test(voteRoute), 'vote submission does not write receipt codes to participation');
assert(voteRoute.includes('validatePreferentialLength'), 'vote submission validates optional/compulsory preferential length explicitly');
assert(voteRoute.includes('preferential_type'), 'vote submission reads preferential_type');
assert(resultsRoute.includes('receipt_code, vote_data'), 'results API reads receipt codes from anonymous ballot records');
assert(resultsRoute.includes('publicBallots'), 'results API publishes anonymous ballots for verification after close');
assert(irv.includes('tiedCandidates'), 'IRV reports tied candidates instead of silently choosing a winner');
assert(!irv.includes('remainingCandidates.sort()[0]'), 'IRV no longer selects alphabetical winner for full tie');
assert(irv.includes('validPreferences.length === vote.length'), 'IRV validation rejects unknown candidates');
assert(condorcet.includes('validPreferences.length === vote.length'), 'Condorcet validation rejects unknown candidates');

if (process.exitCode) {
  process.exit(process.exitCode);
}
