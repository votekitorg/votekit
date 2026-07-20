import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createElectionKeys, decryptAndShuffleBallots, encryptBallot } from '@/lib/browser-ballot-crypto';
import { hashManifest } from '@/lib/encrypted-ballots';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'votekit-encrypted-routes-'));
process.env.DATABASE_PATH = path.join(tmpDir, 'test.db');
process.env.VOTEKIT_ENCRYPTED_BALLOTS_ENABLED = 'true';

const CSRF = 'encrypted-route-csrf';
let db: any;
let electionId: number;
let adminPost: (request: NextRequest) => Promise<Response>;
let votePost: (request: NextRequest) => Promise<Response>;
let resultsGet: any;
let resultsPost: any;
let manifest: any;
let manifestHash: string;
let keys: any;
let encrypted: any;

function request(url: string, body: unknown, cookie: string): NextRequest {
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-csrf-token': CSRF, cookie: `csrf-token=${CSRF}; ${cookie}` },
    body: JSON.stringify(body)
  });
}

beforeAll(async () => {
  db = (await import('@/lib/db')).default;
  adminPost = (await import('@/app/api/admin/encrypted-election/route')).POST;
  votePost = (await import('@/app/api/vote/route')).POST;
  const resultRoutes = await import('@/app/api/results/[slug]/route');
  resultsGet = resultRoutes.GET;
  resultsPost = resultRoutes.POST;

  electionId = Number(db.prepare(`
    INSERT INTO plebiscites
      (slug, title, description, open_date, close_date, status, privacy_mode, privacy_threshold, envelope_plaintext_bytes)
    VALUES ('encrypted-route-test', 'Encrypted Route Test', 'desc', '2026-01-01T09:00', '2030-01-01T17:00',
      'open', 'encrypted', 1, 4096)
  `).run().lastInsertRowid);
  db.prepare(`
    INSERT INTO questions
      (plebiscite_id, title, type, options, display_order, preferential_type, public_id)
    VALUES (?, 'Approve?', 'yes_no', ?, 0, 'compulsory', 'approve-question')
  `).run(electionId, JSON.stringify(['Yes', 'No']));
  const server = await import('@/lib/encrypted-election-server');
  manifest = server.buildEncryptedManifest(db.prepare('SELECT * FROM plebiscites WHERE id = ?').get(electionId));
  manifestHash = await hashManifest(manifest);
  keys = await createElectionKeys(manifestHash, electionId);
  db.prepare(`UPDATE plebiscites SET manifest_hash = ?, recovery_confirmed_at = CURRENT_TIMESTAMP WHERE id = ?`)
    .run(manifestHash, electionId);
  db.prepare(`
    INSERT INTO encrypted_election_keys
      (plebiscite_id, public_key_jwk, encrypted_private_key, key_iv, protocol, manifest_hash)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(electionId, JSON.stringify(keys.publicKeyJwk), keys.encryptedPrivateKey, keys.keyIv, manifest.protocol, manifestHash);

  const voterId = Number(db.prepare('INSERT INTO voter_roll (email, plebiscite_id) VALUES (?, ?)')
    .run('voter@example.com', electionId).lastInsertRowid);
  db.prepare(`INSERT INTO sessions (id, email, plebiscite_id, expires_at) VALUES (?, ?, ?, ?)`)
    .run('encrypted-voter-session', 'voter@example.com', electionId, new Date(Date.now() + 3_600_000).toISOString());
  expect(voterId).toBeGreaterThan(0);

  const adminId = Number(db.prepare(`
    INSERT INTO admin_users (email, password_hash, role, active) VALUES ('admin@example.com', 'hash', 'admin', 1)
  `).run().lastInsertRowid);
  db.prepare(`
    INSERT INTO sessions (id, email, plebiscite_id, is_admin, admin_user_id, admin_role, expires_at)
    VALUES ('encrypted-admin-session', 'admin@example.com', -1, 1, ?, 'admin', ?)
  `).run(adminId, new Date(Date.now() + 3_600_000).toISOString());
  db.prepare(`INSERT INTO election_team_members (plebiscite_id, admin_user_id, role, assigned_by_admin_user_id)
    VALUES (?, ?, 'admin', ?)`
  ).run(electionId, adminId, adminId);

  encrypted = await encryptBallot(manifest, manifestHash, keys.publicKeyJwk, { 'approve-question': 'Yes' });
});

afterAll(() => {
  try { db.close(); } catch {}
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('encrypted ballot route lifecycle', () => {
  it('accepts ciphertext, freezes intake, publishes only shuffled plaintext, and verifies the receipt', async () => {
    const submissionId = crypto.randomUUID();
    const accepted = await votePost(request('http://localhost/api/vote', {
      plebisciteSlug: 'encrypted-route-test',
      submissionId,
      encryptedPackage: encrypted.encryptedPackage,
      commitment: encrypted.commitment,
      manifestHash
    }, 'voter-session-encrypted-route-test=encrypted-voter-session'));
    expect(accepted.status).toBe(200);
    const retry = await votePost(request('http://localhost/api/vote', {
      plebisciteSlug: 'encrypted-route-test',
      submissionId,
      encryptedPackage: encrypted.encryptedPackage,
      commitment: encrypted.commitment,
      manifestHash
    }, 'voter-session-encrypted-route-test=encrypted-voter-session'));
    expect(retry.status).toBe(200);
    expect(db.prepare('SELECT COUNT(*) AS c FROM participation WHERE plebiscite_id = ?').get(electionId).c).toBe(1);
    const openStored = db.prepare('SELECT ciphertext_package FROM encrypted_ballots WHERE plebiscite_id = ?').get(electionId);
    expect(openStored.ciphertext_package).not.toContain('approve-question');
    expect(openStored.ciphertext_package).not.toContain('"Yes"');
    expect(db.prepare('SELECT COUNT(*) AS c FROM votes').get().c).toBe(0);

    const started = await adminPost(request('http://localhost/api/admin/encrypted-election', {
      id: electionId, action: 'start-close'
    }, 'admin-session=encrypted-admin-session'));
    expect(started.status).toBe(200);
    const closeData = await started.json();
    expect(db.prepare('SELECT close_state FROM plebiscites WHERE id = ?').get(electionId).close_state).toBe('closing');

    const secondVoterId = Number(db.prepare('INSERT INTO voter_roll (email, plebiscite_id) VALUES (?, ?)')
      .run('late@example.com', electionId).lastInsertRowid);
    db.prepare('INSERT INTO sessions (id, email, plebiscite_id, expires_at) VALUES (?, ?, ?, ?)')
      .run('late-session', 'late@example.com', electionId, new Date(Date.now() + 3_600_000).toISOString());
    expect(secondVoterId).toBeGreaterThan(0);
    const lateEncrypted = await encryptBallot(manifest, manifestHash, keys.publicKeyJwk, { 'approve-question': 'No' });
    const late = await votePost(request('http://localhost/api/vote', {
      plebisciteSlug: 'encrypted-route-test', submissionId: crypto.randomUUID(),
      encryptedPackage: lateEncrypted.encryptedPackage, commitment: lateEncrypted.commitment, manifestHash
    }, 'voter-session-encrypted-route-test=late-session'));
    expect(late.status).toBe(403);
    expect(db.prepare('SELECT COUNT(*) AS c FROM encrypted_ballots WHERE plebiscite_id = ?').get(electionId).c).toBe(1);

    const ballots = await decryptAndShuffleBallots({
      manifest: closeData.manifest,
      manifestHash: closeData.manifestHash,
      encryptedPrivateKey: closeData.encryptedPrivateKey,
      keyIv: closeData.keyIv,
      closeSecret: keys.closeSecret,
      packages: closeData.packages
    });
    const completed = await adminPost(request('http://localhost/api/admin/encrypted-election', {
      id: electionId, action: 'complete-close', inputHash: closeData.inputHash, ballots
    }, 'admin-session=encrypted-admin-session'));
    expect(completed.status).toBe(200);
    expect(db.prepare('SELECT status FROM plebiscites WHERE id = ?').get(electionId).status).toBe('closed');
    expect(db.prepare('SELECT COUNT(*) AS c FROM encrypted_ballots WHERE plebiscite_id = ?').get(electionId).c).toBe(0);
    expect(JSON.parse(db.prepare('SELECT ballot_data FROM published_ballots WHERE plebiscite_id = ?').get(electionId).ballot_data))
      .toEqual({ 'approve-question': 'Yes' });

    // This lifecycle test inspects the published report payload; access-control
    // behavior is covered separately.
    db.prepare("UPDATE plebiscites SET results_visibility = 'public' WHERE id = ?").run(electionId);
    const results = await resultsGet(new NextRequest('http://localhost/api/results/encrypted-route-test'), {
      params: Promise.resolve({ slug: 'encrypted-route-test' })
    });
    expect(results.status).toBe(200);
    const resultBody = await results.json();
    expect(resultBody.questions[0].results.Yes).toBe(1);
    expect(resultBody.questions[0].publicBallots[0].receiptCode).toBe(encrypted.receipt);

    const lookup = await resultsPost(new NextRequest('http://localhost/api/results/encrypted-route-test', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ receipt: encrypted.receipt })
    }), { params: Promise.resolve({ slug: 'encrypted-route-test' }) });
    expect(lookup.status).toBe(200);
    expect((await lookup.json()).ballot).toEqual([{ title: 'Approve?', answer: 'Yes' }]);
  }, 30_000);
});
