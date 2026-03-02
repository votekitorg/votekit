import { NextRequest, NextResponse } from 'next/server';
import { getAdminSessionFromRequest } from '@/lib/auth';
import { sendReminderEmail } from '@/lib/email';
import db, { getVotersWhoHaventVoted, getOrCreateVoterToken } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface Plebiscite {
  id: number;
  slug: string;
  title: string;
  description: string;
  status: string;
  close_date: string;
}

export async function POST(request: NextRequest) {
  // Check admin authentication
  const adminSession = getAdminSessionFromRequest(request);
  if (!adminSession) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { plebisciteId } = body;

    if (!plebisciteId) {
      return NextResponse.json({ error: 'Plebiscite ID is required' }, { status: 400 });
    }

    // Get the plebiscite
    const plebiscite = db.prepare('SELECT * FROM plebiscites WHERE id = ?').get(plebisciteId) as Plebiscite | undefined;

    if (!plebiscite) {
      return NextResponse.json({ error: 'Election not found' }, { status: 404 });
    }

    if (plebiscite.status !== 'open') {
      return NextResponse.json({ error: 'Election must be open to send reminders' }, { status: 400 });
    }

    // Get voters who haven't voted yet
    const voters = getVotersWhoHaventVoted(plebisciteId);

    if (voters.length === 0) {
      return NextResponse.json({ 
        success: true, 
        message: 'All voters have already voted!',
        totalVoters: 0,
        sentCount: 0,
        failedCount: 0
      });
    }

    let sentCount = 0;
    let failedCount = 0;
    const errors: string[] = [];

    // Process voters in batches to avoid rate limits
    for (const voter of voters) {
      try {
        // Get or create token for this voter (reuse existing token)
        const token = getOrCreateVoterToken(voter.id, plebisciteId);
        const ballotUrl = `https://votekit.org/vote/${plebiscite.slug}?token=${token}`;

        const result = await sendReminderEmail(
          voter.email,
          plebiscite.title,
          plebiscite.description,
          ballotUrl,
          plebiscite.close_date
        );

        if (result.success) {
          sentCount++;
        } else {
          failedCount++;
          errors.push(`${voter.email}: ${result.error}`);
        }

        // Small delay between emails to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        failedCount++;
        errors.push(`${voter.email}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    return NextResponse.json({
      success: true,
      totalVoters: voters.length,
      sentCount,
      failedCount,
      errors: errors.slice(0, 10) // Only return first 10 errors
    });

  } catch (error) {
    console.error('Send reminders error:', error);
    return NextResponse.json(
      { error: 'Failed to send reminders' },
      { status: 500 }
    );
  }
}
