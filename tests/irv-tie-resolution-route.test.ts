import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'votekit-irv-resolution-'));
process.env.DATABASE_PATH = path.join(tmpDir, 'test.db');
const CSRF = 'irv-resolution-csrf';

let db: any;
let post: (request: NextRequest) => Promise<Response>;
let getResults: typeof import('@/lib/results').getPlebisciteResults;
let sessionId: string;
let questionId: number;
let ownerId: number;
let createResultCountRun: typeof import('@/lib/result-count-runs').createResultCountRun;

function request(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/admin/irv-ties', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-csrf-token': CSRF,
      cookie: `csrf-token=${CSRF}; admin-session=${sessionId}`
    },
    body: JSON.stringify(body)
  });
}

beforeAll(async () => {
  db = (await import('@/lib/db')).default;
  post = (await import('@/app/api/admin/irv-ties/route')).POST;
  getResults = (await import('@/lib/results')).getPlebisciteResults;
  createResultCountRun = (await import('@/lib/result-count-runs')).createResultCountRun;

  ownerId = Number(db.prepare(`
    INSERT INTO admin_users (email, name, password_hash, role, authority_role, active)
    VALUES ('owner@example.com', 'Owner', 'hash', 'admin', 'owner', 1)
  `).run().lastInsertRowid);
  sessionId = 'irv-resolution-owner';
  db.prepare(`INSERT INTO sessions (id, email, plebiscite_id, is_admin, admin_user_id, admin_role, expires_at)
    VALUES (?, 'owner@example.com', -1, 1, ?, 'admin', ?)`).run(sessionId, ownerId, new Date(Date.now() + 3_600_000).toISOString());

  const electionId = Number(db.prepare(`
    INSERT INTO plebiscites (slug, title, description, open_date, close_date, status, privacy_mode)
    VALUES ('irv-tie-election', 'IRV Tie Election', 'Tie test', '2026-01-01T09:00', '2026-01-02T17:00', 'closed', 'legacy')
  `).run().lastInsertRowid);
  questionId = Number(db.prepare(`
    INSERT INTO questions (plebiscite_id, title, type, options, display_order, public_id)
    VALUES (?, 'Preferred day', 'ranked_choice', ?, 0, 'irv-tie-question')
  `).run(electionId, JSON.stringify(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Saturday'])).lastInsertRowid);
  const ballots = [
    ['Monday'], ['Monday'], ['Monday'],
    ['Tuesday'], ['Wednesday'], ['Thursday'], ['Saturday', 'Monday']
  ];
  const insert = db.prepare('INSERT INTO votes (question_id, vote_data, receipt_code) VALUES (?, ?, ?)');
  ballots.forEach((preferences, index) => insert.run(questionId, JSON.stringify({ preferences }), `receipt-${index}`));
});

afterAll(() => {
  try { db.close(); } catch {}
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('POST /api/admin/irv-ties', () => {
  it('records an immutable audited exclusion decision and continues the count', async () => {
    const initial = getResults('irv-tie-election').questions[0].results;
    expect(initial.pendingTie).toEqual({
      round: 1, type: 'exclusion', tiedCandidates: ['Saturday', 'Thursday', 'Tuesday', 'Wednesday']
    });

    const countRun = createResultCountRun({ questionId, method: 'irv', adminUserId: ownerId });
    expect(countRun.status).toBe('pending_tie');

    const response = await post(request({
      questionId,
      countRunId: countRun.id,
      round: 1,
      type: 'exclusion',
      selectedCandidate: 'Tuesday',
      method: 'drawing_lots',
      note: 'Draw observed by the Returning Officer.'
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.pendingTie).toMatchObject({ round: 2, type: 'exclusion' });
    expect(db.prepare('SELECT selected_candidate, method, note FROM irv_tie_resolutions WHERE question_id = ?').get(questionId)).toEqual({
      selected_candidate: 'Tuesday', method: 'drawing_lots', note: 'Draw observed by the Returning Officer.'
    });
    expect(db.prepare("SELECT COUNT(*) AS count FROM admin_audit_log WHERE action = 'irv.tie.resolve' AND target_id = ?").get(String(questionId)).count).toBe(1);
    expect(db.prepare("SELECT COUNT(*) AS count FROM admin_audit_log WHERE action = 'result_count_run.create'").get().count).toBe(1);
    expect(db.prepare('SELECT COUNT(*) AS count FROM result_count_runs WHERE question_id = ?').get(questionId).count).toBe(2);
    expect(getResults('irv-tie-election').questions[0].results.rounds[0].eliminated).toEqual(['Tuesday']);
  });

  it('rejects attempts to overwrite a completed round decision', async () => {
    const response = await post(request({
      questionId,
      round: 1,
      type: 'exclusion',
      selectedCandidate: 'Wednesday',
      method: 'drawing_lots'
    }));
    expect(response.status).toBe(409);
  });
});
