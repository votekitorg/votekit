import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, phone, plebisciteSlug } = body;

    if ((!email && !phone) || !plebisciteSlug) {
      return NextResponse.json(
        { error: 'Email or phone and plebiscite slug are required' },
        { status: 400 }
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

    let voter: any = null;

    if (email) {
      const normalizedEmail = email.trim().toLowerCase();
      voter = db.prepare(
        'SELECT id, email, phone FROM voter_roll WHERE email = ? AND plebiscite_id = ?'
      ).get(normalizedEmail, plebiscite.id);
    }

    if (!voter && phone) {
      const normalizedPhone = normalizePhone(phone);
      voter = db.prepare(
        'SELECT id, email, phone FROM voter_roll WHERE phone = ? AND plebiscite_id = ?'
      ).get(normalizedPhone, plebiscite.id);
      
      if (!voter) {
        voter = db.prepare(
          'SELECT id, email, phone FROM voter_roll WHERE phone = ? AND plebiscite_id = ?'
        ).get(phone, plebiscite.id);
      }
    }

    if (!voter) {
      return NextResponse.json(
        { error: 'Not found in this election\'s voter roll' },
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

    const hasEmail = !!voter.email;
    const hasPhone = !!voter.phone;
    const smsEnabled = !!plebiscite.sms_enabled;

    return NextResponse.json({
      success: true,
      voterId: voter.id,
      hasEmail,
      hasPhone,
      smsEnabled,
      availableMethods: [
        ...(hasEmail ? ['email'] : []),
        ...(hasPhone && smsEnabled ? ['sms'] : [])
      ],
      maskedEmail: hasEmail ? maskEmail(voter.email) : null,
      maskedPhone: hasPhone ? maskPhone(voter.phone) : null
    });

  } catch (error) {
    console.error('Voter lookup error:', error);
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

function maskEmail(email: string): string {
  const parts = email.split('@');
  const local = parts[0];
  const domain = parts[1];
  if (local.length <= 2) {
    return local[0] + '***@' + domain;
  }
  return local[0] + local[1] + '***@' + domain;
}

function maskPhone(phone: string): string {
  if (phone.length < 6) return '***' + phone.slice(-2);
  return phone.slice(0, 4) + '****' + phone.slice(-2);
}
