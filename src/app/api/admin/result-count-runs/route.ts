import { NextRequest, NextResponse } from 'next/server';
import { canManageElection, getAdminSessionFromRequest, recordAdminAuditLog, validateCSRFRequest } from '@/lib/auth';
import db from '@/lib/db';
import { createResultCountRun, type ResultCountMethod } from '@/lib/result-count-runs';

export async function POST(request: NextRequest) {
  if (!validateCSRFRequest(request)) return NextResponse.json({ error: 'Invalid request' }, { status: 403 });
  const session = getAdminSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['owner', 'returning_officer'].includes(session.role)) {
    return NextResponse.json({ error: 'Only an Owner or Returning Officer can create an alternative count' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const questionId = Number(body?.questionId);
    const method = body?.method as ResultCountMethod;
    if (!Number.isSafeInteger(questionId) || questionId <= 0 || !['irv', 'condorcet'].includes(method)) {
      return NextResponse.json({ error: 'Invalid count request' }, { status: 400 });
    }
    const question = db.prepare('SELECT plebiscite_id FROM questions WHERE id = ?').get(questionId) as { plebiscite_id: number } | undefined;
    if (!question) return NextResponse.json({ error: 'Question not found' }, { status: 404 });
    if (!canManageElection(session, Number(question.plebiscite_id))) {
      return NextResponse.json({ error: 'You do not have permission to manage this election' }, { status: 403 });
    }
    const run = createResultCountRun({ questionId, method, adminUserId: session.adminUserId });
    recordAdminAuditLog({
      adminUserId: session.adminUserId,
      action: 'result_count_run.create',
      targetType: 'result_count_run',
      targetId: run.id,
      details: {
        plebisciteId: run.plebisciteId,
        questionId: run.questionId,
        method: run.method,
        status: run.status,
        sourceBallotHash: run.sourceBallotHash,
        resultHash: run.resultHash
      }
    });
    return NextResponse.json({ success: true, run });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not create alternative count';
    if (/only be created|not found/u.test(message)) return NextResponse.json({ error: message }, { status: 409 });
    console.error('Alternative count creation failed:', error);
    return NextResponse.json({ error: 'Could not create alternative count' }, { status: 500 });
  }
}
