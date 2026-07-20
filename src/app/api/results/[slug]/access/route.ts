import { NextRequest, NextResponse } from 'next/server';
import db, { cleanupExpiredCodes } from '@/lib/db';
import {
  checkVoterVerificationBruteForce,
  clearVoterVerificationFailedAttempts,
  createAnonymousVoterSession,
  createVoterSession,
  getTrustedRequestIp,
  recordVoterVerificationAttempt,
  validateCSRFRequest
} from '@/lib/auth';
import {
  generateVerificationCode,
  incrementEmailAttempts,
  incrementRateLimitKey,
  isEmailRateLimited,
  isRateLimitKeyLimited,
  MAX_VERIFICATION_GLOBAL_ATTEMPTS,
  MAX_VERIFICATION_IP_ATTEMPTS,
  sendResultsVerificationEmail
} from '@/lib/email';
import { verifyFirebasePhoneToken } from '@/lib/firebase-token';
import { hashAccessToken, hashLinkToken, normalizeAccessCode, normalizePhoneNumber } from '@/lib/voter-access';
import { getResultsAccessElection } from '@/lib/results-access';

const RESULT_SESSION_SECONDS = 12 * 60 * 60;
const NEUTRAL_EMAIL_MESSAGE = 'If that email is eligible, a results access code will be sent shortly.';

function setResultSessionCookie(response: NextResponse, slug: string, sessionId: string): NextResponse {
  response.cookies.set(`voter-session-${slug}`, sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: RESULT_SESSION_SECONDS
  });
  return response;
}

