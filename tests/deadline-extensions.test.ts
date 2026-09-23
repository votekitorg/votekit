import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createElectionKeys, encryptBallot, decryptAndShuffleBallots } from '@/lib/browser-ballot-crypto';
import { hashManifest } from '@/lib/encrypted-ballots';
import { votingClosedError } from '@/lib/election-window';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'votekit-extensions-'));
process.env.DATABASE_PATH = path.join(dir, 'test.db');
process.env.VOTEKIT_ENCRYPTED_BALLOTS_ENABLED = 'true';
let db: any;
let post: typeof import('@/app/api/admin/deadline-extensions/route').POST;
let manifestFor: typeof import('@/lib/encrypted-election-server').buildEncryptedManifest;
const session = 'extension-owner';
const csrf = 'extension-csrf';
let index = 0;

function election(privacy = 'legacy', status = 'open') {
  return Number(db.prepare(`INSERT INTO plebiscites (slug,title,description,open_date,close_date,status,privacy_mode)
    VALUES (?, 'Test','Test','2020-01-01T09:00','2020-01-02T17:00',?,?)`).run(`extension-${index++}`, status, privacy).lastInsertRowid);
}
function request(id: number, extra: Record<string, unknown> = {}, who = session, token = csrf) {
  return new NextRequest('http://localhost/api/admin/deadline-extensions', { method: 'POST', headers: {
    'content-type': 'application/json', 'x-csrf-token': token, cookie: `csrf-token=${csrf}; admin-session=${who}`
  }, body: JSON.stringify({ plebisciteId: id, previousDeadline: '2020-01-02T17:00', newDeadline: '2099-01-01T17:00', reason: 'Allow additional time', ...extra }) });
}
beforeAll(async () => {
  db = (await import('@/lib/db')).default;
  post = (await import('@/app/api/admin/deadline-extensions/route')).POST;
  manifestFor = (await import('@/lib/encrypted-election-server')).buildEncryptedManifest;
  const owner = db.prepare(`INSERT INTO admin_users (email,name,password_hash,role,authority_role,active)
    VALUES ('owner@extensions.invalid','Owner','hash','admin','owner',1)`).run().lastInsertRowid;
  db.prepare(`INSERT INTO sessions(id,email,plebiscite_id,is_admin,admin_user_id,admin_role,expires_at)
    VALUES (?, 'owner@extensions.invalid',-1,1,?,'admin',?)`).run(session, owner, '2099-01-01T00:00:00Z');
});
afterAll(() => { db?.close(); fs.rmSync(dir, { recursive: true, force: true }); });

