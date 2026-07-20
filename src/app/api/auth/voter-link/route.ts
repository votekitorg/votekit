import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { createVoterSession, validateCSRFRequest } from '@/lib/auth';
import { votingClosedError } from '@/lib/election-window';
import { hashLinkToken } from '@/lib/voter-access';
import { reconcileScheduledElection } from '@/lib/election-opening';

export async function POST(request: NextRequest) {
  if (!validateCSRFRequest(request)) return NextResponse.json({ error: 'Invalid request' }, { status: 403 });
  const body = await request.json();
  if (typeof body.token !== 'string' || body.token.length > 100 || typeof body.plebisciteSlug !== 'string') return NextResponse.json({ error: 'Invalid ballot link' }, { status: 400 });
  await reconcileScheduledElection({ slug: body.plebisciteSlug });
  const election = db.prepare(`SELECT * FROM plebiscites WHERE slug = ? AND status = 'open' AND access_mode = 'voter_roll'`).get(body.plebisciteSlug) as any;
  if (!election) return NextResponse.json({ error: 'Election not found or not currently open' }, { status: 404 });
  const closedError = votingClosedError(election); if (closedError) return NextResponse.json({ error: closedError }, { status: 403 });
  const credential = db.prepare(`SELECT vt.voter_roll_id, vr.email, vr.phone FROM voter_link_tokens vt JOIN voter_roll vr ON vr.id = vt.voter_roll_id
    WHERE vt.plebiscite_id = ? AND vt.token_hash = ? AND vt.revoked = FALSE`).get(election.id, hashLinkToken(body.token)) as any;
  if (!credential) return NextResponse.json({ error: 'Invalid ballot link' }, { status: 400 });
  if (db.prepare('SELECT 1 FROM participation WHERE plebiscite_id = ? AND voter_roll_id = ?').get(election.id, credential.voter_roll_id)) return NextResponse.json({ error: 'You have already voted in this election' }, { status: 409 });
  const sessionId = createVoterSession(credential.email || credential.phone, election.id, credential.voter_roll_id, 'voter_link');
  const response = NextResponse.json({ success: true });
  response.cookies.set(`voter-session-${election.slug}`, sessionId, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 2 * 60 * 60 });
  return response;
}
