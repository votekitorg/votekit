import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'votekit-results-access-'));
process.env.DATABASE_PATH = path.join(tmpDir, 'test.db');

const SLUG = 'private-code-election';
const CODE = 'ABCD-EFGH-JKLM-NPQR-STUV-WXYZ-2345';
const CSRF = 'results-access-csrf';
let db: any;
let electionId: number;
let emailElectionId: number;
let resultsGet: any;
let accessPost: any;

function request(url: string, cookie = '') {
  return new NextRequest(url, { headers: cookie ? { cookie } : undefined });
}

beforeAll(async () => {
  db = (await import('@/lib/db')).default;
  const { hashAccessToken, normalizeAccessCode } = await import('@/lib/voter-access');
  resultsGet = (await import('@/app/api/results/[slug]/route')).GET;
  accessPost = (await import('@/app/api/results/[slug]/access/route')).POST;
  electionId = Number(db.prepare(`INSERT INTO plebiscites
    (slug, title, description, open_date, close_date, status, access_mode)
    VALUES (?, 'Private results', 'Access test', '2026-01-01T09:00', '2026-01-02T17:00', 'closed', 'anonymous_codes')`
  ).run(SLUG).lastInsertRowid);
  db.prepare(`INSERT INTO questions (plebiscite_id, title, type, options, display_order, public_id)
    VALUES (?, 'Approve?', 'yes_no', ?, 0, 'private-question')`).run(electionId, JSON.stringify(['Yes', 'No']));
  db.prepare(`INSERT INTO anonymous_access_codes (plebiscite_id, token_hash, batch_id, used)
    VALUES (?, ?, 'batch', 1)`).run(electionId, hashAccessToken(normalizeAccessCode(CODE)));

  emailElectionId = Number(db.prepare(`INSERT INTO plebiscites
    (slug, title, description, open_date, close_date, status, access_mode)
    VALUES ('private-email-election', 'Email results', 'Access test', '2026-01-01T09:00', '2026-01-02T17:00', 'closed', 'voter_roll')`
  ).run().lastInsertRowid);
  db.prepare(`INSERT INTO questions (plebiscite_id, title, type, options, display_order, public_id)
    VALUES (?, 'Approve?', 'yes_no', ?, 0, 'email-question')`).run(emailElectionId, JSON.stringify(['Yes', 'No']));
  db.prepare('INSERT INTO voter_roll (plebiscite_id, email) VALUES (?, ?)').run(emailElectionId, 'elector@example.com');
});

