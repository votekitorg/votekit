import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'votekit-anonymous-codes-'));
process.env.DATABASE_PATH = path.join(tmpDir, 'test.db');
process.env.VOTEKIT_PUBLIC_URL = 'https://votekit.example';
const CSRF = 'anonymous-code-csrf';
let db: any;
let adminSessionId: string;
let electionId: number;
let slug: string;
let code: string;

function request(url: string, method: string, body?: unknown, cookie = '') {
  return new NextRequest(url, {
    method,
    headers: { 'content-type': 'application/json', 'x-csrf-token': CSRF, cookie: `csrf-token=${CSRF}; ${cookie}` },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

beforeAll(async () => {
  db = (await import('@/lib/db')).default;
  const ownerId = Number(db.prepare(`INSERT INTO admin_users (email, password_hash, role, authority_role, active)
    VALUES ('owner@example.com', 'hash', 'admin', 'owner', 1)`).run().lastInsertRowid);
  adminSessionId = 'anonymous-code-admin';
  db.prepare(`INSERT INTO sessions (id, email, plebiscite_id, is_admin, admin_user_id, admin_role, expires_at)
    VALUES (?, 'owner@example.com', -1, 1, ?, 'admin', ?)`).run(adminSessionId, ownerId, new Date(Date.now() + 3_600_000).toISOString());
  slug = 'anonymous-code-election';
  electionId = Number(db.prepare(`INSERT INTO plebiscites
    (slug, title, description, open_date, close_date, status, privacy_mode, access_mode)
    VALUES (?, 'Anonymous code election', 'Test', ?, ?, 'draft', 'legacy', 'anonymous_codes')`)
    .run(slug, new Date().toISOString(), new Date(Date.now() + 86_400_000).toISOString()).lastInsertRowid);
  db.prepare(`INSERT INTO questions (plebiscite_id, title, type, options, display_order, preferential_type, public_id)
    VALUES (?, 'Approve?', 'yes_no', '["Yes","No"]', 0, 'compulsory', 'anonymous-question')`).run(electionId);
});

afterAll(() => {
  try { db.close(); } catch {}
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('anonymous access-code elections', () => {
  it('generates plaintext once while storing hashes only and permits opening without a voter roll', async () => {
    const codesRoute = await import('@/app/api/admin/access-codes/route');
    const response = await codesRoute.POST(request('http://localhost/api/admin/access-codes', 'POST', {
      plebiscite_id: electionId, count: 500
    }, `admin-session=${adminSessionId}`));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.codes).toHaveLength(500);
    code = body.codes[0].code;
    expect(body.codes[0].link).toContain(`#code=${encodeURIComponent(code)}`);
    const stored = db.prepare('SELECT token_hash FROM anonymous_access_codes WHERE plebiscite_id = ?').all(electionId);
    expect(stored).toHaveLength(500);
    expect(stored.some((row: any) => row.token_hash.includes(code.replaceAll('-', '')))).toBe(false);
    expect(db.prepare('SELECT COUNT(*) AS count FROM voter_roll WHERE plebiscite_id = ?').get(electionId).count).toBe(0);

    const electionRoute = await import('@/app/api/admin/plebiscites/route');
    const opened = await electionRoute.PUT(request('http://localhost/api/admin/plebiscites', 'PUT', {
      id: electionId, action: 'open'
    }, `admin-session=${adminSessionId}`));
    expect(opened.status).toBe(200);
  });

  it('consumes one code atomically with one anonymous ballot', async () => {
    const authRoute = await import('@/app/api/auth/access-code/route');
    const authenticated = await authRoute.POST(request('http://localhost/api/auth/access-code', 'POST', { code, plebisciteSlug: slug }));
    expect(authenticated.status).toBe(200);
    const cookie = authenticated.headers.get('set-cookie') || '';
    const sessionCookie = cookie.match(/voter-session-[^=]+=[^;]+/)?.[0] || '';
    expect(sessionCookie).toBeTruthy();

    const voteRoute = await import('@/app/api/vote/route');
    const questionId = db.prepare('SELECT id FROM questions WHERE plebiscite_id = ?').get(electionId).id;
    const voted = await voteRoute.POST(request('http://localhost/api/vote', 'POST', {
      plebisciteSlug: slug, votes: { [questionId]: 'Yes' }
    }, sessionCookie));
    expect(voted.status).toBe(200);
    expect(db.prepare('SELECT COUNT(*) AS count FROM participation WHERE anonymous_code_id IS NOT NULL').get().count).toBe(1);
    expect(db.prepare('SELECT COUNT(*) AS count FROM votes').get().count).toBe(1);

    const reused = await authRoute.POST(request('http://localhost/api/auth/access-code', 'POST', { code, plebisciteSlug: slug }));
    expect(reused.status).toBe(400);
  });
});
