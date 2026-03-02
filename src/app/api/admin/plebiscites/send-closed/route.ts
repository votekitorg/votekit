import { NextRequest, NextResponse } from 'next/server';
import { getAdminSessionFromRequest } from '@/lib/auth';
import db from '@/lib/db';
import { sendElectionClosedEmail } from '@/lib/email';

export async function POST(request: NextRequest) {
  const adminSession = getAdminSessionFromRequest(request);
  if (!adminSession) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { plebisciteId } = await request.json();

    if (!plebisciteId) {
      return NextResponse.json({ error: 'Election ID is required' }, { status: 400 });
    }

    const plebiscite = db.prepare('SELECT * FROM plebiscites WHERE id = ?').get(plebisciteId) as any;
    if (!plebiscite) {
      return NextResponse.json({ error: 'Election not found' }, { status: 404 });
    }

    if (plebiscite.status !== 'closed') {
      return NextResponse.json({ error: 'Election is not closed' }, { status: 400 });
    }

    // Get all voters who participated (have a participation record) and have an email
    const voters = db.prepare(`
      SELECT vr.email 
      FROM participation p
      JOIN voter_roll vr ON vr.id = p.voter_roll_id
      WHERE p.plebiscite_id = ? AND vr.email IS NOT NULL AND vr.email != ''
    `).all(plebisciteId) as any[];

    const baseUrl = process.env.BASE_URL || 'https://votekit.org';
    const resultsUrl = `${baseUrl}/results/${plebiscite.slug}`;
    const verifyUrl = `${baseUrl}/verify`;

    let sentCount = 0;
    let failedCount = 0;
    const errors: string[] = [];

    for (const voter of voters) {
      try {
        const result = await sendElectionClosedEmail(
          voter.email,
          plebiscite.title,
          resultsUrl,
          verifyUrl
        );
        if (result.success) {
          sentCount++;
        } else {
          failedCount++;
          errors.push(`${voter.email}: ${result.error}`);
        }
      } catch (err: any) {
        failedCount++;
        errors.push(`${voter.email}: ${err.message}`);
      }
    }

    return NextResponse.json({
      success: true,
      message: `Results notifications sent`,
      totalVoters: voters.length,
      sentCount,
      failedCount,
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (error) {
    console.error('Failed to send closed notifications:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
