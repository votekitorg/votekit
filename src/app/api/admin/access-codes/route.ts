import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { canManageElection, getAdminSessionFromRequest, recordAdminAuditLog, validateCSRFRequest } from '@/lib/auth';
import { generateAccessCode, hashAccessToken } from '@/lib/voter-access';

const MAX_CODES_PER_BATCH = 10_000;

function electionForAdmin(request: NextRequest, id: number) {
  const session = getAdminSessionFromRequest(request);
  if (!session) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (!canManageElection(session, id)) return { error: NextResponse.json({ error: 'You do not have permission to manage this election' }, { status: 403 }) };
  const election = db.prepare('SELECT id, slug, status, access_mode FROM plebiscites WHERE id = ?').get(id) as any;
  if (!election) return { error: NextResponse.json({ error: 'Election not found' }, { status: 404 }) };
  return { session, election };
}

export async function GET(request: NextRequest) {
  const id = Number(request.nextUrl.searchParams.get('plebiscite_id'));
  if (!id) return NextResponse.json({ error: 'Election ID is required' }, { status: 400 });
  const result = electionForAdmin(request, id);
  if (result.error) return result.error;
  const stats = db.prepare(`SELECT COUNT(*) AS total, SUM(CASE WHEN used = 1 THEN 1 ELSE 0 END) AS used
    FROM anonymous_access_codes WHERE plebiscite_id = ?`).get(id) as { total: number; used: number | null };
  return NextResponse.json({ total: stats.total, used: stats.used || 0, remaining: stats.total - (stats.used || 0) });
}

export async function POST(request: NextRequest) {
  if (!validateCSRFRequest(request)) return NextResponse.json({ error: 'Invalid request' }, { status: 403 });
  const body = await request.json();
  const id = Number(body.plebiscite_id);
  const count = Number(body.count);
  if (!id || !Number.isInteger(count) || count < 1 || count > MAX_CODES_PER_BATCH) {
    return NextResponse.json({ error: `Generate between 1 and ${MAX_CODES_PER_BATCH} codes at a time` }, { status: 400 });
  }
  const result = electionForAdmin(request, id);
  if (result.error) return result.error;
  const { election, session } = result;
  if (election.status !== 'draft') return NextResponse.json({ error: 'Codes can only be generated for draft elections' }, { status: 409 });
  if (election.access_mode !== 'anonymous_codes') return NextResponse.json({ error: 'This election does not use anonymous codes' }, { status: 409 });

  const batchId = randomUUID();
  const codes: Array<{ code: string; link: string }> = [];
  const origin = (process.env.VOTEKIT_PUBLIC_URL || request.nextUrl.origin).replace(/\/$/u, '');
  const insert = db.prepare(`INSERT INTO anonymous_access_codes (plebiscite_id, token_hash, batch_id) VALUES (?, ?, ?)`);
  db.transaction(() => {
    for (let index = 0; index < count; index++) {
      const code = generateAccessCode();
      insert.run(id, hashAccessToken(code), batchId);
      codes.push({ code, link: `${origin}/vote/${election.slug}#code=${encodeURIComponent(code)}` });
    }
    recordAdminAuditLog({
      adminUserId: session!.adminUserId,
      action: 'anonymous_codes.generate',
      targetType: 'plebiscite',
      targetId: id,
      details: { batchId, count }
    });
  })();

  return NextResponse.json({ success: true, batchId, codes }, { headers: { 'Cache-Control': 'no-store' } });
}
