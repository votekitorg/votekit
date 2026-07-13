import { NextResponse } from 'next/server';
import db from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    db.prepare('SELECT 1').get();
    return NextResponse.json(
      {
        status: 'ok',
        release: process.env.VOTEKIT_RELEASE || 'unknown'
      },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  } catch (error) {
    console.error('Health check failed:', error);
    return NextResponse.json(
      { status: 'unavailable', release: process.env.VOTEKIT_RELEASE || 'unknown' },
      { status: 503, headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  }
}
