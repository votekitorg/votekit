import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'votekit-voter-privacy-'));
process.env.DATABASE_PATH = path.join(tmpDir, 'test.db');
process.env.MAX_VERIFICATION_IP_ATTEMPTS = '20';

const CSRF = 'voter-privacy-csrf';

let db: any;
let verifyPost: (request: NextRequest) => Promise<Response>;
let votersGet: (request: NextRequest) => Promise<Response>;
let plebisciteId: number;
let voterId: number;

function verifyRequest(email: string, forwardedFor?: string): NextRequest {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-csrf-token': CSRF,
    cookie: `csrf-token=${CSRF}`
  };
  if (forwardedFor) headers['x-forwarded-for'] = forwardedFor;

  return new NextRequest('http://localhost/api/auth/verify', {
    method: 'POST',
    headers,
    body: JSON.stringify({ email, plebisciteSlug: 'privacy-election' })
  });
}

function voterListRequest(sessionId: string): NextRequest {
  return new NextRequest(`http://localhost/api/admin/voters?plebiscite_id=${plebisciteId}`, {
    method: 'GET',
    headers: { cookie: `admin-session=${sessionId}` }
  });
}

beforeAll(async () => {
  db = (await import('@/lib/db')).default;
  verifyPost = (await import('@/app/api/auth/verify/route')).POST;
  votersGet = (await import('@/app/api/admin/voters/route')).GET;

  plebisciteId = Number(db.prepare(`
    INSERT INTO plebiscites (slug, title, description, open_date, close_date, status)
    VALUES ('privacy-election', 'Privacy Election', 'desc', '2026-01-01T09:00', '2030-01-01T17:00', 'open')
  `).run().lastInsertRowid);

  voterId = Number(db.prepare('INSERT INTO voter_roll (email, plebiscite_id) VALUES (?, ?)')
    .run('voter@example.com', plebisciteId).lastInsertRowid);

  db.prepare('INSERT INTO participation (plebiscite_id, voter_roll_id) VALUES (?, ?)')
    .run(plebisciteId, voterId);
});

afterAll(() => {
  try { db.close(); } catch {}
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('voter privacy and retention hardening', () => {
  it('returns a neutral response for emails outside the voter roll without creating a code', async () => {
    const response = await verifyPost(verifyRequest('outsider@example.com'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.message).toMatch(/If that email is eligible/i);
    expect(db.prepare('SELECT COUNT(*) as c FROM verification_codes WHERE email = ?').get('outsider@example.com').c).toBe(0);
  });

  it('returns the same neutral response for an already-voted email without creating a code', async () => {
    const response = await verifyPost(verifyRequest('voter@example.com'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.message).toMatch(/If that email is eligible/i);
    expect(db.prepare('SELECT COUNT(*) as c FROM verification_codes WHERE email = ?').get('voter@example.com').c).toBe(0);
  });

  it('rate-limits verification requests by network bucket even when forwarded headers are spoofed', async () => {
    for (let i = 0; i < 18; i++) {
      const response = await verifyPost(verifyRequest(`probe-${i}@example.com`, `203.0.113.${i}`));
      expect(response.status).toBe(200);
    }

    const blocked = await verifyPost(verifyRequest('probe-blocked@example.com', '203.0.113.250'));
    expect(blocked.status).toBe(429);

    const ipBucket = db.prepare("SELECT attempt_count FROM email_rate_limits WHERE email = 'ip:direct'").get();
    expect(ipBucket.attempt_count).toBeGreaterThanOrEqual(20);
  });

  it('denies observer sessions access to voter-roll PII', async () => {
    const observerId = Number(db.prepare(`
      INSERT INTO admin_users (email, name, password_hash, role, active)
      VALUES ('observer@example.com', 'Observer', 'test-hash', 'observer', 1)
    `).run().lastInsertRowid);
    db.prepare(`
      INSERT INTO sessions (id, email, plebiscite_id, is_admin, admin_user_id, admin_role, expires_at)
      VALUES ('observer-session', 'observer@example.com', -1, 1, ?, 'observer', ?)
    `).run(observerId, new Date(Date.now() + 60 * 60 * 1000).toISOString());

    const response = await votersGet(voterListRequest('observer-session'));
    expect(response.status).toBe(403);
  });
});
