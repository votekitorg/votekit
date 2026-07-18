import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'votekit-admin-security-'));
process.env.DATABASE_PATH = path.join(tmpDir, 'test.db');
process.env.ADMIN_EMAIL = 'admin@example.com';
process.env.ADMIN_PASSWORD = 'correct horse battery staple';
delete process.env.TRUST_PROXY_HEADERS;

const CSRF = 'admin-security-csrf';

let db: any;
let authPost: (request: NextRequest) => Promise<Response>;
let getAdminRequestIp: (request: NextRequest) => string;

function loginRequest(email: string, password: string, forwardedFor?: string): NextRequest {
  const headers: Record<string, string> = {
    'content-type': 'application/x-www-form-urlencoded',
    'x-csrf-token': CSRF,
    cookie: `csrf-token=${CSRF}`
  };
  if (forwardedFor) headers['x-forwarded-for'] = forwardedFor;

  return new NextRequest('http://localhost/api/admin/auth', {
    method: 'POST',
    headers,
    body: new URLSearchParams({ action: 'login', email, password }).toString()
  });
}

function logoutRequest(sessionId: string): NextRequest {
  return new NextRequest('http://localhost/api/admin/auth', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'x-csrf-token': CSRF,
      cookie: `csrf-token=${CSRF}; admin-session=${sessionId}`
    },
    body: new URLSearchParams({ action: 'logout' }).toString()
  });
}

beforeAll(async () => {
  db = (await import('@/lib/db')).default;
  authPost = (await import('@/app/api/admin/auth/route')).POST;
  getAdminRequestIp = (await import('@/lib/auth')).getAdminRequestIp;
});

afterAll(() => {
  try { db.close(); } catch {}
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('admin login hardening and audit logging', () => {
  it('ignores spoofed forwarded IP headers unless trusted proxy mode is enabled', () => {
    const request = loginRequest('admin@example.com', 'bad password', '203.0.113.10, 198.51.100.5');
    expect(getAdminRequestIp(request)).toBe('direct');

    process.env.TRUST_PROXY_HEADERS = 'true';
    try {
      // nginx appends the socket peer; client-supplied values to its left are ignored.
      expect(getAdminRequestIp(request)).toBe('198.51.100.5');
    } finally {
      delete process.env.TRUST_PROXY_HEADERS;
    }
  });

  it('writes an audit row on successful admin login', async () => {
    const response = await authPost(loginRequest('admin@example.com', 'correct horse battery staple'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.user.role).toBe('owner');
    expect(db.prepare('SELECT role, authority_role FROM admin_users WHERE email = ?').get('admin@example.com'))
      .toMatchObject({ role: 'admin', authority_role: 'owner' });

    const audit = db.prepare(`
      SELECT action, target_type, target_id, details
      FROM admin_audit_log
      WHERE action = 'admin.login.success'
      ORDER BY id DESC LIMIT 1
    `).get();

    expect(audit.action).toBe('admin.login.success');
    expect(audit.target_type).toBe('admin_user');
    expect(JSON.parse(audit.details)).toMatchObject({ email: 'admin@example.com', ipAddress: 'direct' });
  });

  it('logs out without a fetch redirect and invalidates the server session', async () => {
    const loginResponse = await authPost(loginRequest('admin@example.com', 'correct horse battery staple'));
    const sessionCookie = loginResponse.headers.get('set-cookie');
    const sessionId = sessionCookie?.match(/admin-session=([^;]+)/)?.[1];
    expect(sessionId).toBeTruthy();

    const response = await authPost(logoutRequest(sessionId as string));

    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
    expect(await response.json()).toEqual({ success: true });
    expect(response.headers.get('set-cookie')).toContain('admin-session=;');
    expect(db.prepare('SELECT id FROM sessions WHERE id = ?').get(sessionId)).toBeUndefined();
    expect(db.prepare(`SELECT action FROM admin_audit_log WHERE action = 'admin.logout' ORDER BY id DESC LIMIT 1`).get())
      .toMatchObject({ action: 'admin.logout' });
  });

  it('locks out by email across spoofed forwarded IP changes and audits failures', async () => {
    const email = 'locked@example.com';

    for (let i = 0; i < 5; i++) {
      const response = await authPost(loginRequest(email, 'wrong password', `203.0.113.${i}`));
      expect(response.status).toBe(401);
    }

    const blocked = await authPost(loginRequest(email, 'wrong password', '203.0.113.200'));
    expect(blocked.status).toBe(429);

    const attempts = db.prepare(`
      SELECT email, ip_address, success, locked_until
      FROM admin_login_attempts
      WHERE email = ?
      ORDER BY id
    `).all(email);

    expect(attempts).toHaveLength(5);
    expect(new Set(attempts.map((attempt: any) => attempt.ip_address))).toEqual(new Set(['direct']));
    expect(attempts.at(-1).locked_until).toBeTruthy();

    const failureAudits = db.prepare(`
      SELECT COUNT(*) as count
      FROM admin_audit_log
      WHERE action = 'admin.login.failure' AND target_id = ?
    `).get(email);
    expect(failureAudits.count).toBe(5);
  });
});
