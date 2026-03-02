import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  const maskedLocal = local.length <= 2 
    ? local[0] + '***' 
    : local[0] + '***' + local[local.length - 1];
  return maskedLocal + '@' + domain;
}

function maskPhone(phone: string): string {
  if (phone.length <= 6) return '***';
  return phone.slice(0, 4) + '***' + phone.slice(-3);
}

export async function POST(request: NextRequest) {
  try {
    const { receiptCode } = await request.json();

    if (!receiptCode || typeof receiptCode !== 'string') {
      return NextResponse.json({ error: 'Receipt code is required' }, { status: 400 });
    }

    const trimmed = receiptCode.trim();

    // Find the vote by receipt code
    const vote = db.prepare('SELECT id, question_id, created_at FROM votes WHERE receipt_code = ?').get(trimmed) as any;

    if (!vote) {
      return NextResponse.json({ found: false });
    }

    // Get the question and election
    const question = db.prepare('SELECT plebiscite_id FROM questions WHERE id = ?').get(vote.question_id) as any;
    if (!question) {
      return NextResponse.json({ found: false });
    }

    const election = db.prepare('SELECT title FROM plebiscites WHERE id = ?').get(question.plebiscite_id) as any;

    // Find the participation record that contains this receipt code
    const participations = db.prepare(
      'SELECT p.voted_at, p.verification_method, p.voter_roll_id, p.receipt_codes FROM participation WHERE p.plebiscite_id = ?'
        .replace('p.voted_at', 'voted_at')
        .replace('p.verification_method', 'verification_method')  
        .replace('p.voter_roll_id', 'voter_roll_id')
        .replace('p.receipt_codes', 'receipt_codes')
        .replace('p.plebiscite_id', 'plebiscite_id')
    ).all(question.plebiscite_id) as any[];

    let voterInfo = { votedAt: vote.created_at, identifier: 'Unknown', verificationMethod: 'ballot link' };

    for (const p of participations) {
      try {
        const codes = JSON.parse(p.receipt_codes);
        if (Array.isArray(codes) && codes.includes(trimmed)) {
          // Found the voter
          const voter = db.prepare('SELECT email, phone FROM voter_roll WHERE id = ?').get(p.voter_roll_id) as any;
          if (voter) {
            let identifier = '';
            if (voter.email) identifier = maskEmail(voter.email);
            if (voter.phone) {
              if (identifier) identifier += ' / ';
              identifier += maskPhone(voter.phone);
            }
            voterInfo = {
              votedAt: p.voted_at,
              identifier: identifier || 'Anonymous',
              verificationMethod: p.verification_method || 'ballot link'
            };
          }
          break;
        }
      } catch (e) {
        // skip malformed receipt_codes
      }
    }

    // Format the timestamp
    const votedDate = new Date(voterInfo.votedAt);
    const formattedDate = votedDate.toLocaleDateString('en-AU', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Australia/Brisbane'
    });

    return NextResponse.json({
      found: true,
      election: election?.title || 'Unknown Election',
      votedAt: formattedDate,
      identifier: voterInfo.identifier,
      verificationMethod: voterInfo.verificationMethod,
    });

  } catch (error) {
    console.error('Verify error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
