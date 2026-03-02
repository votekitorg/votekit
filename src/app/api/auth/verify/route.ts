import { NextRequest, NextResponse } from 'next/server';
import db, { cleanupExpiredCodes } from '@/lib/db';
import { sendVerificationEmail, generateVerificationCode, isEmailRateLimited, incrementEmailAttempts, getRemainingEmailAttempts } from '@/lib/email';

export async function POST(request: NextRequest) {
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

    // Clean up expired codes first
    cleanupExpiredCodes();

    // Check rate limiting
    if (isEmailRateLimited(normalizedEmail)) {
      const remaining = getRemainingEmailAttempts(normalizedEmail);
      return NextResponse.json(
        { 
          error: `Too many verification attempts. You can request ${remaining} more code${remaining !== 1 ? 's' : ''} in the next hour.`,
          rateLimited: true
        },
        { status: 429 }
      );
    }

    // Get plebiscite
    const plebiscite = db.prepare('SELECT * FROM plebiscites WHERE slug = ? AND status = ?').get(plebisciteSlug, 'open') as any;
    if (!plebiscite) {
      return NextResponse.json(
        { error: 'Plebiscite not found or not currently open' },
        { status: 404 }
      );
    }

    // Status check is sufficient - admin controls open/close manually

    // Check if email is in this election's voter roll
    const voter = db.prepare('SELECT * FROM voter_roll WHERE email = ? AND plebiscite_id = ?').get(normalizedEmail, plebiscite.id) as any;
    if (!voter) {
      return NextResponse.json(
        { error: 'Email address not found in this election\'s voter roll' },
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

    // Generate verification code
    const code = generateVerificationCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes

    // Store verification code
    db.prepare(`
      INSERT INTO verification_codes (email, code, expires_at)
      VALUES (?, ?, ?)
    `).run(normalizedEmail, code, expiresAt);

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

    // Increment rate limiting counter
    incrementEmailAttempts(normalizedEmail);

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