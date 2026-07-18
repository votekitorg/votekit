import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { createAnonymousVoterSession, validateCSRFRequest } from '@/lib/auth';
import { votingClosedError } from '@/lib/election-window';
import { hashAccessToken, normalizeAccessCode } from '@/lib/voter-access';

export async function POST(request: NextRequest) {
  if (!validateCSRFRequest(request)) return NextResponse.json({ error: 'Invalid request' }, { status: 403 });
  const body = await request.json();
  if (typeof body.code !== 'string' || typeof body.plebisciteSlug !== 'string') {
    return NextResponse.json({ error: 'Voting code and election link are required' }, { status: 400 });
  }
  const normalized = normalizeAccessCode(body.code);
  if (normalized.length !== 28) return NextResponse.json({ error: 'Invalid or already used voting code' }, { status: 400 });
  const election = db.prepare(`SELECT * FROM plebiscites WHERE slug = ? AND status = 'open' AND access_mode = 'anonymous_codes'`)
    .get(body.plebisciteSlug) as any;
  if (!election) return NextResponse.json({ error: 'Election not found or not currently open' }, { status: 404 });
  const closedError = votingClosedError(election);
  if (closedError) return NextResponse.json({ error: closedError }, { status: 403 });
  const credential = db.prepare(`SELECT id, used FROM anonymous_access_codes WHERE plebiscite_id = ? AND token_hash = ?`)
    .get(election.id, hashAccessToken(normalized)) as { id: number; used: number } | undefined;
  if (!credential || credential.used) return NextResponse.json({ error: 'Invalid or already used voting code' }, { status: 400 });
  const sessionId = createAnonymousVoterSession(election.id, credential.id);
  const response = NextResponse.json({ success: true });
  response.cookies.set(`voter-session-${election.slug}`, sessionId, {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 2 * 60 * 60
  });
  return response;
}
