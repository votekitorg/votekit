import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Isolated temp database; set before the app modules are imported.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'votekit-vitest-'));
process.env.DATABASE_PATH = path.join(tmpDir, 'test.db');

const CSRF = 'test-csrf-token';
const VOTE_COUNT = 30;

let db: any;
let closePlebisciteWithPrivacyHardening: (id: number) => void;
let adminPut: (request: NextRequest) => Promise<Response>;
let resultsGet: (request: NextRequest, ctx: { params: { slug: string } }) => Promise<Response>;

let plebisciteA: number;
let plebisciteB: number;
let questionA: number;
let questionB: number;
let originalVoteIdsA: number[] = [];
let originalReceiptOrderA: string[] = [];
let originalRowsB: any[] = [];

function futureIso(): string {
  return new Date(Date.now() + 60 * 60 * 1000).toISOString();
}

function adminCloseRequest(id: number): NextRequest {
  return new NextRequest('http://localhost/api/admin/plebiscites', {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
      'x-csrf-token': CSRF,
      cookie: `csrf-token=${CSRF}; admin-session=admin-session-1`
    },
    body: JSON.stringify({ id, action: 'close' })
  });
}

beforeAll(async () => {
  const dbModule = await import('@/lib/db');
  db = dbModule.default;
  closePlebisciteWithPrivacyHardening = dbModule.closePlebisciteWithPrivacyHardening;
  adminPut = (await import('@/app/api/admin/plebiscites/route')).PUT;
  resultsGet = (await import('@/app/api/results/[slug]/route')).GET;

  // Two open elections, one question each.
  plebisciteA = Number(db.prepare(`
    INSERT INTO plebiscites (slug, title, description, open_date, close_date, status)
    VALUES ('close-hardening-a', 'Election A', 'desc', '2026-01-01T09:00', '2030-01-01T17:00', 'open')
  `).run().lastInsertRowid);
  plebisciteB = Number(db.prepare(`
    INSERT INTO plebiscites (slug, title, description, open_date, close_date, status)
    VALUES ('close-hardening-b', 'Election B', 'desc', '2026-01-01T09:00', '2030-01-01T17:00', 'open')
  `).run().lastInsertRowid);

  questionA = Number(db.prepare(`
    INSERT INTO questions (plebiscite_id, title, type, options, display_order)
    VALUES (?, 'Approve?', 'yes_no', ?, 0)
  `).run(plebisciteA, JSON.stringify(['Yes', 'No'])).lastInsertRowid);
  questionB = Number(db.prepare(`
    INSERT INTO questions (plebiscite_id, title, type, options, display_order)
    VALUES (?, 'Approve?', 'yes_no', ?, 0)
  `).run(plebisciteB, JSON.stringify(['Yes', 'No'])).lastInsertRowid);

  // Ballots for A in known insertion order (the correlation being destroyed).
  const insertVote = db.prepare('INSERT INTO votes (question_id, vote_data, receipt_code) VALUES (?, ?, ?)');
  for (let i = 1; i <= VOTE_COUNT; i++) {
    insertVote.run(questionA, JSON.stringify({ choice: i % 2 === 1 ? 'Yes' : 'No' }), `receipt-a-${String(i).padStart(3, '0')}`);
  }
  for (let i = 1; i <= 5; i++) {
    insertVote.run(questionB, JSON.stringify({ choice: 'Yes' }), `receipt-b-${String(i).padStart(3, '0')}`);
  }

  originalVoteIdsA = db.prepare('SELECT id FROM votes WHERE question_id = ? ORDER BY id').all(questionA).map((r: any) => r.id);
  originalReceiptOrderA = db.prepare('SELECT receipt_code FROM votes WHERE question_id = ? ORDER BY id').all(questionA).map((r: any) => r.receipt_code);
  originalRowsB = db.prepare('SELECT id, question_id, vote_data, receipt_code FROM votes WHERE question_id = ? ORDER BY id').all(questionB);

  // Sessions: two voter sessions for A, one for B, one admin session (plebiscite_id = -1).
  const insertSession = db.prepare('INSERT INTO sessions (id, email, plebiscite_id, is_admin, expires_at) VALUES (?, ?, ?, 0, ?)');
  insertSession.run('voter-a-1', 'a1@example.com', plebisciteA, futureIso());
  insertSession.run('voter-a-2', 'a2@example.com', plebisciteA, futureIso());
  insertSession.run('voter-b-1', 'b1@example.com', plebisciteB, futureIso());

  const adminUserId = Number(db.prepare(`
    INSERT INTO admin_users (email, name, password_hash, role, active)
    VALUES ('admin@example.com', 'Admin', 'test-hash-not-a-real-password', 'admin', 1)
  `).run().lastInsertRowid);
  db.prepare(`
    INSERT INTO sessions (id, email, plebiscite_id, is_admin, admin_user_id, admin_role, expires_at)
    VALUES ('admin-session-1', 'admin@example.com', -1, 1, ?, 'admin', ?)
  `).run(adminUserId, futureIso());

  // Verification codes: used + unused for A, used for B.
  const insertCode = db.prepare('INSERT INTO verification_codes (email, plebiscite_id, code, expires_at, used) VALUES (?, ?, ?, ?, ?)');
  insertCode.run('a1@example.com', plebisciteA, '111111', futureIso(), 1);
  insertCode.run('a2@example.com', plebisciteA, '222222', futureIso(), 1);
  insertCode.run('a3@example.com', plebisciteA, '333333', futureIso(), 0);
  insertCode.run('b1@example.com', plebisciteB, '444444', futureIso(), 1);
});