function eligiblePrivateElection(slug: string) {
  const election = getResultsAccessElection(slug);
  if (!election || election.status !== 'closed' || election.archived_at || election.results_visibility !== 'eligible') return null;
  return election;
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  if (!validateCSRFRequest(request)) return NextResponse.json({ error: 'Invalid request' }, { status: 403 });
  const { slug } = await params;
  const election = eligiblePrivateElection(slug);
  if (!election) return NextResponse.json({ error: 'Private results are not available' }, { status: 404 });

  try {
    const body = await request.json();
    const action = body?.action;
    const requestIp = getTrustedRequestIp(request);
    const ipKey = `results-ip:${requestIp}`;
    const globalKey = `results-global:${slug}`;

    if (action === 'request_email') {
      if (election.access_mode !== 'voter_roll' || typeof body.email !== 'string' || body.email.length > 254 || !/^\S+@\S+\.\S+$/.test(body.email.trim())) {
        return NextResponse.json({ error: 'Enter a valid registered email address' }, { status: 400 });
      }
      const email = body.email.trim().toLowerCase();
      cleanupExpiredCodes();
      if (isEmailRateLimited(email) || isRateLimitKeyLimited(ipKey, MAX_VERIFICATION_IP_ATTEMPTS) || isRateLimitKeyLimited(globalKey, MAX_VERIFICATION_GLOBAL_ATTEMPTS)) {
        return NextResponse.json({ error: 'Too many verification attempts. Please try again later.' }, { status: 429 });
      }
      incrementEmailAttempts(email);
      incrementRateLimitKey(ipKey);
      incrementRateLimitKey(globalKey);

      const voter = db.prepare('SELECT id FROM voter_roll WHERE plebiscite_id = ? AND email = ?').get(election.id, email) as { id: number } | undefined;
      if (voter) {
        const code = generateVerificationCode();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
        db.prepare('UPDATE verification_codes SET used = TRUE WHERE plebiscite_id = ? AND email = ? AND used = FALSE').run(election.id, email);
        db.prepare('INSERT INTO verification_codes (email, plebiscite_id, code, expires_at) VALUES (?, ?, ?, ?)').run(email, election.id, code, expiresAt);
        const sent = await sendResultsVerificationEmail(email, code, election.title);
        if (!sent.success) db.prepare('DELETE FROM verification_codes WHERE plebiscite_id = ? AND email = ? AND code = ?').run(election.id, email, code);
      }
      return NextResponse.json({ success: true, message: NEUTRAL_EMAIL_MESSAGE });
    }

    if (action === 'confirm_email') {
      if (election.access_mode !== 'voter_roll' || typeof body.email !== 'string' || typeof body.code !== 'string' || !/^\d{6}$/.test(body.code)) {
        return NextResponse.json({ error: 'Email and six-digit code are required' }, { status: 400 });
      }
      const email = body.email.trim().toLowerCase();
      const brute = checkVoterVerificationBruteForce(email, election.id);
      if (brute.blocked) return NextResponse.json({ error: 'Too many failed attempts. Request a new code after 15 minutes.' }, { status: 429 });
      const verification = db.prepare(`SELECT id FROM verification_codes
        WHERE plebiscite_id = ? AND email = ? AND code = ? AND expires_at > ? AND used = FALSE`
      ).get(election.id, email, body.code, new Date().toISOString()) as { id: number } | undefined;
      const voter = db.prepare('SELECT id FROM voter_roll WHERE plebiscite_id = ? AND email = ?').get(election.id, email) as { id: number } | undefined;
      if (!verification || !voter) {
        recordVoterVerificationAttempt(email, election.id, false);
        return NextResponse.json({ error: 'Invalid or expired verification code' }, { status: 400 });
      }
      const consumed = db.prepare('UPDATE verification_codes SET used = TRUE WHERE id = ? AND used = FALSE').run(verification.id);
      if (consumed.changes !== 1) return NextResponse.json({ error: 'Invalid or expired verification code' }, { status: 400 });
      clearVoterVerificationFailedAttempts(email, election.id);
      recordVoterVerificationAttempt(email, election.id, true);
      const sessionId = createVoterSession(email, election.id, voter.id, 'email', RESULT_SESSION_SECONDS);
      return setResultSessionCookie(NextResponse.json({ success: true }), slug, sessionId);
    }

    if (action === 'access_code') {
      if (election.access_mode !== 'anonymous_codes' || typeof body.code !== 'string') {
        return NextResponse.json({ error: 'Voting code is required' }, { status: 400 });
      }
      if (isRateLimitKeyLimited(ipKey, MAX_VERIFICATION_IP_ATTEMPTS) || isRateLimitKeyLimited(globalKey, MAX_VERIFICATION_GLOBAL_ATTEMPTS)) {
        return NextResponse.json({ error: 'Too many attempts. Please try again later.' }, { status: 429 });
      }
      incrementRateLimitKey(ipKey);
      incrementRateLimitKey(globalKey);
      const normalized = normalizeAccessCode(body.code);
      const credential = normalized.length === 28
        ? db.prepare('SELECT id FROM anonymous_access_codes WHERE plebiscite_id = ? AND token_hash = ?').get(election.id, hashAccessToken(normalized)) as { id: number } | undefined
        : undefined;
      if (!credential) return NextResponse.json({ error: 'Invalid voting code' }, { status: 400 });
      const sessionId = createAnonymousVoterSession(election.id, credential.id, RESULT_SESSION_SECONDS);
      return setResultSessionCookie(NextResponse.json({ success: true }), slug, sessionId);
    }

    if (action === 'voter_link') {
      if (election.access_mode !== 'voter_roll' || typeof body.token !== 'string' || body.token.length > 100) {
        return NextResponse.json({ error: 'Invalid voter link' }, { status: 400 });
      }
      const voter = db.prepare(`SELECT vr.id, vr.email, vr.phone FROM voter_link_tokens vt
        JOIN voter_roll vr ON vr.id = vt.voter_roll_id
        WHERE vt.plebiscite_id = ? AND vt.token_hash = ? AND vt.revoked = FALSE`
      ).get(election.id, hashLinkToken(body.token)) as { id: number; email: string | null; phone: string | null } | undefined;
      if (!voter) return NextResponse.json({ error: 'Invalid voter link' }, { status: 400 });
      const sessionId = createVoterSession(voter.email || voter.phone || 'eligible-voter', election.id, voter.id, 'voter_link', RESULT_SESSION_SECONDS);
      return setResultSessionCookie(NextResponse.json({ success: true }), slug, sessionId);
    }

    if (action === 'verify_phone') {
      if (election.access_mode !== 'voter_roll' || !election.sms_enabled || typeof body.idToken !== 'string' || body.idToken.length > 10_000) {
        return NextResponse.json({ error: 'Phone verification is not available' }, { status: 400 });
      }
      const phone = normalizePhoneNumber(await verifyFirebasePhoneToken(body.idToken));
      const voter = phone ? db.prepare('SELECT id FROM voter_roll WHERE plebiscite_id = ? AND phone = ?').get(election.id, phone) as { id: number } | undefined : undefined;
      if (!phone || !voter) return NextResponse.json({ error: 'This phone number is not eligible for this election' }, { status: 403 });
      const sessionId = createVoterSession(phone, election.id, voter.id, 'phone', RESULT_SESSION_SECONDS);
      return setResultSessionCookie(NextResponse.json({ success: true }), slug, sessionId);
    }

    return NextResponse.json({ error: 'Invalid access request' }, { status: 400 });
  } catch (error) {
    console.error('Results access error:', error);
    return NextResponse.json({ error: 'Could not verify results access' }, { status: 500 });
  }
}
