import { NextRequest, NextResponse } from 'next/server';
import db, { cleanupExpiredCodes } from '@/lib/db';
import { createVoterSession } from '@/lib/auth';

// Brute force protection constants
const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION = 15 * 60 * 1000; // 15 minutes

function checkBruteForce(identifier: string): { blocked: boolean; remaining: number } {
  const now = Date.now();
  const record = db.prepare('SELECT * FROM verification_attempts WHERE identifier = ?').get(identifier) as {
    identifier: string; attempts: number; last_attempt: number; locked_until: number;
  } | undefined;

  if (!record) return { blocked: false, remaining: MAX_ATTEMPTS };

  // Reset if lockout has expired
  if (record.locked_until && now > record.locked_until) {
    db.prepare('DELETE FROM verification_attempts WHERE identifier = ?').run(identifier);
    return { blocked: false, remaining: MAX_ATTEMPTS };
  }

  if (record.attempts >= MAX_ATTEMPTS) {
    return { blocked: true, remaining: 0 };
  }

  return { blocked: false, remaining: MAX_ATTEMPTS - record.attempts };
}

function recordFailedAttempt(identifier: string): void {
  const now = Date.now();
  const record = db.prepare('SELECT * FROM verification_attempts WHERE identifier = ?').get(identifier) as {
    identifier: string; attempts: number; last_attempt: number; locked_until: number;
  } | undefined;

  const newCount = (record?.attempts || 0) + 1;
  const lockedUntil = newCount >= MAX_ATTEMPTS ? now + LOCKOUT_DURATION : null;

  if (newCount >= MAX_ATTEMPTS) {
    // Invalidate all active codes for this identifier
    db.prepare('UPDATE verification_codes SET used = TRUE WHERE email = ? AND used = FALSE').run(identifier);
  }

  db.prepare(`
    INSERT INTO verification_attempts (identifier, attempts, last_attempt, locked_until)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(identifier) DO UPDATE SET attempts = ?, last_attempt = ?, locked_until = ?
  `).run(identifier, newCount, now, lockedUntil, newCount, now, lockedUntil);
}

function clearFailedAttempts(identifier: string): void {
  db.prepare('DELETE FROM verification_attempts WHERE identifier = ?').run(identifier);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, code, plebisciteSlug } = body;

    if (!email || !code || !plebisciteSlug) {
      return NextResponse.json(
        { error: 'Email, code, and plebiscite slug are required' },
        { status: 400 }
      );
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Check brute force lockout
    const bruteCheck = checkBruteForce(normalizedEmail);
    if (bruteCheck.blocked) {
      return NextResponse.json(
        { error: 'Too many failed attempts. Please request a new verification code after 15 minutes.' },
        { status: 429 }
      );
    }

    // Clean up expired codes first
    cleanupExpiredCodes();

    // Get plebiscite
    const plebiscite = db.prepare('SELECT * FROM plebiscites WHERE slug = ? AND status = ?').get(plebisciteSlug, 'open') as any;
    if (!plebiscite) {
      return NextResponse.json(
        { error: 'Plebiscite not found or not currently open' },
        { status: 404 }
      );
    }

    const now = new Date();

    // Verify code
    const verification = db.prepare(`
      SELECT * FROM verification_codes 
      WHERE email = ? AND code = ? AND expires_at > ? AND used = FALSE
    `).get(normalizedEmail, code, now.toISOString()) as any;

    if (!verification) {
      recordFailedAttempt(normalizedEmail);
      const remaining = checkBruteForce(normalizedEmail).remaining;
      return NextResponse.json(
        { error: remaining > 0 
            ? `Invalid or expired verification code. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.`
            : 'Too many failed attempts. Please request a new verification code after 15 minutes.' },
        { status: remaining > 0 ? 400 : 429 }
      );
    }

    // Check if email is in voter roll
    const voter = db.prepare('SELECT * FROM voter_roll WHERE email = ?').get(normalizedEmail) as any;
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
        { error: 'You have already voted in this plebiscite' },
        { status: 409 }
      );
    }

    // Clear failed attempts on success
    clearFailedAttempts(normalizedEmail);

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
      sameSite: 'strict',
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
