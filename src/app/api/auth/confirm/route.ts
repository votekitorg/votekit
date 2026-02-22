import { NextRequest, NextResponse } from 'next/server';
import db, { cleanupExpiredCodes } from '@/lib/db';
import { createVoterSession } from '@/lib/auth';

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

    // Check if voting period is active
    const now = new Date();
    const openDate = new Date(plebiscite.open_date);
    const closeDate = new Date(plebiscite.close_date);

    if (now < openDate || now >= closeDate) {
      return NextResponse.json(
        { error: 'Voting period is not active' },
        { status: 400 }
      );
    }

    // Verify code
    const verification = db.prepare(`
      SELECT * FROM verification_codes 
      WHERE email = ? AND code = ? AND expires_at > ? AND used = FALSE
    `).get(normalizedEmail, code, now.toISOString()) as any;

    if (!verification) {
      return NextResponse.json(
        { error: 'Invalid or expired verification code' },
        { status: 400 }
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