import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    const plebiscite = db.prepare(`
      SELECT id, slug, title, description, info_url, open_date, close_date, status, sms_enabled
      FROM plebiscites 
      WHERE slug = ?
    `).get(params.slug) as any;

    if (!plebiscite) {
      return NextResponse.json(
        { error: 'Election not found' },
        { status: 404 }
      );
    }

    const questions = db.prepare(`
      SELECT id, title, description, type, options, display_order, preferential_type
      FROM questions 
      WHERE plebiscite_id = ?
      ORDER BY display_order
    `).all(plebiscite.id);

    return NextResponse.json({
      plebiscite: {
        ...plebiscite,
        sms_enabled: !!plebiscite.sms_enabled
      },
      questions
    });
  } catch (error) {
    console.error('Failed to fetch election:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
