import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'votekit-setup-drafts-'));
process.env.DATABASE_PATH = path.join(tmpDir, 'test.db');
const CSRF = 'setup-drafts-csrf';

let db: any;
let ownerId: number;
let otherId: number;
let draftPost: any;
let draftGet: any;
let draftPut: any;
let draftPatch: any;
let electionPost: any;
let electionPut: any;

function request(url: string, method: string, session: string, body?: unknown) {
  return new NextRequest(url, {
    method,
    headers: {
      'content-type': 'application/json',
      'x-csrf-token': CSRF,
      cookie: `csrf-token=${CSRF}; admin-session=${session}`
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

function payload(title = 'Draft board election') {
  return {
    formData: {
      title,
      description: 'Choose the board representative.',
      info_url: '',
      access_mode: 'anonymous_codes',
      results_visibility: 'public',
      sms_enabled: false,
      opening_mode: 'immediate',
      open_date: '2030-01-01T09:00',
      close_date: '2030-01-02T17:00'
    },
    questions: [{
      title: 'Who should represent the board?',
      description: '',
      type: 'multiple_choice',
      options: ['Alex', 'Blair'],
      preferentialType: 'compulsory'
    }]
  };
}

beforeAll(async () => {
  db = (await import('@/lib/db')).default;
  ({ POST: draftPost, GET: draftGet, PUT: draftPut, PATCH: draftPatch } = await import('@/app/api/admin/election-drafts/route'));
  ({ POST: electionPost, PUT: electionPut } = await import('@/app/api/admin/plebiscites/route'));
  ownerId = Number(db.prepare(`INSERT INTO admin_users
    (email, name, password_hash, role, authority_role, active)
    VALUES ('draft-owner@example.invalid', 'Draft Owner', 'hash', 'admin', 'owner', 1)`).run().lastInsertRowid);
  otherId = Number(db.prepare(`INSERT INTO admin_users
    (email, name, password_hash, role, authority_role, active)
    VALUES ('draft-other@example.invalid', 'Other Returning Officer', 'hash', 'admin', 'returning_officer', 1)`).run().lastInsertRowid);
  const expires = new Date(Date.now() + 3_600_000).toISOString();
  db.prepare(`INSERT INTO sessions (id, email, plebiscite_id, is_admin, admin_user_id, admin_role, expires_at)
    VALUES ('draft-owner-session', 'draft-owner@example.invalid', -1, 1, ?, 'admin', ?)`).run(ownerId, expires);
  db.prepare(`INSERT INTO sessions (id, email, plebiscite_id, is_admin, admin_user_id, admin_role, expires_at)
    VALUES ('draft-other-session', 'draft-other@example.invalid', -1, 1, ?, 'admin', ?)`).run(otherId, expires);
});

afterAll(() => {
  try { db.close(); } catch {}
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('autosaved election setup drafts', () => {
  it('creates, resumes, updates and isolates a private setup draft', async () => {
    const created = await draftPost(request('http://localhost/api/admin/election-drafts', 'POST', 'draft-owner-session', {
      payload: payload(),
      currentStep: 2
    }));
    expect(created.status).toBe(200);
    const createdBody = await created.json();
    expect(createdBody.draft.proofToken).toMatch(/^[A-Za-z0-9_-]{32}$/);

    const resumed = await draftGet(request(
      `http://localhost/api/admin/election-drafts?id=${createdBody.draft.id}`,
      'GET',
      'draft-owner-session'
    ));
    await expect(resumed.json()).resolves.toMatchObject({
      draft: { id: createdBody.draft.id, title: 'Draft board election', currentStep: 2 }
    });

    const hidden = await draftGet(request(
      `http://localhost/api/admin/election-drafts?id=${createdBody.draft.id}`,
      'GET',
      'draft-other-session'
    ));
    expect(hidden.status).toBe(404);

    const updated = await draftPut(request('http://localhost/api/admin/election-drafts', 'PUT', 'draft-owner-session', {
      id: createdBody.draft.id,
      payload: payload('Updated draft title'),
      currentStep: 4,
      revision: createdBody.draft.revision
    }));
    expect(updated.status).toBe(200);
    await expect(updated.json()).resolves.toMatchObject({ revision: 2 });
    expect(db.prepare('SELECT title, current_step, revision FROM election_setup_drafts WHERE id = ?').get(createdBody.draft.id))
      .toEqual({ title: 'Updated draft title', current_step: 4, revision: 2 });

    const stale = await draftPut(request('http://localhost/api/admin/election-drafts', 'PUT', 'draft-owner-session', {
      id: createdBody.draft.id,
      payload: payload('Stale title must not win'),
      currentStep: 1,
      revision: createdBody.draft.revision
    }));
    expect(stale.status).toBe(409);
    await expect(stale.json()).resolves.toMatchObject({ currentRevision: 2 });
    expect(db.prepare('SELECT title, current_step, revision FROM election_setup_drafts WHERE id = ?').get(createdBody.draft.id))
      .toEqual({ title: 'Updated draft title', current_step: 4, revision: 2 });
  });

  it('publishes valid setup atomically and keeps an invalid draft', async () => {
    const valid = await draftPost(request('http://localhost/api/admin/election-drafts', 'POST', 'draft-owner-session', {
      payload: payload('Published from draft'),
      currentStep: 4
    }));
    const validDraft = (await valid.json()).draft;
    const published = await electionPost(request('http://localhost/api/admin/plebiscites', 'POST', 'draft-owner-session', {
      ...payload('Published from draft').formData,
      questions: payload().questions,
      setup_draft_id: validDraft.id
    }));
    expect(published.status).toBe(200);
    expect(db.prepare('SELECT id FROM election_setup_drafts WHERE id = ?').get(validDraft.id)).toBeUndefined();
    expect(db.prepare('SELECT status, results_visibility FROM plebiscites WHERE title = ?').get('Published from draft'))
      .toEqual({ status: 'draft', results_visibility: 'public' });
    const publishedBody = await published.json();
    const locked = await electionPut(request('http://localhost/api/admin/plebiscites', 'PUT', 'draft-owner-session', {
      id: publishedBody.plebiscite.id,
      title: 'Changed after publication'
    }));
    expect(locked.status).toBe(409);

    const invalid = await draftPost(request('http://localhost/api/admin/election-drafts', 'POST', 'draft-owner-session', {
      payload: payload('Invalid draft'),
      currentStep: 4
    }));
    const invalidDraft = (await invalid.json()).draft;
    const rejected = await electionPost(request('http://localhost/api/admin/plebiscites', 'POST', 'draft-owner-session', {
      ...payload('Invalid draft').formData,
      questions: [],
      setup_draft_id: invalidDraft.id
    }));
    expect(rejected.status).toBe(400);
    expect(db.prepare('SELECT id FROM election_setup_drafts WHERE id = ?').get(invalidDraft.id))
      .toEqual({ id: invalidDraft.id });
  });

  it('lets an Owner explicitly take over another creator draft and audits it', async () => {
    const created = await draftPost(request('http://localhost/api/admin/election-drafts', 'POST', 'draft-other-session', {
      payload: payload('Returning Officer recovery draft'),
      currentStep: 3
    }));
    const draft = (await created.json()).draft;

    const forbidden = await draftPatch(request('http://localhost/api/admin/election-drafts', 'PATCH', 'draft-other-session', {
      id: draft.id,
      action: 'take_over'
    }));
    expect(forbidden.status).toBe(403);

    const taken = await draftPatch(request('http://localhost/api/admin/election-drafts', 'PATCH', 'draft-owner-session', {
      id: draft.id,
      action: 'take_over'
    }));
    expect(taken.status).toBe(200);
    expect(db.prepare('SELECT created_by_admin_user_id FROM election_setup_drafts WHERE id = ?').get(draft.id))
      .toEqual({ created_by_admin_user_id: ownerId });
    expect(db.prepare(`SELECT action, target_id FROM admin_audit_log
      WHERE action = 'election_setup_draft.take_over' AND target_id = ?`).get(String(draft.id)))
      .toEqual({ action: 'election_setup_draft.take_over', target_id: String(draft.id) });

    const previousOwnerCannotEdit = await draftGet(request(
      `http://localhost/api/admin/election-drafts?id=${draft.id}`,
      'GET',
      'draft-other-session'
    ));
    expect(previousOwnerCannotEdit.status).toBe(404);
    const ownerCanEdit = await draftGet(request(
      `http://localhost/api/admin/election-drafts?id=${draft.id}`,
      'GET',
      'draft-owner-session'
    ));
    expect(ownerCanEdit.status).toBe(200);
  });

  it('renders the dashboard and proofing affordances in source', () => {
    const dashboard = fs.readFileSync(path.join(process.cwd(), 'src/app/admin/page.tsx'), 'utf8');
    const form = fs.readFileSync(path.join(process.cwd(), 'src/app/admin/plebiscites/new/CreatePlebisciteForm.tsx'), 'utf8');
    const proof = fs.readFileSync(path.join(process.cwd(), 'src/app/proof/[token]/page.tsx'), 'utf8');
    expect(dashboard).toContain('Election Setup Drafts');
    expect(dashboard).toContain('Continue editing');
    expect(dashboard).toContain('Created by');
    expect(dashboard).toContain('DraftTakeoverButton');
    const takeover = fs.readFileSync(path.join(process.cwd(), 'src/app/admin/DraftTakeoverButton.tsx'), 'utf8');
    expect(takeover).toContain('Take over draft');
    expect(takeover).toContain('This action is audited.');
    expect(form).toContain('Draft autosaved');
    expect(form).toContain('You are still on this page so nothing is lost.');
    expect(form).toContain('Copy proofing link');
    expect(form).toContain('Who can view the final results?');
    expect(form).toContain('Anyone with the results link');
    expect(form).toContain('Eligible voters only');
    expect(form).toContain("'Publish Election'");
    expect(proof).toContain('Private proofing copy');
    expect(proof).toContain('Voting is disabled');
    expect(proof).toContain('Final results');
  });
});
