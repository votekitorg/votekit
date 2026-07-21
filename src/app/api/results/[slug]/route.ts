import { NextRequest, NextResponse } from 'next/server';
import {
  buildResultsCsv,
  getPlebisciteResults,
  ResultsUnavailableError,
  resultsCsvFilename
} from '@/lib/results';
import db from '@/lib/db';
import { isReceipt } from '@/lib/encrypted-ballots';
import { buildResultsPdf, resultsReportFilename } from '@/lib/results-report';
import { canViewResultsFromRequest, getResultsAccessElection } from '@/lib/results-access';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const election = getResultsAccessElection(slug);
    if (!election || !canViewResultsFromRequest(request, election)) {
      return NextResponse.json({ error: 'Results access required' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
    }
    const url = new URL(request.url);
    const format = url.searchParams.get('format'); // 'csv' for CSV export
    const results = getPlebisciteResults(slug);

    if (format === 'csv') {
      return new NextResponse(buildResultsCsv(slug, results), {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="${resultsCsvFilename(slug)}"`,
          'Cache-Control': 'private, no-store'
        }
      });
    }

    if (format === 'pdf') {
      const pdf = await buildResultsPdf(results);
      return new NextResponse(new Uint8Array(pdf), {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${resultsReportFilename(slug)}"`,
          'Content-Length': String(pdf.length),
          'Cache-Control': 'private, no-store'
        }
      });
    }

    return NextResponse.json(results, { headers: { 'Cache-Control': 'private, no-store' } });
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
    const accessElection = getResultsAccessElection(slug);
    if (!accessElection || !canViewResultsFromRequest(request, accessElection)) {
      return NextResponse.json({ error: 'Results access required' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
    }
    const body = await request.json();
    if (!isReceipt(body?.receipt) && !(typeof body?.receipt === 'string' && /^[a-f0-9]{32}$/iu.test(body.receipt))) {
      return NextResponse.json({ error: 'Receipt not found' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
    }
    const election = db.prepare(`
      SELECT id, status, privacy_mode FROM plebiscites WHERE slug = ?
    `).get(slug) as any;
    if (!election || election.status !== 'closed') {
      return NextResponse.json({ error: 'Receipt not found' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
    }
    if (election.privacy_mode === 'encrypted') {
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
    }

    const legacyBallot = db.prepare(`
      SELECT q.title, v.vote_data FROM votes v
      JOIN questions q ON q.id = v.question_id
      WHERE q.plebiscite_id = ? AND v.receipt_code = ?
    `).get(election.id, body.receipt) as { title: string; vote_data: string } | undefined;
    if (!legacyBallot) return NextResponse.json({ error: 'Receipt not found' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
    const value = JSON.parse(legacyBallot.vote_data);
    return NextResponse.json({
      found: true,
      ballot: [{ title: legacyBallot.title, answer: value.choice ?? value.choices ?? value.preferences }]
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Receipt not found' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  }
}
