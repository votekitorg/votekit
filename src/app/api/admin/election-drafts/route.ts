import { randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { canManageElections, getAdminSessionFromRequest, recordAdminAuditLog, validateCSRFRequest } from '@/lib/auth';
import db from '@/lib/db';

const MAX_DRAFT_BYTES = 300_000;

function draftForUser(id: number, adminUserId: number) {
  return db.prepare(`
    SELECT id, title, payload_json, current_step, proof_token, revision, created_at, updated_at
    FROM election_setup_drafts
    WHERE id = ? AND created_by_admin_user_id = ?
  `).get(id, adminUserId) as any;
}

function parseDraftInput(body: any): { payload: Record<string, unknown>; title: string; currentStep: number; serialized: string } | null {
  if (!body?.payload || typeof body.payload !== 'object' || Array.isArray(body.payload)) return null;
  const serialized = JSON.stringify(body.payload);
  if (Buffer.byteLength(serialized, 'utf8') > MAX_DRAFT_BYTES) return null;
  const currentStep = Number(body.currentStep);
  if (!Number.isInteger(currentStep) || currentStep < 1 || currentStep > 4) return null;
  const rawTitle = (body.payload as any)?.formData?.title;
  const title = typeof rawTitle === 'string' && rawTitle.trim()
    ? rawTitle.trim().slice(0, 200)
    : 'Untitled election';
  return { payload: body.payload, title, currentStep, serialized };
}

export async function GET(request: NextRequest) {
  const session = getAdminSessionFromRequest(request);
  if (!session || !canManageElections(session.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id < 1) {
    return NextResponse.json({ error: 'Draft ID is required' }, { status: 400 });
  }
  const draft = draftForUser(id, session.adminUserId);
  if (!draft) return NextResponse.json({ error: 'Draft not found' }, { status: 404 });
  return NextResponse.json({
    draft: {
      id: draft.id,
      title: draft.title,
      payload: JSON.parse(draft.payload_json),
      currentStep: draft.current_step,
      proofToken: draft.proof_token,
      revision: draft.revision,
      createdAt: draft.created_at,
      updatedAt: draft.updated_at
    }
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function POST(request: NextRequest) {
  if (!validateCSRFRequest(request)) return NextResponse.json({ error: 'Invalid request' }, { status: 403 });
  const session = getAdminSessionFromRequest(request);
  if (!session || !canManageElections(session.role)) {
    return NextResponse.json({ error: 'Owner or Returning Officer role required' }, { status: 403 });
  }
  const input = parseDraftInput(await request.json());
  if (!input) return NextResponse.json({ error: 'Draft data is invalid or too large' }, { status: 400 });

  const proofToken = randomBytes(24).toString('base64url');
  const result = db.prepare(`
    INSERT INTO election_setup_drafts
      (created_by_admin_user_id, title, payload_json, current_step, proof_token)
    VALUES (?, ?, ?, ?, ?)
  `).run(session.adminUserId, input.title, input.serialized, input.currentStep, proofToken);
  const id = Number(result.lastInsertRowid);
  recordAdminAuditLog({
    adminUserId: session.adminUserId,
    action: 'election_setup_draft.create',
    targetType: 'election_setup_draft',
    targetId: id,
    details: { title: input.title }
  });
  return NextResponse.json({ success: true, draft: { id, proofToken, revision: 1 } });
}

export async function PUT(request: NextRequest) {
  if (!validateCSRFRequest(request)) return NextResponse.json({ error: 'Invalid request' }, { status: 403 });
  const session = getAdminSessionFromRequest(request);
  if (!session || !canManageElections(session.role)) {
    return NextResponse.json({ error: 'Owner or Returning Officer role required' }, { status: 403 });
  }
  const body = await request.json();
  const id = Number(body?.id);
  const revision = Number(body?.revision);
  const input = parseDraftInput(body);
  if (!Number.isInteger(id) || id < 1 || !Number.isInteger(revision) || revision < 1 || !input) {
    return NextResponse.json({ error: 'Draft data is invalid or too large' }, { status: 400 });
  }
  if (!draftForUser(id, session.adminUserId)) {
    return NextResponse.json({ error: 'Draft not found' }, { status: 404 });
  }
  const result = db.prepare(`
    UPDATE election_setup_drafts
    SET title = ?, payload_json = ?, current_step = ?, revision = revision + 1, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND created_by_admin_user_id = ? AND revision = ?
  `).run(input.title, input.serialized, input.currentStep, id, session.adminUserId, revision);
  if (result.changes !== 1) {
    const current = draftForUser(id, session.adminUserId);
    return NextResponse.json({
      error: 'This draft was updated elsewhere. Reload before saving again.',
      currentRevision: current?.revision
    }, { status: 409 });
  }
  return NextResponse.json({ success: true, revision: revision + 1 });
}

export async function DELETE(request: NextRequest) {
  if (!validateCSRFRequest(request)) return NextResponse.json({ error: 'Invalid request' }, { status: 403 });
  const session = getAdminSessionFromRequest(request);
  if (!session || !canManageElections(session.role)) {
    return NextResponse.json({ error: 'Owner or Returning Officer role required' }, { status: 403 });
  }
  const id = Number(new URL(request.url).searchParams.get('id'));
  const draft = Number.isInteger(id) ? draftForUser(id, session.adminUserId) : null;
  if (!draft) return NextResponse.json({ error: 'Draft not found' }, { status: 404 });
  db.prepare('DELETE FROM election_setup_drafts WHERE id = ? AND created_by_admin_user_id = ?')
    .run(id, session.adminUserId);
  recordAdminAuditLog({
    adminUserId: session.adminUserId,
    action: 'election_setup_draft.delete',
    targetType: 'election_setup_draft',
    targetId: id,
    details: { title: draft.title }
  });
  return NextResponse.json({ success: true });
}
