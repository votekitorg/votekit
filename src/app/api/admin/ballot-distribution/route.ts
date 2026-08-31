import { NextRequest, NextResponse } from 'next/server';
import { canManageElection, getAdminSessionFromRequest, recordAdminAuditLog, validateCSRFRequest } from '@/lib/auth';
import { countElectionCredentials, getBallotDistributionSummary } from '@/lib/ballot-distribution';
import db from '@/lib/db';

const MAX_REASON_LENGTH = 500;

export async function POST(request: NextRequest) {
  if (!validateCSRFRequest(request)) return NextResponse.json({ error: 'Invalid request' }, { status: 403 });
  const session = getAdminSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json();
    const plebisciteId = Number(body?.plebisciteId);
    const ballotsDistributed = Number(body?.ballotsDistributed);
    const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';
    if (!Number.isSafeInteger(plebisciteId) || plebisciteId <= 0 ||
      !Number.isSafeInteger(ballotsDistributed) || ballotsDistributed < 0) {
      return NextResponse.json({ error: 'Enter a valid whole number of ballots distributed' }, { status: 400 });
    }
    if (!reason || reason.length > MAX_REASON_LENGTH) {
      return NextResponse.json({ error: `A reason of up to ${MAX_REASON_LENGTH} characters is required` }, { status: 400 });
    }
    if (!canManageElection(session, plebisciteId)) {
      return NextResponse.json({ error: 'You do not have permission to manage this election' }, { status: 403 });
    }
    const election = db.prepare('SELECT id, access_mode, archived_at FROM plebiscites WHERE id = ?')
      .get(plebisciteId) as { id: number; access_mode: string; archived_at: string | null } | undefined;
    if (!election) return NextResponse.json({ error: 'Election not found' }, { status: 404 });
    if (election.archived_at) return NextResponse.json({ error: 'Restore this election before updating its distribution record' }, { status: 409 });

    const summary = getBallotDistributionSummary(plebisciteId, election.access_mode);
    const generatedCredentials = countElectionCredentials(plebisciteId, election.access_mode);
    if (ballotsDistributed < summary.totalVotes) {
      return NextResponse.json({ error: `Ballots distributed cannot be lower than the ${summary.totalVotes} ballots already cast` }, { status: 409 });
    }
    if (ballotsDistributed > generatedCredentials) {
      return NextResponse.json({ error: `Ballots distributed cannot exceed the ${generatedCredentials} voting credentials generated` }, { status: 409 });
    }
    if (ballotsDistributed === summary.ballotsDistributed) {
      return NextResponse.json({ error: 'Enter a different number of ballots distributed' }, { status: 409 });
    }

    const adjustmentId = db.transaction(() => {
      const insert = db.prepare(`
        INSERT INTO ballot_distribution_adjustments
          (plebiscite_id, ballots_distributed, previous_ballots_distributed,
           generated_credentials, reason, adjusted_by_admin_user_id)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(plebisciteId, ballotsDistributed, summary.ballotsDistributed, generatedCredentials, reason, session.adminUserId);
      recordAdminAuditLog({
        adminUserId: session.adminUserId,
        action: 'ballot_distribution.adjust',
        targetType: 'plebiscite',
        targetId: plebisciteId,
        details: {
          adjustmentId: Number(insert.lastInsertRowid),
          previousBallotsDistributed: summary.ballotsDistributed,
          ballotsDistributed,
          generatedCredentials,
          reason
        }
      });
      return Number(insert.lastInsertRowid);
    })();

    return NextResponse.json({ success: true, adjustmentId });
  } catch (error) {
    console.error('Ballot distribution adjustment failed:', error);
    return NextResponse.json({ error: 'Could not update ballots distributed' }, { status: 500 });
  }
}
