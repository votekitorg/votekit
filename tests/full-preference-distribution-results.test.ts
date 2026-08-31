import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'votekit-full-distribution-'));
process.env.DATABASE_PATH = path.join(tmpDir, 'test.db');

let db: any;
let getResults: typeof import('@/lib/results').getPlebisciteResults;
let buildResultsCsv: typeof import('@/lib/results').buildResultsCsv;
let buildEncryptedManifest: typeof import('@/lib/encrypted-election-server').buildEncryptedManifest;

beforeAll(async () => {
  db = (await import('@/lib/db')).default;
  ({ getPlebisciteResults: getResults, buildResultsCsv } = await import('@/lib/results'));
  ({ buildEncryptedManifest } = await import('@/lib/encrypted-election-server'));
  const electionId = Number(db.prepare(`INSERT INTO plebiscites
    (slug, title, description, open_date, close_date, status, privacy_mode, ballot_publication_mode)
    VALUES ('full-distribution-primary', 'Full distribution', 'Test', '2026-01-01T09:00', '2026-01-02T17:00', 'closed', 'legacy', 'always')`
  ).run().lastInsertRowid);
  const questionId = Number(db.prepare(`INSERT INTO questions
    (plebiscite_id, title, type, options, display_order, preferential_type, public_id, continue_after_majority)
    VALUES (?, 'Rank options', 'ranked_choice', ?, 0, 'optional', 'full-distribution-question', 1)`
  ).run(electionId, JSON.stringify(['A', 'B', 'C'])).lastInsertRowid);
  const insert = db.prepare('INSERT INTO votes (question_id, vote_data, receipt_code) VALUES (?, ?, ?)');
  [
    ['A'], ['A'], ['A'], ['A'], ['A'], ['A'],
    ['B'], ['B'], ['B'], ['C', 'B'], ['C']
  ].forEach((preferences, index) => insert.run(questionId, JSON.stringify({ preferences }), `full-${index}`));
});

afterAll(() => {
  try { db.close(); } catch {}
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('configured full preference distribution', () => {
  it('publishes the official majority separately from reporting-only final-two rounds', () => {
    const election = db.prepare("SELECT * FROM plebiscites WHERE slug = 'full-distribution-primary'").get();
    expect(buildEncryptedManifest(election).questions[0].continueAfterMajority).toBe(true);
    db.prepare('UPDATE questions SET continue_after_majority = 0 WHERE plebiscite_id = ?').run(election.id);
    expect(buildEncryptedManifest(election).questions[0]).not.toHaveProperty('continueAfterMajority');
    db.prepare('UPDATE questions SET continue_after_majority = 1 WHERE plebiscite_id = ?').run(election.id);

    const data = getResults('full-distribution-primary');
    const question = data.questions[0];

    expect(question.continueAfterMajority).toBe(true);
    expect(question.results).toMatchObject({
      winner: 'A', decisiveRound: 1, continuedForReporting: true, exhaustedBallots: 1
    });
    expect(question.results.rounds).toHaveLength(3);
    expect(question.results.rounds[1]).toMatchObject({
      supplementary: true,
      eliminated: ['C'],
      transfer: { from: 'C', to: { B: 1 }, exhausted: 1 }
    });
    expect(question.results.rounds[2]).toMatchObject({ supplementary: true, votes: { A: 6, B: 4 } });

    const csv = buildResultsCsv('full-distribution-primary', data);
    expect(csv).toContain('Continued for reporting,Yes');
    expect(csv).toContain('Supplementary distribution');
    expect(csv).toContain('C excluded: 1 to B; 1 exhausted.');
  });
});
