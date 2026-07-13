import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'votekit-production-guardrails-'));
process.env.DATABASE_PATH = path.join(tmpDir, 'test.db');

const CSRF = 'production-guardrails-csrf';
let db: any;
let adminSessionId: string;
let plebiscitesPost: (request: NextRequest) => Promise<Response>;
let plebiscitesPut: (request: NextRequest) => Promise<Response>;
let plebiscitesDelete: (request: NextRequest) => Promise<Response>;
let votersPost: (request: NextRequest) => Promise<Response>;
let csrfGet: () => Promise<Response>;

function brisbaneInput(date: Date): string {
  return new Date(date.getTime() + 10 * 60 * 60 * 1000).toISOString().slice(0, 16);
}

function adminRequest(url: string, method: string, body?: unknown): NextRequest {
  return new NextRequest(url, {
    method,
    headers: {
      'content-type': 'application/json',
      'x-csrf-token': CSRF,
      cookie: `csrf-token=${CSRF}; admin-session=${adminSessionId}`
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

function validElection(overrides: Record<string, unknown> = {}) {
  return {
    title: 'Production Guardrail Election',
    description: 'Exercises lifecycle protections.',
    open_date: brisbaneInput(new Date(Date.now() + 60 * 60 * 1000)),
    close_date: brisbaneInput(new Date(Date.now() + 25 * 60 * 60 * 1000)),
    questions: [{ title: 'Approve?', type: 'yes_no', options: ['Yes', 'No'] }],
    ...overrides
  };
}

beforeAll(async () => {
  db = (await import('@/lib/db')).default;
  const routes = await import('@/app/api/admin/plebiscites/route');
  plebiscitesPost = routes.POST;
  plebiscitesPut = routes.PUT;
  plebiscitesDelete = routes.DELETE;
  votersPost = (await import('@/app/api/admin/voters/route')).POST;
  csrfGet = (await import('@/app/api/csrf/route')).GET;

  const adminId = Number(db.prepare(`
    INSERT INTO admin_users (email, name, password_hash, role, active)
    VALUES ('admin@example.com', 'Admin', 'test-hash', 'admin', 1)
  `).run().lastInsertRowid);
  adminSessionId = 'production-guardrails-admin';
  db.prepare(`
    INSERT INTO sessions (id, email, plebiscite_id, is_admin, admin_user_id, admin_role, expires_at)
    VALUES (?, 'admin@example.com', -1, 1, ?, 'admin', ?)
  `).run(adminSessionId, adminId, new Date(Date.now() + 60 * 60 * 1000).toISOString());
});

afterAll(() => {
  try { db.close(); } catch {}
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('production lifecycle guardrails', () => {
  it('rejects malformed election definitions without leaving partial rows', async () => {
    const before = db.prepare('SELECT COUNT(*) AS count FROM plebiscites').get().count;
    const response = await plebiscitesPost(adminRequest(
      'http://localhost/api/admin/plebiscites',
      'POST',
      validElection({ questions: [{ title: 'Choose', type: 'multiple_choice', options: ['A', 'A'] }] })
    ));

    expect(response.status).toBe(400);
    expect(db.prepare('SELECT COUNT(*) AS count FROM plebiscites').get().count).toBe(before);
  });

  it('requires a voter roll before opening and locks the roll after opening', async () => {
    const createResponse = await plebiscitesPost(adminRequest(
      'http://localhost/api/admin/plebiscites',
      'POST',
      validElection()
    ));
    expect(createResponse.status).toBe(200);
    const created = await createResponse.json();
    const electionId = created.plebiscite.id;

    const openWithoutVoters = await plebiscitesPut(adminRequest(
      'http://localhost/api/admin/plebiscites',
      'PUT',
      { id: electionId, action: 'open' }
    ));
    expect(openWithoutVoters.status).toBe(400);

    const addVoter = await votersPost(adminRequest(
      'http://localhost/api/admin/voters',
      'POST',
      { action: 'add', plebiscite_id: electionId, email: 'voter@example.com' }
    ));
    expect(addVoter.status).toBe(200);

    const openResponse = await plebiscitesPut(adminRequest(
      'http://localhost/api/admin/plebiscites',
      'PUT',
      { id: electionId, action: 'open' }
    ));
    expect(openResponse.status).toBe(200);

    const lateAdd = await votersPost(adminRequest(
      'http://localhost/api/admin/voters',
      'POST',
      { action: 'add', plebiscite_id: electionId, email: 'late@example.com' }
    ));
    expect(lateAdd.status).toBe(409);

    const deleteOpen = await plebiscitesDelete(adminRequest(
      `http://localhost/api/admin/plebiscites?id=${electionId}`,
      'DELETE'
    ));
    expect(deleteOpen.status).toBe(400);
  });

  it('serves unique non-cacheable CSRF tokens in hardened cookies', async () => {
    const first = await csrfGet();
    const second = await csrfGet();
    const firstBody = await first.json();
    const secondBody = await second.json();

    expect(firstBody.token).not.toBe(secondBody.token);
    expect(first.headers.get('cache-control')).toContain('no-store');
    const cookie = first.headers.get('set-cookie') || '';
    expect(cookie).toContain('HttpOnly');
    expect(cookie.toLowerCase()).toContain('samesite=strict');
  });
});
