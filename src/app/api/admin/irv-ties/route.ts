import { NextRequest, NextResponse } from 'next/server';
import { canManageElection, getAdminSessionFromRequest, recordAdminAuditLog, validateCSRFRequest } from '@/lib/auth';
import db from '@/lib/db';
import { getPlebisciteResults } from '@/lib/results';

const METHODS = new Set(['drawing_lots', 'governing_rules']);

export async function POST(request: NextRequest) {
  if (!validateCSRFRequest(request)) return NextResponse.json({ error: 'Invalid request' }, { status: 403 });
  const session = getAdminSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['owner', 'returning_officer'].includes(session.role)) {
    return NextResponse.json({ error: 'Only an Owner or Returning Officer can resolve a counting tie' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const questionId = Number(body.questionId);
    const round = Number(body.round);
    const type = body.type;
    const selectedCandidate = typeof body.selectedCandidate === 'string' ? body.selectedCandidate : '';
    const method = body.method;
    const note = typeof body.note === 'string' ? body.note.trim() : '';
    if (!questionId || !Number.isInteger(round) || round < 1 || !['exclusion', 'winner'].includes(type) ||
      !METHODS.has(method) || !selectedCandidate || note.length > 2_000) {
      return NextResponse.json({ error: 'Invalid tie-resolution details' }, { status: 400 });
    }
    if (method === 'governing_rules' && !note) {
      return NextResponse.json({ error: 'Explain the governing rule used for this decision' }, { status: 400 });
    }

    const question = db.prepare(`
      SELECT q.id, q.type, p.id AS plebiscite_id, p.slug, p.status
      FROM questions q JOIN plebiscites p ON p.id = q.plebiscite_id
      WHERE q.id = ?
    `).get(questionId) as any;
    if (!question || question.type !== 'ranked_choice') {
      return NextResponse.json({ error: 'Ranked-choice question not found' }, { status: 404 });
    }
    if (!canManageElection(session, Number(question.plebiscite_id))) {
      return NextResponse.json({ error: 'You do not have permission to manage this election' }, { status: 403 });
    }
    if (question.status !== 'closed') {
      return NextResponse.json({ error: 'Counting ties can only be resolved after voting closes' }, { status: 409 });
    }

    const data = getPlebisciteResults(question.slug);
    const resultQuestion = data.questions.find(item => item.id === questionId);
    const pending = resultQuestion?.results?.pendingTie;
    if (!pending || pending.round !== round || pending.type !== type) {
      return NextResponse.json({ error: 'This is no longer the current unresolved tie' }, { status: 409 });
    }
    if (!pending.tiedCandidates.includes(selectedCandidate)) {
      return NextResponse.json({ error: 'Choose one of the tied options' }, { status: 400 });
    }

    const resolve = db.transaction(() => {
      db.prepare(`
        INSERT INTO irv_tie_resolutions
          (question_id, round_number, resolution_type, tied_candidates, selected_candidate, method, note, resolved_by_admin_user_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(questionId, round, type, JSON.stringify([...pending.tiedCandidates].sort()), selectedCandidate, method, note || null, session.adminUserId);
      recordAdminAuditLog({
        adminUserId: session.adminUserId,
        action: 'irv.tie.resolve',
        targetType: 'question',
        targetId: questionId,
        details: {
          plebisciteId: question.plebiscite_id,
          round,
          type,
          tiedCandidates: pending.tiedCandidates,
          selectedCandidate,
          method,
          note: note || null
        }
      });
    });
    resolve.immediate();

    const updated = getPlebisciteResults(question.slug).questions.find(item => item.id === questionId)?.results;
    return NextResponse.json({ success: true, winner: updated?.winner || null, pendingTie: updated?.pendingTie || null });
  } catch (error: any) {
    if (String(error?.message || '').includes('UNIQUE constraint failed')) {
      return NextResponse.json({ error: 'This tie has already been resolved' }, { status: 409 });
    }
    console.error('IRV tie resolution failed:', error);
    return NextResponse.json({ error: 'Could not record the tie resolution' }, { status: 500 });
  }
}