afterAll(() => {
  try { db.close(); } catch {}
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('close-time privacy hardening', () => {
  it('rolls back everything if hardening fails mid-transaction', () => {
    // Poison the re-insert step with a trigger so the failure happens AFTER
    // the delete inside the transaction.
    db.exec(`CREATE TRIGGER poison_votes_insert BEFORE INSERT ON votes BEGIN SELECT RAISE(ABORT, 'poison'); END;`);
    try {
      expect(() => closePlebisciteWithPrivacyHardening(plebisciteA)).toThrow();
    } finally {
      db.exec('DROP TRIGGER poison_votes_insert');
    }

    // Nothing changed: still open, ballots intact in original order, sessions
    // and used codes still present.
    expect(db.prepare('SELECT status FROM plebiscites WHERE id = ?').get(plebisciteA).status).toBe('open');
    const ids = db.prepare('SELECT id FROM votes WHERE question_id = ? ORDER BY id').all(questionA).map((r: any) => r.id);
    expect(ids).toEqual(originalVoteIdsA);
    expect(db.prepare('SELECT COUNT(*) as c FROM sessions WHERE plebiscite_id = ?').get(plebisciteA).c).toBe(2);
    expect(db.prepare('SELECT COUNT(*) as c FROM verification_codes WHERE plebiscite_id = ? AND used = 1').get(plebisciteA).c).toBe(2);
  });

  it('closes via the admin route with hardening applied', async () => {
    const response = await adminPut(adminCloseRequest(plebisciteA));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.status).toBe('closed');
    expect(db.prepare('SELECT status FROM plebiscites WHERE id = ?').get(plebisciteA).status).toBe('closed');
  });

  it('rebuilds ballots with fresh IDs in an order decorrelated from insertion', () => {
    const rows = db.prepare('SELECT id, receipt_code FROM votes WHERE question_id = ? ORDER BY id').all(questionA);
    expect(rows).toHaveLength(VOTE_COUNT);

    const newIds = rows.map((r: any) => r.id);
    const overlap = newIds.filter((id: number) => originalVoteIdsA.includes(id));
    expect(overlap).toEqual([]);

    // Probability the shuffled order equals the original is 1/30! — treat a
    // match as failure.
    const newReceiptOrder = rows.map((r: any) => r.receipt_code);
    expect(newReceiptOrder.join(',')).not.toBe(originalReceiptOrderA.join(','));
    expect([...newReceiptOrder].sort()).toEqual([...originalReceiptOrderA].sort());
  });

  it('preserves receipt codes, contents, and question linkage exactly', () => {
    const rows = db.prepare('SELECT question_id, vote_data, receipt_code FROM votes WHERE question_id = ?').all(questionA);
    for (const row of rows) {
      const index = Number(row.receipt_code.split('-')[2]);
      expect(JSON.parse(row.vote_data)).toEqual({ choice: index % 2 === 1 ? 'Yes' : 'No' });
      expect(row.question_id).toBe(questionA);
    }
  });

  it('purges voter sessions and verification codes for the closed plebiscite only', () => {
    expect(db.prepare('SELECT COUNT(*) as c FROM sessions WHERE plebiscite_id = ?').get(plebisciteA).c).toBe(0);
    expect(db.prepare('SELECT COUNT(*) as c FROM sessions WHERE id = ?').get('admin-session-1').c).toBe(1);
    expect(db.prepare('SELECT COUNT(*) as c FROM sessions WHERE id = ?').get('voter-b-1').c).toBe(1);

    expect(db.prepare('SELECT COUNT(*) as c FROM verification_codes WHERE plebiscite_id = ?').get(plebisciteA).c).toBe(0);
    expect(db.prepare('SELECT COUNT(*) as c FROM verification_codes WHERE plebiscite_id = ?').get(plebisciteB).c).toBe(1);
  });

  it('leaves the unrelated plebiscite completely untouched', () => {
    const rowsB = db.prepare('SELECT id, question_id, vote_data, receipt_code FROM votes WHERE question_id = ? ORDER BY id').all(questionB);
    expect(rowsB).toEqual(originalRowsB);
    expect(db.prepare('SELECT status FROM plebiscites WHERE id = ?').get(plebisciteB).status).toBe('open');
  });

  it('runs only on the open -> closed transition (second close attempt rejected, ballots stable)', async () => {
    const idsAfterClose = db.prepare('SELECT id FROM votes WHERE question_id = ? ORDER BY id').all(questionA).map((r: any) => r.id);

    expect(() => closePlebisciteWithPrivacyHardening(plebisciteA)).toThrow(/open/i);
    const response = await adminPut(adminCloseRequest(plebisciteA));
    expect(response.status).toBe(400);

    const idsAfterRetry = db.prepare('SELECT id FROM votes WHERE question_id = ? ORDER BY id').all(questionA).map((r: any) => r.id);
    expect(idsAfterRetry).toEqual(idsAfterClose);
  });

  it('keeps results and receipt verification fully reproducible after hardening', async () => {
    const response = await resultsGet(
      new NextRequest('http://localhost/api/results/close-hardening-a'),
      { params: { slug: 'close-hardening-a' } }
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    const question = body.questions[0];
    expect(question.totalVotes).toBe(VOTE_COUNT);
    expect(question.results).toEqual({ Yes: 15, No: 15 });

    const publishedReceipts = question.publicBallots.map((b: any) => b.receiptCode).sort();
    expect(publishedReceipts).toEqual([...originalReceiptOrderA].sort());
  });
});
