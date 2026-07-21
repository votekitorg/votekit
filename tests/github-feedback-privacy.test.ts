import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'votekit-feedback-privacy-'));
process.env.DATABASE_PATH = path.join(tmpDir, 'test.db');
const CSRF = 'feedback-privacy-csrf';

let db: any;
let electionId: number;
let questionId: number;
let ownerSession: string;
let getResults: typeof import('@/lib/results').getPlebisciteResults;
let resultsPost: any;
let adminPut: any;

function ownerRequest(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/admin/plebiscites', {
    method: 'PUT',
    headers: { 'content-type': 'application/json', 'x-csrf-token': CSRF, cookie: `csrf-token=${CSRF}; admin-session=${ownerSession}` },
    body: JSON.stringify(body)
  });
}

beforeAll(async () => {
  db = (await import('@/lib/db')).default;
  getResults = (await import('@/lib/results')).getPlebisciteResults;
  resultsPost = (await import('@/app/api/results/[slug]/route')).POST;
  adminPut = (await import('@/app/api/admin/plebiscites/route')).PUT;
  const ownerId = Number(db.prepare(`INSERT INTO admin_users
    (email, name, password_hash, role, authority_role, active)
    VALUES ('owner@privacy.invalid', 'Owner', 'hash', 'admin', 'owner', 1)`).run().lastInsertRowid);
  ownerSession = 'feedback-privacy-owner';
  db.prepare(`INSERT INTO sessions (id, email, plebiscite_id, is_admin, admin_user_id, admin_role, expires_at)
    VALUES (?, 'owner@privacy.invalid', -1, 1, ?, 'admin', ?)`).run(ownerSession, ownerId, new Date(Date.now() + 3_600_000).toISOString());

  electionId = Number(db.prepare(`INSERT INTO plebiscites
    (slug, title, description, open_date, close_date, status, privacy_mode, results_visibility)
    VALUES ('privacy-threshold', 'Privacy threshold', 'Test', '2026-01-01T09:00', '2026-01-02T17:00', 'closed', 'legacy', 'public')`
  ).run().lastInsertRowid);
  questionId = Number(db.prepare(`INSERT INTO questions
    (plebiscite_id, title, type, options, display_order, public_id)
    VALUES (?, 'Approve?', 'yes_no', ?, 0, 'privacy-question')`).run(electionId, JSON.stringify(['Yes', 'No'])).lastInsertRowid);
  db.prepare('INSERT INTO votes (question_id, vote_data, receipt_code) VALUES (?, ?, ?)')
    .run(questionId, JSON.stringify({ choice: 'Yes' }), 'a'.repeat(32));
  db.prepare('INSERT INTO votes (question_id, vote_data, receipt_code) VALUES (?, ?, ?)')
    .run(questionId, JSON.stringify({ choice: 'No' }), 'b'.repeat(32));
});

afterAll(() => {
  try { db.close(); } catch {}
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('anonymous ballot publication', () => {
  it('defaults to 20 and suppresses the public ballot list without hiding aggregate results', () => {
    const election = db.prepare('SELECT privacy_threshold, ballot_publication_mode FROM plebiscites WHERE id = ?').get(electionId);
    expect(election).toEqual({ privacy_threshold: 20, ballot_publication_mode: 'threshold' });
    const results = getResults('privacy-threshold');
    expect(results.questions[0].results).toEqual({ Yes: 1, No: 1 });
    expect(results.questions[0].publicBallots).toEqual([]);
  });

  it('allows private legacy receipt lookup below the publication threshold', async () => {
    const response = await resultsPost(new NextRequest('http://localhost/api/results/privacy-threshold', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ receipt: 'a'.repeat(32) })
    }), { params: Promise.resolve({ slug: 'privacy-threshold' }) });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ found: true, ballot: [{ title: 'Approve?', answer: 'Yes' }] });
  });

  it('lets only the Owner set a draft publication rule and locks it after opening', async () => {
    const draftId = Number(db.prepare(`INSERT INTO plebiscites
      (slug, title, description, open_date, close_date, status)
      VALUES ('publication-draft', 'Draft', 'Test', '2027-01-01T09:00', '2027-01-02T17:00', 'draft')`).run().lastInsertRowid);
    const changed = await adminPut(ownerRequest({ id: draftId, action: 'set_ballot_publication', mode: 'always', threshold: 20 }));
    expect(changed.status).toBe(200);
    expect(db.prepare('SELECT ballot_publication_mode FROM plebiscites WHERE id = ?').get(draftId).ballot_publication_mode).toBe('always');
    db.prepare("UPDATE plebiscites SET status = 'open' WHERE id = ?").run(draftId);
    const locked = await adminPut(ownerRequest({ id: draftId, action: 'set_ballot_publication', mode: 'threshold', threshold: 30 }));
    expect(locked.status).toBe(409);
    expect(db.prepare("SELECT COUNT(*) AS count FROM admin_audit_log WHERE action = 'plebiscite.ballot_publication.change'").get().count).toBe(1);
  });
});