afterAll(() => {
  try { db.close(); } catch {}
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('private results authorization', () => {
  it('blocks a closed election when the visitor only has its URL', async () => {
    const response = await resultsGet(request(`http://localhost/api/results/${SLUG}`), { params: Promise.resolve({ slug: SLUG }) });
    const pdf = await resultsGet(request(`http://localhost/api/results/${SLUG}?format=pdf`), { params: Promise.resolve({ slug: SLUG }) });
    const csv = await resultsGet(request(`http://localhost/api/results/${SLUG}?format=csv`), { params: Promise.resolve({ slug: SLUG }) });
    expect(response.status).toBe(403);
    expect(pdf.status).toBe(403);
    expect(csv.status).toBe(403);
  });

  it('accepts the original anonymous voting code after that code has been used', async () => {
    const accessRequest = new NextRequest(`http://localhost/api/results/${SLUG}/access`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-csrf-token': CSRF, cookie: `csrf-token=${CSRF}` },
      body: JSON.stringify({ action: 'access_code', code: CODE })
    });
    const authorized = await accessPost(accessRequest, { params: Promise.resolve({ slug: SLUG }) });
    expect(authorized.status).toBe(200);
    const sessionCookie = authorized.headers.get('set-cookie');
    expect(sessionCookie).toContain(`voter-session-${SLUG}=`);

    const response = await resultsGet(request(`http://localhost/api/results/${SLUG}`, sessionCookie || ''), { params: Promise.resolve({ slug: SLUG }) });
    expect(response.status).toBe(200);
  });

  it('accepts a fresh email verification code for a registered elector after close', async () => {
    db.prepare(`INSERT INTO verification_codes (email, plebiscite_id, code, expires_at)
      VALUES ('elector@example.com', ?, '123456', ?)`).run(emailElectionId, new Date(Date.now() + 10 * 60 * 1000).toISOString());
    const accessRequest = new NextRequest('http://localhost/api/results/private-email-election/access', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-csrf-token': CSRF, cookie: `csrf-token=${CSRF}` },
      body: JSON.stringify({ action: 'confirm_email', email: 'elector@example.com', code: '123456' })
    });
    const authorized = await accessPost(accessRequest, { params: Promise.resolve({ slug: 'private-email-election' }) });
    expect(authorized.status).toBe(200);
    const response = await resultsGet(request('http://localhost/api/results/private-email-election', authorized.headers.get('set-cookie') || ''), {
      params: Promise.resolve({ slug: 'private-email-election' })
    });
    expect(response.status).toBe(200);
  });

  it('allows the VoteKit Owner but not an unrelated VoteKit account', async () => {
    const ownerId = Number(db.prepare(`INSERT INTO admin_users
      (email, name, password_hash, role, authority_role, active) VALUES ('owner@test.invalid', 'Owner', 'hash', 'admin', 'owner', 1)`).run().lastInsertRowid);
    const otherId = Number(db.prepare(`INSERT INTO admin_users
      (email, name, password_hash, role, authority_role, active) VALUES ('other@test.invalid', 'Other', 'hash', 'observer', 'observer', 1)`).run().lastInsertRowid);
    const expiry = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    db.prepare(`INSERT INTO sessions (id, email, plebiscite_id, is_admin, admin_user_id, admin_role, expires_at)
      VALUES ('owner-results-session', 'owner@test.invalid', -1, 1, ?, 'admin', ?)`).run(ownerId, expiry);
    db.prepare(`INSERT INTO sessions (id, email, plebiscite_id, is_admin, admin_user_id, admin_role, expires_at)
      VALUES ('other-results-session', 'other@test.invalid', -1, 1, ?, 'observer', ?)`).run(otherId, expiry);

    const owner = await resultsGet(request(`http://localhost/api/results/${SLUG}`, 'admin-session=owner-results-session'), { params: Promise.resolve({ slug: SLUG }) });
    const unrelated = await resultsGet(request(`http://localhost/api/results/${SLUG}`, 'admin-session=other-results-session'), { params: Promise.resolve({ slug: SLUG }) });
    expect(owner.status).toBe(200);
    expect(unrelated.status).toBe(403);
  });

  it('keeps archived results Owner-only even if someone retains the URL', async () => {
    db.prepare('UPDATE plebiscites SET archived_at = CURRENT_TIMESTAMP WHERE id = ?').run(electionId);
    const visitor = await resultsGet(request(`http://localhost/api/results/${SLUG}`), { params: Promise.resolve({ slug: SLUG }) });
    const owner = await resultsGet(request(`http://localhost/api/results/${SLUG}`, 'admin-session=owner-results-session'), { params: Promise.resolve({ slug: SLUG }) });
    expect(visitor.status).toBe(403);
    expect(owner.status).toBe(200);
    db.prepare('UPDATE plebiscites SET archived_at = NULL WHERE id = ?').run(electionId);
  });

  it('allows unauthenticated access only after the Owner setting is public', async () => {
    db.prepare("UPDATE plebiscites SET results_visibility = 'public' WHERE id = ?").run(electionId);
    const response = await resultsGet(request(`http://localhost/api/results/${SLUG}`), { params: Promise.resolve({ slug: SLUG }) });
    expect(response.status).toBe(200);
  });
});
