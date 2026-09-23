import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { canManageElection, getAdminSessionFromRequest, recordAdminAuditLog, validateCSRFRequest } from '@/lib/auth';
import { parseElectionCloseDate } from '@/lib/election-window';
import { listDeadlineExtensions } from '@/lib/deadline-extensions';

export async function POST(request: NextRequest) {
  if (!validateCSRFRequest(request)) return NextResponse.json({ error: 'Invalid request' }, { status: 403 });
  const session = getAdminSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const { plebisciteId, previousDeadline, newDeadline, reason } = await request.json();
    if (!Number.isSafeInteger(plebisciteId) || !canManageElection(session, plebisciteId)) return NextResponse.json({ error: 'Not permitted' }, { status: 403 });
    if (typeof newDeadline !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(newDeadline) ||
        typeof reason !== 'string' || !reason.trim() || reason.length > 2000 || typeof previousDeadline !== 'string') {
      return NextResponse.json({ error: 'A valid Brisbane deadline and reason are required' }, { status: 400 });
    }
    const proposed = parseElectionCloseDate(newDeadline);
    // Reject silently normalised dates such as 30 February.
    if (!Number.isFinite(proposed.getTime()) || new Date(proposed.getTime() + 36000000).toISOString().slice(0, 16) !== newDeadline) {
      return NextResponse.json({ error: 'Invalid deadline' }, { status: 400 });
    }
    const outcome = db.transaction(() => {
      const election = db.prepare('SELECT * FROM plebiscites WHERE id = ?').get(plebisciteId) as any;
      if (!election || election.status !== 'open' || election.close_state !== 'none' || election.archived_at) return 'Only an open, unfinalised election can be extended';
      if (election.close_date !== previousDeadline) return 'The deadline changed. Reload before extending it';
      if (proposed <= new Date() || proposed <= parseElectionCloseDate(election.close_date)) return 'The new deadline must be in the future and later than the current deadline';
      db.prepare(`UPDATE plebiscites SET manifest_close_date = COALESCE(manifest_close_date, close_date), close_date = ? WHERE id = ?`).run(newDeadline, plebisciteId);
      db.prepare(`INSERT INTO election_deadline_extensions (plebiscite_id, previous_deadline, new_deadline, reason, administrator_id, administrator_name)
        VALUES (?, ?, ?, ?, ?, ?)`).run(plebisciteId, previousDeadline, newDeadline, reason.trim(), session.adminUserId, session.name || 'Election administrator');
      recordAdminAuditLog({ adminUserId: session.adminUserId, action: 'election.deadline_extended', targetType: 'plebiscite', targetId: plebisciteId,
        details: { previousDeadline, newDeadline, reason: reason.trim() } });
      return null;
    }).immediate();
    if (outcome) return NextResponse.json({ error: outcome }, { status: 409 });
    return NextResponse.json({ success: true, extensions: listDeadlineExtensions(plebisciteId) });
  } catch {
    return NextResponse.json({ error: 'Could not extend the election deadline' }, { status: 400 });
  }
}
