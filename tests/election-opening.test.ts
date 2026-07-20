import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'votekit-opening-'));
process.env.DATABASE_PATH = path.join(tmpDir, 'test.db');

let db: any;
let openElectionNow: typeof import('@/lib/election-opening').openElectionNow;
let reconcileScheduledElection: typeof import('@/lib/election-opening').reconcileScheduledElection;

function brisbaneInput(date: Date): string {
  return new Date(date.getTime() + 10 * 60 * 60 * 1000).toISOString().slice(0, 16);
}

function createElection(accessMode: 'voter_roll' | 'anonymous_codes'): number {
  return Number(db.prepare(`
    INSERT INTO plebiscites
      (slug, title, description, open_date, close_date, opening_mode, status, privacy_mode, access_mode)
    VALUES (?, 'Scheduled election', 'Tests automatic opening', ?, ?, 'scheduled', 'draft', 'legacy', ?)
  `).run(
    `scheduled-${accessMode}-${Date.now()}-${Math.random()}`,
    brisbaneInput(new Date(Date.now() - 60_000)),
    brisbaneInput(new Date(Date.now() + 24 * 60 * 60 * 1000)),
    accessMode
  ).lastInsertRowid);
}

beforeAll(async () => {
  db = (await import('@/lib/db')).default;
  ({ openElectionNow, reconcileScheduledElection } = await import('@/lib/election-opening'));
});

afterAll(() => {
  try { db.close(); } catch {}
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('election opening workflow', () => {
  it('automatically opens a ready scheduled election and records the actual opening', async () => {
    const id = createElection('voter_roll');
    db.prepare(`INSERT INTO questions (plebiscite_id, title, type, options, display_order, public_id)
      VALUES (?, 'Approve?', 'yes_no', '["Yes","No"]', 0, ?)`).run(id, `question-${id}`);
    db.prepare('INSERT INTO voter_roll (email, plebiscite_id) VALUES (?, ?)').run(`voter-${id}@example.com`, id);

    const result = await reconcileScheduledElection({ id });
    const election = db.prepare('SELECT status, actual_opened_at, scheduled_open_attempted_at, scheduled_open_error FROM plebiscites WHERE id = ?').get(id);

    expect(result.opened).toBe(true);
    expect(election.status).toBe('open');
    expect(election.actual_opened_at).toBeTruthy();
    expect(election.scheduled_open_attempted_at).toBeTruthy();
    expect(election.scheduled_open_error).toBeNull();
    expect(db.prepare("SELECT COUNT(*) AS count FROM admin_audit_log WHERE action = 'plebiscite.open.scheduled' AND target_id = ?").get(String(id)).count).toBe(1);
  });

  it('fails closed once when scheduled setup is incomplete, then allows a deliberate manual override', async () => {
    const id = createElection('anonymous_codes');
    db.prepare(`INSERT INTO questions (plebiscite_id, title, type, options, display_order, public_id)
      VALUES (?, 'Approve?', 'yes_no', '["Yes","No"]', 0, ?)`).run(id, `question-${id}`);

    const failed = await reconcileScheduledElection({ id });
    expect(failed.opened).toBe(false);
    expect(db.prepare('SELECT status, scheduled_open_error FROM plebiscites WHERE id = ?').get(id)).toMatchObject({
      status: 'draft', scheduled_open_error: expect.stringContaining('Generate at least one')
    });

    db.prepare('INSERT INTO anonymous_access_codes (plebiscite_id, token_hash, batch_id) VALUES (?, ?, ?)')
      .run(id, `hash-${id}`, `batch-${id}`);
    expect((await reconcileScheduledElection({ id })).opened).toBe(false);
    expect(db.prepare('SELECT status FROM plebiscites WHERE id = ?').get(id).status).toBe('draft');

    const manual = await openElectionNow(id, { source: 'manual' });
    expect(manual.opened).toBe(true);
    expect(db.prepare('SELECT status FROM plebiscites WHERE id = ?').get(id).status).toBe('open');
  });
});
