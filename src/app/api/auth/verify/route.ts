import { NextRequest, NextResponse } from 'next/server';
import { getTrustedRequestIp, validateCSRFRequest } from '@/lib/auth';
import db, { cleanupExpiredCodes } from '@/lib/db';
import { votingClosedError } from '@/lib/election-window';
import {
  sendVerificationEmail,
  generateVerificationCode,
  isEmailRateLimited,
  incrementEmailAttempts,
  getRemainingEmailAttempts,
  isRateLimitKeyLimited,
  incrementRateLimitKey,
  MAX_VERIFICATION_IP_ATTEMPTS,
  MAX_VERIFICATION_GLOBAL_ATTEMPTS
} from '@/lib/email';

const NEUTRAL_VERIFICATION_MESSAGE = 'If that email is eligible, a verification code will be sent shortly.';

function neutralVerificationResponse() {
  return NextResponse.json({
    success: true,
    message: NEUTRAL_VERIFICATION_MESSAGE
  });
}

export async function POST(request: NextRequest) {
  if (!validateCSRFRequest(request)) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { email, plebisciteSlug } = body;

    if (!email || !plebisciteSlug) {
      return NextResponse.json(
        { error: 'Email and plebiscite slug are required' },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      return NextResponse.json(
        { error: 'Invalid email address' },
        { status: 400 }
      );
    }

    const normalizedEmail = email.trim().toLowerCase();
    const requestIp = getTrustedRequestIp(request);
    const ipRateLimitKey = `ip:${requestIp}`;
    const globalRateLimitKey = `global:${plebisciteSlug}`;

    // Clean up expired codes first
    cleanupExpiredCodes();

    if (
      isEmailRateLimited(normalizedEmail) ||
      isRateLimitKeyLimited(ipRateLimitKey, MAX_VERIFICATION_IP_ATTEMPTS) ||
      isRateLimitKeyLimited(globalRateLimitKey, MAX_VERIFICATION_GLOBAL_ATTEMPTS)
    ) {
      const remaining = getRemainingEmailAttempts(normalizedEmail);
      return NextResponse.json(
        {
          error: remaining > 0
            ? 'Too many verification attempts from this network. Please try again later.'
            : `Too many verification attempts. You can request ${remaining} more code${remaining !== 1 ? 's' : ''} in the next hour.`,
          rateLimited: true
        },
        { status: 429 }
      );
    }

    // Count all syntactically valid requests against email, IP, and global
    // throttles before any eligibility branch, so voter-roll probing is not free.
    incrementEmailAttempts(normalizedEmail);
    incrementRateLimitKey(ipRateLimitKey);
    incrementRateLimitKey(globalRateLimitKey);

    // Get plebiscite
    const plebiscite = db.prepare('SELECT * FROM plebiscites WHERE slug = ? AND status = ?').get(plebisciteSlug, 'open') as any;
    if (!plebiscite) {
      return NextResponse.json(
        { error: 'Plebiscite not found or not currently open' },
        { status: 404 }
      );
    }

    const closedError = votingClosedError(plebiscite);
    if (closedError) {
      return NextResponse.json({ error: closedError }, { status: 403 });
    }

    // Use a neutral response for eligibility/voted-state failures so this route
    // cannot be used to enumerate the voter roll or who has already voted.
    const voter = db.prepare('SELECT * FROM voter_roll WHERE email = ? AND plebiscite_id = ?').get(normalizedEmail, plebiscite.id) as any;
    if (!voter) {
      return neutralVerificationResponse();
    }

    const hasVoted = db.prepare('SELECT * FROM participation WHERE plebiscite_id = ? AND voter_roll_id = ?')
      .get(plebiscite.id, voter.id) as any;

    if (hasVoted) {
      return neutralVerificationResponse();
    }

    // Generate verification code
    const code = generateVerificationCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes

    // Store verification code
    db.prepare(`
      INSERT INTO verification_codes (email, plebiscite_id, code, expires_at)
      VALUES (?, ?, ?, ?)
    `).run(normalizedEmail, plebiscite.id, code, expiresAt);

    // Send email
    const emailResult = await sendVerificationEmail(normalizedEmail, code, plebiscite.title);

    if (!emailResult.success) {
      // Clean up the code if email failed
      db.prepare('DELETE FROM verification_codes WHERE email = ? AND code = ?')
        .run(normalizedEmail, code);

      return NextResponse.json(
        { error: 'Failed to send verification email. Please try again.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Verification code sent to your email',
      remaining: getRemainingEmailAttempts(normalizedEmail)
    });

  } catch (error) {
    console.error('Verification email error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
