import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'votekit-ballot-distribution-'));
process.env.DATABASE_PATH = path.join(tmpDir, 'test.db');
const CSRF = 'ballot-distribution-csrf';

let db: any;
let post: (request: NextRequest) => Promise<Response>;
let getResults: typeof import('@/lib/results').getPlebisciteResults;
let buildResultsCsv: typeof import('@/lib/results').buildResultsCsv;
let electionId: number;
let ownerSessionId: string;

function request(ballotsDistributed: number, reason: string, sessionId = ownerSessionId) {
  return new NextRequest('http://localhost/api/admin/ballot-distribution', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-csrf-token': CSRF,
      cookie: `csrf-token=${CSRF}; admin-session=${sessionId}`
    },
    body: JSON.stringify({ plebisciteId: electionId, ballotsDistributed, reason })
  });
}

beforeAll(async () => {
  db = (await import('@/lib/db')).default;
  post = (await import('@/app/api/admin/ballot-distribution/route')).POST;
  ({ getPlebisciteResults: getResults, buildResultsCsv } = await import('@/lib/results'));

  const ownerId = Number(db.prepare(`INSERT INTO admin_users
    (email, name, password_hash, role, authority_role, active)
    VALUES ('owner@distribution.invalid', 'Election Owner', 'hash', 'admin', 'owner', 1)`).run().lastInsertRowid);
  ownerSessionId = 'ballot-distribution-owner';
  db.prepare(`INSERT INTO sessions (id, email, plebiscite_id, is_admin, admin_user_id, admin_role, expires_at)
    VALUES (?, 'owner@distribution.invalid', -1, 1, ?, 'admin', ?)`)
    .run(ownerSessionId, ownerId, new Date(Date.now() + 3_600_000).toISOString());

  electionId = Number(db.prepare(`INSERT INTO plebiscites
    (slug, title, description, open_date, close_date, status, access_mode, results_visibility)
    VALUES ('distribution-election', 'Distribution election', 'Test', '2026-01-01T09:00', '2026-01-02T17:00', 'closed', 'voter_roll', 'public')`
  ).run().lastInsertRowid);
  db.prepare(`INSERT INTO questions
    (plebiscite_id, title, type, options, display_order, public_id)
    VALUES (?, 'Approve?', 'yes_no', ?, 0, 'distribution-question')`)
    .run(electionId, JSON.stringify(['Yes', 'No']));

  const addVoter = db.prepare('INSERT INTO voter_roll (email, plebiscite_id) VALUES (?, ?)');
  const addParticipation = db.prepare('INSERT INTO participation (plebiscite_id, voter_roll_id) VALUES (?, ?)');
  for (let index = 0; index < 10; index += 1) {
    const voterId = Number(addVoter.run(`voter-${index}@distribution.invalid`, electionId).lastInsertRowid);
    if (index < 3) addParticipation.run(electionId, voterId);
  }
});

afterAll(() => {
  try { db.close(); } catch {}
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('audited ballots distributed reporting', () => {
  it('does not create an adjustment automatically and initially uses generated credentials', () => {
    const participation = getResults('distribution-election').participation;
    expect(participation).toMatchObject({
      totalVotes: 3,
      eligibleCredentials: 10,
      ballotsDistributed: 10,
      ballotsDistributedSource: 'generated_credentials',
      participationRate: 30,
      distributionAdjustments: []
    });
    expect(db.prepare('SELECT COUNT(*) AS count FROM ballot_distribution_adjustments').get().count).toBe(0);
  });

  it('records an immutable adjustment and uses it as the participation denominator', async () => {
    const response = await post(request(8, 'Two members opted out of email communications.'));
    expect(response.status).toBe(200);

    const participation = getResults('distribution-election').participation;
    expect(participation).toMatchObject({
      totalVotes: 3,
      eligibleCredentials: 10,
      ballotsDistributed: 8,
      ballotsDistributedSource: 'administrator_reported',
      participationRate: 37.5
    });
    expect(participation.distributionAdjustments).toHaveLength(1);
    expect(participation.distributionAdjustments[0]).toMatchObject({
      previousBallotsDistributed: 10,
      ballotsDistributed: 8,
      generatedCredentials: 10,
      adjustedByName: 'Election Owner',
      reason: 'Two members opted out of email communications.'
    });
    expect(db.prepare("SELECT COUNT(*) AS count FROM admin_audit_log WHERE action = 'ballot_distribution.adjust'").get().count).toBe(1);

    const csv = buildResultsCsv('distribution-election', getResults('distribution-election'));
    expect(csv).toContain('"Ballots distributed","8"');
    expect(csv).toContain('"Two members opted out of email communications."');
  });

  it('rejects impossible or unexplained adjustments without adding history', async () => {
    expect((await post(request(2, 'Too low'))).status).toBe(409);
    expect((await post(request(11, 'Too high'))).status).toBe(409);
    expect((await post(request(7, ''))).status).toBe(400);
    expect(db.prepare('SELECT COUNT(*) AS count FROM ballot_distribution_adjustments').get().count).toBe(1);
  });

  it('preserves each later correction rather than overwriting history', async () => {
    const response = await post(request(9, 'One opt-out was included in the distribution export after review.'));
    expect(response.status).toBe(200);
    const participation = getResults('distribution-election').participation;
    expect(participation.ballotsDistributed).toBe(9);
    expect(participation.participationRate).toBeCloseTo(33.3333);
    expect(participation.distributionAdjustments).toHaveLength(2);
    expect(participation.distributionAdjustments[1].previousBallotsDistributed).toBe(8);
  });
});
