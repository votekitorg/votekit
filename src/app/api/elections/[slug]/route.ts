import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { votingClosedError } from '@/lib/election-window';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;

    const plebiscite = db.prepare('SELECT * FROM plebiscites WHERE slug = ?').get(slug) as any;
    
    if (!plebiscite) {
      return NextResponse.json(
        { error: 'Election not found' },
        { status: 404 }
      );
    }

    // Draft elections are not publicly visible; respond exactly like a
    // missing election so guessed slugs reveal nothing.
    if (plebiscite.status === 'draft') {
      return NextResponse.json(
        { error: 'Election not found' },
        { status: 404 }
      );
    }

    const questions = db.prepare(
      'SELECT * FROM questions WHERE plebiscite_id = ? ORDER BY display_order'
    ).all(plebiscite.id) as any[];

    const formattedQuestions = questions.map(q => ({
      id: q.id,
      title: q.title,
      description: q.description,
      type: q.type,
      options: q.options,
      preferentialType: q.preferential_type || 'compulsory'
    }));

    return NextResponse.json({
      plebiscite: {
        id: plebiscite.id,
        slug: plebiscite.slug,
        title: plebiscite.title,
        description: plebiscite.description,
        info_url: plebiscite.info_url,
        open_date: plebiscite.open_date,
        close_date: plebiscite.close_date,
        status: plebiscite.status,
        voting_available: plebiscite.status === 'open' && !votingClosedError(plebiscite)
      },
      questions: formattedQuestions
    });
  } catch (error) {
    console.error('Election fetch error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
