import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import db from '@/lib/db';
import { verifyFirebaseIdToken } from '@/lib/firebase-admin';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { idToken, phone, plebisciteSlug } = body;

    if (!idToken || !phone || !plebisciteSlug) {
      return NextResponse.json(
        { error: 'ID token, phone, and plebiscite slug are required' },
        { status: 400 }
      );
    }

    const tokenResult = await verifyFirebaseIdToken(idToken);
    
    if (!tokenResult.success) {
      return NextResponse.json(
        { error: tokenResult.error || 'Token verification failed' },
        { status: 401 }
      );
    }

    const normalizedPhone = normalizePhone(phone);
    const tokenPhone = tokenResult.phoneNumber;
    
    if (tokenPhone !== normalizedPhone && tokenPhone !== phone) {
      return NextResponse.json(
        { error: 'Phone number mismatch' },
        { status: 403 }
      );
    }

    const plebiscite = db.prepare(
      'SELECT * FROM plebiscites WHERE slug = ? AND status = ?'
    ).get(plebisciteSlug, 'open') as any;
    
    if (!plebiscite) {
      return NextResponse.json(
        { error: 'Plebiscite not found or not currently open' },
        { status: 404 }
      );
    }

    if (!plebiscite.sms_enabled) {
      return NextResponse.json(
        { error: 'SMS verification is not enabled for this election' },
        { status: 403 }
      );
    }

    let voter = db.prepare(
      'SELECT * FROM voter_roll WHERE phone = ? AND plebiscite_id = ?'
    ).get(normalizedPhone, plebiscite.id) as any;
    
    if (!voter) {
      voter = db.prepare(
        'SELECT * FROM voter_roll WHERE phone = ? AND plebiscite_id = ?'
      ).get(phone, plebiscite.id) as any;
    }

    if (!voter) {
      return NextResponse.json(
        { error: 'Phone number not found in this election\'s voter roll' },
        { status: 403 }
      );
    }

    const hasVoted = db.prepare(
      'SELECT * FROM participation WHERE plebiscite_id = ? AND voter_roll_id = ?'
    ).get(plebiscite.id, voter.id) as any;
    
    if (hasVoted) {
      return NextResponse.json(
        { error: 'You have already voted in this plebiscite' },
        { status: 409 }
      );
    }

    const sessionId = createVoterSessionWithPhone(normalizedPhone, plebiscite.id);

    const response = NextResponse.json({
      success: true,
      message: 'Phone verified successfully',
      verificationMethod: 'sms'
    });

    response.cookies.set('voter-session-' + plebisciteSlug, sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 2 * 60 * 60
    });

    return response;

  } catch (error) {
    console.error('Phone verification error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

function normalizePhone(phone: string): string {
  let cleaned = phone.replace(/[^\d+]/g, '');
  
  if (cleaned.startsWith('0') && cleaned.length === 10) {
    cleaned = '+61' + cleaned.substring(1);
  }
  
  if (!cleaned.startsWith('+')) {
    if (cleaned.startsWith('61') && cleaned.length === 11) {
      cleaned = '+' + cleaned;
    } else if (cleaned.length === 9) {
      cleaned = '+61' + cleaned;
    }
  }
  
  return cleaned;
}

function createVoterSessionWithPhone(phone: string, plebisciteId: number): string {
  const sessionId = uuidv4();
  const expiresAt = new Date(Date.now() + (2 * 60 * 60 * 1000));
  
  db.prepare(`
    INSERT INTO sessions (id, email, plebiscite_id, is_admin, expires_at, identifier_type)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(sessionId, phone, plebisciteId, 0, expiresAt.toISOString(), 'phone');
  
  return sessionId;
}
