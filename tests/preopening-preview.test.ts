import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'votekit-preview-'));
process.env.DATABASE_PATH = path.join(tmpDir, 'test.db');
const CSRF = 'preview-csrf';
const CODE = '2345-6789-ABCD-EFGH-JKLM-NPQR-STUV';
const LINK = 'private-voter-link-token';

let db: any;
let post: any;
let codeElectionId: number;

function request(slug: string, body: Record<string, unknown>) {
  return new NextRequest(`http://localhost/api/elections/${slug}/preview`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-csrf-token': CSRF, cookie: `csrf-token=${CSRF}` },
    body: JSON.stringify(body)
  });
}

beforeAll(async () => {
  db = (await import('@/lib/db')).default;
  const { hashAccessToken, normalizeAccessCode, hashLinkToken } = await import('@/lib/voter-access');
  post = (await import('@/app/api/elections/[slug]/preview/route')).POST;
  codeElectionId = Number(db.prepare(`INSERT INTO plebiscites
    (slug, title, description, open_date, close_date, status, access_mode, opening_mode)
    VALUES ('scheduled-code', 'Scheduled code election', 'Private', '2027-02-01T09:00', '2027-02-08T09:00', 'draft', 'anonymous_codes', 'scheduled')`
  ).run().lastInsertRowid);
  db.prepare(`INSERT INTO anonymous_access_codes (plebiscite_id, token_hash, batch_id)
    VALUES (?, ?, 'preview')`).run(codeElectionId, hashAccessToken(normalizeAccessCode(CODE)));

  const voterElectionId = Number(db.prepare(`INSERT INTO plebiscites
    (slug, title, description, open_date, close_date, status, access_mode, opening_mode)
    VALUES ('scheduled-voter', 'Scheduled voter election', 'Private', '2027-03-01T09:00', '2027-03-08T09:00', 'draft', 'voter_roll', 'scheduled')`
  ).run().lastInsertRowid);
  const voterId = Number(db.prepare('INSERT INTO voter_roll (plebiscite_id, email) VALUES (?, ?)').run(voterElectionId, 'voter@preview.invalid').lastInsertRowid);
  db.prepare(`INSERT INTO voter_link_tokens (plebiscite_id, voter_roll_id, token_hash)
    VALUES (?, ?, ?)`).run(voterElectionId, voterId, hashLinkToken(LINK));
});

afterAll(() => {
  try { db.close(); } catch {}
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('credential-gated pre-opening preview', () => {
  it('shows only limited scheduled details for a valid anonymous code without consuming it', async () => {
    const response = await post(request('scheduled-code', { kind: 'anonymous_code', credential: CODE }), { params: Promise.resolve({ slug: 'scheduled-code' }) });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ election: {
      slug: 'scheduled-code', title: 'Scheduled code election', openingMode: 'scheduled', opensAt: '2027-02-01T09:00'
    } });
    expect(db.prepare('SELECT used FROM anonymous_access_codes WHERE plebiscite_id = ?').get(codeElectionId).used).toBe(0);
  });

  it('accepts a valid private voter link and rejects invalid credentials generically', async () => {
    const valid = await post(request('scheduled-voter', { kind: 'voter_link', credential: LINK }), { params: Promise.resolve({ slug: 'scheduled-voter' }) });
    const invalid = await post(request('scheduled-voter', { kind: 'voter_link', credential: 'wrong' }), { params: Promise.resolve({ slug: 'scheduled-voter' }) });
    expect(valid.status).toBe(200);
    expect(invalid.status).toBe(404);
    await expect(invalid.json()).resolves.toEqual({ error: 'Election not found' });
  });
});
