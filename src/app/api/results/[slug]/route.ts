import { NextRequest, NextResponse } from 'next/server';
import {
  buildResultsCsv,
  getPlebisciteResults,
  ResultsUnavailableError,
  resultsCsvFilename
} from '@/lib/results';
import db from '@/lib/db';
import { isReceipt } from '@/lib/encrypted-ballots';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const url = new URL(request.url);
    const format = url.searchParams.get('format'); // 'csv' for CSV export
    const results = getPlebisciteResults(slug);

    if (format === 'csv') {
      return new NextResponse(buildResultsCsv(slug, results), {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="${resultsCsvFilename(slug)}"`
        }
      });
    }

    return NextResponse.json(results);
  } catch (error) {
    if (error instanceof ResultsUnavailableError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }

    console.error('Results API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const body = await request.json();
    if (!isReceipt(body?.receipt)) {
      return NextResponse.json({ error: 'Receipt not found' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
    }
    const election = db.prepare(`
      SELECT id, status, privacy_mode FROM plebiscites WHERE slug = ?
    `).get(slug) as any;
    if (!election || election.status !== 'closed' || election.privacy_mode !== 'encrypted') {
      return NextResponse.json({ error: 'Receipt not found' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
    }
    const ballot = db.prepare(`
      SELECT ballot_data FROM published_ballots WHERE plebiscite_id = ? AND receipt_code = ?
    `).get(election.id, body.receipt) as { ballot_data: string } | undefined;
    if (!ballot) return NextResponse.json({ error: 'Receipt not found' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
    const questions = db.prepare(`
      SELECT public_id, title FROM questions WHERE plebiscite_id = ? ORDER BY display_order
    `).all(election.id) as Array<{ public_id: string; title: string }>;
    const answers = JSON.parse(ballot.ballot_data);
    return NextResponse.json({
      found: true,
      ballot: questions.map(question => ({ title: question.title, answer: answers[question.public_id] }))
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Receipt not found' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  }
}