describe('audited deadline extensions', () => {
  it('publishes and freezes SFC configuration, binds it to the manifest and reports qualification', async () => {
    const create = (await import('@/app/api/admin/plebiscites/route')).POST;
    const rule = { referenceOption: 'SFC', numerator: 2, denominator: 3, comparison: 'strict' };
    const payload = { title: 'SFC route fixture', description: 'Test', close_date: '2099-01-01T17:00',
      questions: [{ title: 'Candidates', type: 'condorcet', options: ['A', 'B', 'SFC'], preferentialType: 'optional', sfcRule: rule }] };
    const createRequest = (body: unknown) => new NextRequest('http://localhost/api/admin/plebiscites', { method: 'POST', headers: {
      'content-type': 'application/json', 'x-csrf-token': csrf, cookie: `csrf-token=${csrf}; admin-session=${session}`
    }, body: JSON.stringify(body) });
    expect((await create(createRequest({ ...payload, questions: [{ ...payload.questions[0], type: 'ranked_choice' }] }))).status).toBe(400);
    const created = await create(createRequest(payload));
    expect(created.status).toBe(200);
    const { plebiscite } = await created.json();
    const stored = db.prepare('SELECT * FROM plebiscites WHERE id=?').get(plebiscite.id);
    expect(stored.configuration_published_at).toBeTruthy();
    expect(manifestFor(stored).questions[0].sfcRule).toEqual(rule);
    const question = db.prepare('SELECT * FROM questions WHERE plebiscite_id=?').get(stored.id);
    expect(JSON.parse(question.sfc_rule)).toEqual(rule);
    const edit = (await import('@/app/api/admin/plebiscites/route')).PUT;
    const frozen = await edit(new NextRequest('http://localhost/api/admin/plebiscites', { method: 'PUT', headers: {
      'content-type': 'application/json', 'x-csrf-token': csrf, cookie: `csrf-token=${csrf}; admin-session=${session}`
    }, body: JSON.stringify({ id: stored.id, title: 'Changed' }) }));
    expect(frozen.status).toBe(409);
    // Test-only fixture finalisation, not a real election action.
    db.prepare("UPDATE plebiscites SET status='closed', privacy_mode='legacy' WHERE id=?").run(stored.id);
    db.prepare("INSERT INTO votes(question_id,vote_data,receipt_code) VALUES (?, ?, 'sfc-route-receipt')").run(question.id, JSON.stringify({ preferences: ['A', 'SFC', 'B'] }));
    const { getPlebisciteResults, buildResultsCsv } = await import('@/lib/results');
    const data = getPlebisciteResults(stored.slug);
    expect(data.questions[0].results).toMatchObject({ winner: 'A', sfcRule: rule });
    const { createResultCountRun } = await import('@/lib/result-count-runs');
    const ownerId = db.prepare("SELECT id FROM admin_users WHERE authority_role='owner'").get().id;
    expect(createResultCountRun({ questionId: question.id, method: 'condorcet', adminUserId: ownerId }).result).toMatchObject({ winner: 'A', sfcRule: rule });
    expect(() => createResultCountRun({ questionId: question.id, method: 'irv', adminUserId: ownerId })).toThrow('Condorcet recounts only');
    expect(buildResultsCsv(stored.slug, data)).toContain('SFC qualification rule');
    const { buildResultsPdf } = await import('@/lib/results-report');
    const pdf = await buildResultsPdf(data);
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
  });

  it('denies an unassigned observer even with a valid session', async () => {
    const observer = db.prepare(`INSERT INTO admin_users(email,password_hash,role,authority_role,active)
      VALUES ('observer@extensions.invalid','hash','observer','observer',1)`).run().lastInsertRowid;
    db.prepare(`INSERT INTO sessions(id,email,plebiscite_id,is_admin,admin_user_id,admin_role,expires_at)
      VALUES ('extension-observer','observer@extensions.invalid',-1,1,?,'observer','2099-01-01T00:00:00Z')`).run(observer);
    expect((await post(request(election(), {}, 'extension-observer'))).status).toBe(403);
  });

  it('resumes expired but unfinalised voting and records immutable history atomically', async () => {
    const id = election();
    expect(votingClosedError(db.prepare('SELECT * FROM plebiscites WHERE id=?').get(id))).toBeTruthy();
    expect((await post(request(id))).status).toBe(200);
    const updated = db.prepare('SELECT * FROM plebiscites WHERE id=?').get(id);
    expect(updated).toMatchObject({ close_date: '2099-01-01T17:00', manifest_close_date: '2020-01-02T17:00' });
    expect(votingClosedError(updated)).toBeNull();
    expect(db.prepare('SELECT * FROM election_deadline_extensions WHERE plebiscite_id=?').get(id)).toMatchObject({ administrator_name: 'Owner', reason: 'Allow additional time' });
    expect(() => db.prepare('UPDATE election_deadline_extensions SET reason=? WHERE plebiscite_id=?').run('rewrite', id)).toThrow('immutable');
    expect(() => db.prepare('DELETE FROM election_deadline_extensions WHERE plebiscite_id=?').run(id)).toThrow('immutable');
    expect((await post(request(id))).status).toBe(409);
    expect((await post(request(id, { previousDeadline: updated.close_date, newDeadline: '2098-01-01T17:00' }))).status).toBe(409);
    expect((await post(request(id, { previousDeadline: updated.close_date, newDeadline: '2099-02-01T17:00' }))).status).toBe(200);
    expect(db.prepare('SELECT manifest_close_date FROM plebiscites WHERE id=?').get(id).manifest_close_date).toBe('2020-01-02T17:00');
  });

  it('rejects missing auth, CSRF, invalid dates/reasons, draft/closed and closing states without history', async () => {
    const id = election();
    expect((await post(request(id, {}, 'missing'))).status).toBe(401);
    expect((await post(request(id, {}, session, 'bad'))).status).toBe(403);
    expect((await post(request(id, { reason: ' ' }))).status).toBe(400);
    expect((await post(request(id, { newDeadline: '2099-02-30T17:00' }))).status).toBe(400);
    expect((await post(request(election('legacy', 'draft')))).status).toBe(409);
    expect((await post(request(election('legacy', 'closed')))).status).toBe(409);
    db.prepare("UPDATE plebiscites SET close_state='closing' WHERE id=?").run(id);
    expect((await post(request(id))).status).toBe(409);
    db.prepare("UPDATE plebiscites SET close_state='failed' WHERE id=?").run(id);
    expect((await post(request(id))).status).toBe(409);
    expect(db.prepare('SELECT COUNT(*) AS n FROM election_deadline_extensions WHERE plebiscite_id=?').get(id).n).toBe(0);
  });

  it('keeps encrypted manifests, old/new ciphertext and the recovery kit compatible across an extension', async () => {
    const id = election('encrypted');
    db.prepare(`INSERT INTO questions(plebiscite_id,title,type,options,display_order,public_id) VALUES (?, 'Approve','yes_no','["Yes","No"]',0,'approve')`).run(id);
    const before = manifestFor(db.prepare('SELECT * FROM plebiscites WHERE id=?').get(id));
    const manifestHash = await hashManifest(before);
    const keys = await createElectionKeys(manifestHash, id);
    const first = await encryptBallot(before, manifestHash, keys.publicKeyJwk, { approve: 'Yes' });
    expect((await post(request(id))).status).toBe(200);
    const after = manifestFor(db.prepare('SELECT * FROM plebiscites WHERE id=?').get(id));
    expect(after).toEqual(before);
    expect(await hashManifest(after)).toBe(manifestHash);
    const second = await encryptBallot(after, manifestHash, keys.publicKeyJwk, { approve: 'No' });
    const decrypted = await decryptAndShuffleBallots({ manifest: after, manifestHash,
      encryptedPrivateKey: keys.encryptedPrivateKey, keyIv: keys.keyIv, closeSecret: keys.closeSecret,
      packages: [first.encryptedPackage, second.encryptedPackage] });
    expect(decrypted.map(row => row.answers.approve).sort()).toEqual(['No', 'Yes']);
  }, 20000);
});
