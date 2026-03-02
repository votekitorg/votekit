import { NextRequest, NextResponse } from 'next/server';
import { createVoterSession, setVoterCookie } from '@/lib/auth';
import db, { getVoterByToken, hasVoterVoted } from '@/lib/db';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

interface Plebiscite {
  id: number;
  slug: string;
  title: string;
  status: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { token, plebisciteSlug } = body;

    if (!token || !plebisciteSlug) {
      return NextResponse.json({ error: 'Token and plebiscite slug are required' }, { status: 400 });
    }

    // Look up the voter by token
    const voterData = getVoterByToken(token);
    
    if (!voterData) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 400 });
    }

    // Get the plebiscite
    const plebiscite = db.prepare('SELECT * FROM plebiscites WHERE slug = ?').get(plebisciteSlug) as Plebiscite | undefined;

    if (!plebiscite) {
      return NextResponse.json({ error: 'Election not found' }, { status: 404 });
    }

    // Verify the token matches the plebiscite
    if (voterData.plebisciteId !== plebiscite.id) {
      return NextResponse.json({ error: 'Token does not match this election' }, { status: 400 });
    }

    // Check election status
    if (plebiscite.status === 'closed') {
      return NextResponse.json({ 
        error: 'Election is closed',
        redirectTo: `/results/${plebiscite.slug}`,
        status: 'closed'
      }, { status: 400 });
    }

    if (plebiscite.status === 'draft') {
      return NextResponse.json({ error: 'Election has not opened yet' }, { status: 400 });
    }

    // Check if voter has already voted
    if (hasVoterVoted(voterData.voterRollId, plebiscite.id)) {
      return NextResponse.json({ 
        error: 'You have already voted in this election',
        alreadyVoted: true,
        status: plebiscite.status
      }, { status: 400 });
    }

    // Create voter session
    const sessionId = createVoterSession(voterData.email, plebiscite.id, 'email');
    
    // Set the session cookie
    const cookieStore = cookies();
    cookieStore.set(`voter-session-${plebisciteSlug}`, sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 2 * 60 * 60 // 2 hours
    });

    return NextResponse.json({
      success: true,
      message: 'Token validated successfully',
      email: voterData.email
    });

  } catch (error) {
    console.error('Token validation error:', error);
    return NextResponse.json(
      { error: 'Failed to validate token' },
      { status: 500 }
    );
  }
}
