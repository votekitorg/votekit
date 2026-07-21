import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'votekit-count-runs-'));
process.env.DATABASE_PATH = path.join(tmpDir, 'test.db');
const CSRF = 'count-runs-csrf';

let db: any;
let post: any;
let questionId: number;
let sessionId: string;
let getResults: typeof import('@/lib/results').getPlebisciteResults;

function request(method: string) {
  return new NextRequest('http://localhost/api/admin/result-count-runs', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-csrf-token': CSRF, cookie: `csrf-token=${CSRF}; admin-session=${sessionId}` },
    body: JSON.stringify({ questionId, method })
  });
}

beforeAll(async () => {
  db = (await import('@/lib/db')).default;
  post = (await import('@/app/api/admin/result-count-runs/route')).POST;
  getResults = (await import('@/lib/results')).getPlebisciteResults;
  const ownerId = Number(db.prepare(`INSERT INTO admin_users
    (email, name, password_hash, role, authority_role, active)
    VALUES ('owner@counts.invalid', 'Returning Officer', 'hash', 'admin', 'owner', 1)`).run().lastInsertRowid);
  sessionId = 'count-runs-owner';
  db.prepare(`INSERT INTO sessions (id, email, plebiscite_id, is_admin, admin_user_id, admin_role, expires_at)
    VALUES (?, 'owner@counts.invalid', -1, 1, ?, 'admin', ?)`).run(sessionId, ownerId, new Date(Date.now() + 3_600_000).toISOString());
  const electionId = Number(db.prepare(`INSERT INTO plebiscites
    (slug, title, description, open_date, close_date, status, privacy_mode)
    VALUES ('alternative-counts', 'Alternative counts', 'Test', '2026-01-01T09:00', '2026-01-02T17:00', 'closed', 'legacy')`
  ).run().lastInsertRowid);
  questionId = Number(db.prepare(`INSERT INTO questions
    (plebiscite_id, title, type, options, display_order, public_id)
    VALUES (?, 'Rank the options', 'ranked_choice', ?, 0, 'ranked-count-question')`
  ).run(electionId, JSON.stringify(['A', 'B', 'C'])).lastInsertRowid);
  const insert = db.prepare('INSERT INTO votes (question_id, vote_data, receipt_code) VALUES (?, ?, ?)');
  [
    ['A', 'B', 'C'], ['A', 'C', 'B'], ['B', 'C', 'A'], ['C', 'A', 'B'], ['C', 'A', 'B']
  ].forEach((preferences, index) => insert.run(questionId, JSON.stringify({ preferences }), `count-receipt-${index}`));
});

afterAll(() => {
  try { db.close(); } catch {}
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('audited alternative count runs', () => {
  it('records a Condorcet count without replacing the declared IRV result', async () => {
    const primaryBefore = getResults('alternative-counts').questions[0].results;
    const response = await post(request('condorcet'));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.run.method).toBe('condorcet');
    expect(body.run.sourceBallotHash).toMatch(/^[a-f0-9]{64}$/);
    expect(body.run.resultHash).toMatch(/^[a-f0-9]{64}$/);
    expect(body.run.result.winner).toBeTruthy();
    const published = getResults('alternative-counts');
    expect(published.questions[0].results).toEqual(primaryBefore);
    expect(published.countRuns).toHaveLength(1);
    expect(db.prepare("SELECT COUNT(*) AS count FROM admin_audit_log WHERE action = 'result_count_run.create'").get().count).toBe(1);
  });

  it('records repeated recounts separately while producing identical fingerprints', async () => {
    const firstId = db.prepare('SELECT id FROM result_count_runs').get().id;
    const firstHash = db.prepare('SELECT result_hash FROM result_count_runs WHERE id = ?').get(firstId).result_hash;
    const response = await post(request('condorcet'));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.run.id).not.toBe(firstId);
    expect(body.run.resultHash).toBe(firstHash);
    expect(db.prepare('SELECT COUNT(*) AS count FROM result_count_runs').get().count).toBe(2);
  });
});
