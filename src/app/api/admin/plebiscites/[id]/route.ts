import { NextRequest, NextResponse } from 'next/server';
import { getAdminSessionFromRequest } from '@/lib/auth';
import db from '@/lib/db';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const adminSession = getAdminSessionFromRequest(request);
  if (!adminSession) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const plebiscite = db.prepare('SELECT * FROM plebiscites WHERE id = ?').get(params.id) as any;
    if (!plebiscite) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const questions = db.prepare(
      'SELECT * FROM questions WHERE plebiscite_id = ? ORDER BY display_order'
    ).all(params.id).map((q: any) => ({
      ...q,
      options: JSON.parse(q.options),
    }));

    return NextResponse.json({ plebiscite, questions });
  } catch (error) {
    console.error('Failed to fetch plebiscite:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
