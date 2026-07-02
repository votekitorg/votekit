import { NextRequest, NextResponse } from 'next/server';
import db, { cleanupExpiredCodes } from '@/lib/db';
import { createVoterSession, checkVoterVerificationBruteForce, clearVoterVerificationFailedAttempts, recordVoterVerificationAttempt, validateCSRFRequest } from '@/lib/auth';
import { votingClosedError } from '@/lib/election-window';

export async function POST(request: NextRequest) {
  if (!validateCSRFRequest(request)) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { email, code, plebisciteSlug } = body;

    if (!email || !code || !plebisciteSlug) {
      return NextResponse.json(
        { error: 'Email, code, and election link are required' },
        { status: 400 }
      );
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Clean up expired codes first
    cleanupExpiredCodes();

    // Get plebiscite
    const plebiscite = db.prepare('SELECT * FROM plebiscites WHERE slug = ? AND status = ?').get(plebisciteSlug, 'open') as any;
    if (!plebiscite) {
      return NextResponse.json(
        { error: 'Election not found or not currently open' },
        { status: 404 }
      );
    }

    const closedError = votingClosedError(plebiscite);
    if (closedError) {
      return NextResponse.json({ error: closedError }, { status: 403 });
    }

    // Check brute force lockout
    const bruteCheck = checkVoterVerificationBruteForce(normalizedEmail, plebiscite.id);
    if (bruteCheck.blocked) {
      return NextResponse.json(
        { error: 'Too many failed attempts. Please request a new verification code after 15 minutes.' },
        { status: 429 }
      );
    }

    const now = new Date();

    // Verify code
    const verification = db.prepare(`
      SELECT * FROM verification_codes 
      WHERE email = ? AND plebiscite_id = ? AND code = ? AND expires_at > ? AND used = FALSE
    `).get(normalizedEmail, plebiscite.id, code, now.toISOString()) as any;

    if (!verification) {
      recordVoterVerificationAttempt(normalizedEmail, plebiscite.id, false);
      const remaining = checkVoterVerificationBruteForce(normalizedEmail, plebiscite.id).remaining;
      return NextResponse.json(
        { error: remaining > 0 
            ? `Invalid or expired verification code. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.`
            : 'Too many failed attempts. Please request a new verification code after 15 minutes.' },
        { status: remaining > 0 ? 400 : 429 }
      );
    }

    // Check if email is in this election's voter roll
    const voter = db.prepare(`
      SELECT * FROM voter_roll
      WHERE email = ? AND plebiscite_id = ?
      LIMIT 1
    `).get(normalizedEmail, plebiscite.id) as any;
    if (!voter) {
      return NextResponse.json(
        { error: 'Email address not found in voter roll' },
        { status: 403 }
      );
    }

    // Check if user has already voted
    const hasVoted = db.prepare('SELECT * FROM participation WHERE plebiscite_id = ? AND voter_roll_id = ?')
      .get(plebiscite.id, voter.id) as any;
    
    if (hasVoted) {
      return NextResponse.json(
        { error: 'You have already voted in this election' },
        { status: 409 }
      );
    }

    // Clear failed attempts on success
    clearVoterVerificationFailedAttempts(normalizedEmail, plebiscite.id);

    recordVoterVerificationAttempt(normalizedEmail, plebiscite.id, true);

    // Mark code as used
    db.prepare('UPDATE verification_codes SET used = TRUE WHERE id = ?').run(verification.id);

    // Create voter session
    const sessionId = createVoterSession(normalizedEmail, plebiscite.id);

    // Set cookie and return success
    const response = NextResponse.json({
      success: true,
      message: 'Email verified successfully'
    });

    response.cookies.set(`voter-session-${plebisciteSlug}`, sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 2 * 60 * 60 // 2 hours
    });

    return response;

  } catch (error) {
    console.error('Email confirmation error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
