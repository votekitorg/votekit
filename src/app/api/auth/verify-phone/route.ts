import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { createVoterSession, validateCSRFRequest } from '@/lib/auth';
import { votingClosedError } from '@/lib/election-window';
import { verifyFirebasePhoneToken } from '@/lib/firebase-token';
import { normalizePhoneNumber } from '@/lib/voter-access';

export async function POST(request: NextRequest) {
  if (!validateCSRFRequest(request)) return NextResponse.json({ error: 'Invalid request' }, { status: 403 });
  try {
    const body = await request.json();
    if (typeof body.idToken !== 'string' || body.idToken.length > 10_000 || typeof body.plebisciteSlug !== 'string') {
      return NextResponse.json({ error: 'Phone verification token and election link are required' }, { status: 400 });
    }
    const verifiedPhone = normalizePhoneNumber(await verifyFirebasePhoneToken(body.idToken));
    if (!verifiedPhone) return NextResponse.json({ error: 'Invalid verified phone number' }, { status: 400 });
    const election = db.prepare(`SELECT * FROM plebiscites WHERE slug = ? AND status = 'open' AND access_mode = 'voter_roll'`)
      .get(body.plebisciteSlug) as any;
    if (!election) return NextResponse.json({ error: 'Election not found or not currently open' }, { status: 404 });
    if (!election.sms_enabled) return NextResponse.json({ error: 'Text-message verification is not enabled for this election' }, { status: 403 });
    const closedError = votingClosedError(election);
    if (closedError) return NextResponse.json({ error: closedError }, { status: 403 });
    const voter = db.prepare('SELECT id FROM voter_roll WHERE plebiscite_id = ? AND phone = ?').get(election.id, verifiedPhone) as { id: number } | undefined;
    if (!voter) return NextResponse.json({ error: 'This phone number is not eligible for this election' }, { status: 403 });
    const participated = db.prepare('SELECT 1 FROM participation WHERE plebiscite_id = ? AND voter_roll_id = ?').get(election.id, voter.id);
    if (participated) return NextResponse.json({ error: 'You have already voted in this election' }, { status: 409 });
    const sessionId = createVoterSession(verifiedPhone, election.id, voter.id, 'phone');
    const response = NextResponse.json({ success: true });
    response.cookies.set(`voter-session-${election.slug}`, sessionId, {
      httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 2 * 60 * 60
    });
    return response;
  } catch (error) {
    console.error('Phone verification error:', error);
    return NextResponse.json({ error: 'Phone verification failed' }, { status: 401 });
  }
}
