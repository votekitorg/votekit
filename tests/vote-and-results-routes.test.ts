import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Point the app's lazy database singleton at an isolated temp file BEFORE the
// route modules (and therefore @/lib/db) are imported in beforeAll.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'votekit-vitest-'));
process.env.DATABASE_PATH = path.join(tmpDir, 'test.db');

const SLUG = 'integration-election';
const CSRF = 'test-csrf-token';

let db: any;
let votePost: (request: NextRequest) => Promise<Response>;
let resultsGet: (request: NextRequest, ctx: { params: Promise<{ slug: string }> }) => Promise<Response>;
let plebisciteId: number;
let questionId: number;

function createSession(id: string): void {
  db.prepare(`
    INSERT INTO sessions (id, email, plebiscite_id, is_admin, expires_at)
    VALUES (?, ?, ?, 0, ?)
  `).run(id, 'voter@example.com', plebisciteId, new Date(Date.now() + 60 * 60 * 1000).toISOString());
}

function voteRequest(sessionId: string, votes: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/vote', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-csrf-token': CSRF,
      cookie: `csrf-token=${CSRF}; voter-session-${SLUG}=${sessionId}`
    },
    body: JSON.stringify({ plebisciteSlug: SLUG, votes })
  });
}

function resultsRequest(): NextRequest {
  return new NextRequest(`http://localhost/api/results/${SLUG}`);
}

function pdfResultsRequest(): NextRequest {
  return new NextRequest(`http://localhost/api/results/${SLUG}?format=pdf`);
}

beforeAll(async () => {
  db = (await import('@/lib/db')).default;
  votePost = (await import('@/app/api/vote/route')).POST;
  resultsGet = (await import('@/app/api/results/[slug]/route')).GET;

  const plebisciteInsert = db.prepare(`
    INSERT INTO plebiscites (slug, title, description, open_date, close_date, status)
    VALUES (?, ?, ?, ?, ?, 'open')
  `).run(SLUG, 'Integration Election', 'Test election', '2026-01-01T09:00', '2030-01-01T17:00');
  plebisciteId = Number(plebisciteInsert.lastInsertRowid);

  const questionInsert = db.prepare(`
    INSERT INTO questions (plebiscite_id, title, type, options, display_order)
    VALUES (?, 'Pick options', 'multiple_choice', ?, 0)
  `).run(plebisciteId, JSON.stringify(['Alpha', 'Beta', 'Gamma']));
  questionId = Number(questionInsert.lastInsertRowid);

  db.prepare('INSERT INTO voter_roll (email, plebiscite_id) VALUES (?, ?)')
    .run('voter@example.com', plebisciteId);
});

afterAll(() => {
  try { db.close(); } catch {}
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('POST /api/vote (multiple choice)', () => {
  it('rejects duplicate selections with 400 and writes nothing', async () => {
    createSession('session-duplicate');
    const response = await votePost(voteRequest('session-duplicate', { [questionId]: ['Alpha', 'Alpha'] }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain('Duplicate selections');
    expect(db.prepare('SELECT COUNT(*) as count FROM participation').get().count).toBe(0);
    expect(db.prepare('SELECT COUNT(*) as count FROM votes').get().count).toBe(0);
  });

  it('accepts a valid unique selection and returns a receipt code', async () => {
    createSession('session-valid');
    const response = await votePost(voteRequest('session-valid', { [questionId]: ['Alpha', 'Beta'] }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.receiptCodes).toHaveLength(1);
    expect(db.prepare('SELECT COUNT(*) as count FROM participation').get().count).toBe(1);

    const stored = db.prepare('SELECT vote_data FROM votes').get();
    expect(JSON.parse(stored.vote_data)).toEqual({ choices: ['Alpha', 'Beta'] });
  });

  it('rejects a second submission from the same voter with 409 (exactly one ballot set)', async () => {
    createSession('session-again');
    const response = await votePost(voteRequest('session-again', { [questionId]: ['Gamma'] }));
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toContain('already voted');
    expect(db.prepare('SELECT COUNT(*) as count FROM participation').get().count).toBe(1);
    expect(db.prepare('SELECT COUNT(*) as count FROM votes').get().count).toBe(1);
  });
});

describe('GET /api/results/[slug]', () => {
  it('returns 403 while the election is still open', async () => {
    const response = await resultsGet(resultsRequest(), { params: Promise.resolve({ slug: SLUG }) });
    const pdfResponse = await resultsGet(pdfResultsRequest(), { params: Promise.resolve({ slug: SLUG }) });
    expect(response.status).toBe(403);
    expect(pdfResponse.status).toBe(403);
  });

  it('publishes results after close, tallying each option at most once per ballot', async () => {
    // Simulate a legacy/crafted row stored before duplicate rejection existed.
    db.prepare('INSERT INTO votes (question_id, vote_data, receipt_code) VALUES (?, ?, ?)')
      .run(questionId, JSON.stringify({ choices: ['Gamma', 'Gamma', 'Gamma'] }), 'crafted-receipt-code');

    db.prepare('UPDATE plebiscites SET status = ? WHERE id = ?').run('closed', plebisciteId);

    const response = await resultsGet(resultsRequest(), { params: Promise.resolve({ slug: SLUG }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.participation).toEqual({ totalVotes: 1, eligibleCredentials: 1, participationRate: 100 });
    const question = body.questions[0];
    expect(question.results).toEqual({ Alpha: 1, Beta: 1, Gamma: 1 });
    expect(question.publicBallots).toHaveLength(2);

    // Published ballots expose receipt code + contents only.
    for (const ballot of question.publicBallots) {
      expect(Object.keys(ballot).sort()).toEqual(['ballot', 'receiptCode']);
    }
  });

  it('downloads a valid official PDF result report for a closed election', async () => {
    const response = await resultsGet(pdfResultsRequest(), { params: Promise.resolve({ slug: SLUG }) });
    const pdf = Buffer.from(await response.arrayBuffer());

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/pdf');
    expect(response.headers.get('content-disposition')).toContain('integration-election-official-results.pdf');
    expect(pdf.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(3_000);
    if (process.env.RESULTS_PDF_OUTPUT) fs.writeFileSync(process.env.RESULTS_PDF_OUTPUT, pdf);
  });
});
