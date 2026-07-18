import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { generateLinkToken, hashLinkToken, normalizePhoneNumber } from '@/lib/voter-access';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'votekit-voter-access-'));
process.env.DATABASE_PATH = path.join(tmpDir, 'test.db');
const CSRF = 'voter-access-csrf';
const PHONE = '+61412345678';
let db: any;
let electionId: number;
let slug: string;
let questionId: number;
let linkToken: string;

vi.mock('@/lib/firebase-token', () => ({ verifyFirebasePhoneToken: vi.fn(async () => PHONE) }));

function request(url: string, method: string, body?: unknown, cookie = '') {
  return new NextRequest(url, {
    method,
    headers: { 'content-type': 'application/json', 'x-csrf-token': CSRF, cookie: `csrf-token=${CSRF}; ${cookie}` },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

beforeAll(async () => {
  db = (await import('@/lib/db')).default;
  slug = 'registered-access-election';
  electionId = Number(db.prepare(`INSERT INTO plebiscites
    (slug, title, description, open_date, close_date, status, privacy_mode, access_mode, sms_enabled)
    VALUES (?, 'Registered access', 'Test', ?, ?, 'open', 'legacy', 'voter_roll', 1)`)
    .run(slug, new Date().toISOString(), new Date(Date.now() + 86_400_000).toISOString()).lastInsertRowid);
  questionId = Number(db.prepare(`INSERT INTO questions
    (plebiscite_id, title, type, options, display_order, preferential_type, public_id)
    VALUES (?, 'Approve?', 'yes_no', '["Yes","No"]', 0, 'compulsory', 'registered-question')`).run(electionId).lastInsertRowid);
  const emailVoterId = Number(db.prepare(`INSERT INTO voter_roll (plebiscite_id, email) VALUES (?, 'link@example.com')`).run(electionId).lastInsertRowid);
  db.prepare(`INSERT INTO voter_roll (plebiscite_id, phone) VALUES (?, ?)`).run(electionId, PHONE);
  linkToken = generateLinkToken();
  db.prepare(`INSERT INTO voter_link_tokens (plebiscite_id, voter_roll_id, token_hash) VALUES (?, ?, ?)`)
    .run(electionId, emailVoterId, hashLinkToken(linkToken));
});

afterAll(() => {
  try { db.close(); } catch {}
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('registered voter access methods', () => {
  it('normalizes Australian phone numbers for voter-roll matching', () => {
    expect(normalizePhoneNumber('0412 345 678')).toBe(PHONE);
    expect(normalizePhoneNumber('61 412 345 678')).toBe(PHONE);
  });

  it('authenticates a private voter link only for its election and permits one ballot', async () => {
    const authRoute = await import('@/app/api/auth/voter-link/route');
    const wrongElection = await authRoute.POST(request('http://localhost/api/auth/voter-link', 'POST', { token: linkToken, plebisciteSlug: 'wrong-election' }));
    expect(wrongElection.status).toBe(404);

    const authenticated = await authRoute.POST(request('http://localhost/api/auth/voter-link', 'POST', { token: linkToken, plebisciteSlug: slug }));
    expect(authenticated.status).toBe(200);
    const sessionCookie = (authenticated.headers.get('set-cookie') || '').match(/voter-session-[^=]+=[^;]+/)?.[0] || '';
    expect(sessionCookie).toBeTruthy();

    const voteRoute = await import('@/app/api/vote/route');
    const voted = await voteRoute.POST(request('http://localhost/api/vote', 'POST', {
      plebisciteSlug: slug, votes: { [questionId]: 'Yes' }
    }, sessionCookie));
    expect(voted.status).toBe(200);
  });

  it('authenticates a phone-only eligible voter and permits one ballot', async () => {
    const phoneRoute = await import('@/app/api/auth/verify-phone/route');
    const authenticated = await phoneRoute.POST(request('http://localhost/api/auth/verify-phone', 'POST', {
      idToken: 'verified-firebase-token', plebisciteSlug: slug
    }));
    expect(authenticated.status).toBe(200);
    const sessionCookie = (authenticated.headers.get('set-cookie') || '').match(/voter-session-[^=]+=[^;]+/)?.[0] || '';
    expect(sessionCookie).toBeTruthy();

    const voteRoute = await import('@/app/api/vote/route');
    const voted = await voteRoute.POST(request('http://localhost/api/vote', 'POST', {
      plebisciteSlug: slug, votes: { [questionId]: 'No' }
    }, sessionCookie));
    expect(voted.status).toBe(200);
    expect(db.prepare('SELECT COUNT(*) AS count FROM participation WHERE plebiscite_id = ?').get(electionId).count).toBe(2);
  });
});
