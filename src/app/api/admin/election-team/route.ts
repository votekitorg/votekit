import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import {
  canAccessElection,
  canManageElectionTeam,
  getAdminSessionFromRequest,
  listElectionTeam,
  recordAdminAuditLog,
  validateCSRFRequest,
  type ElectionRole
} from '@/lib/auth';

const ROLES = new Set<ElectionRole>(['returning_officer', 'admin', 'observer']);

export async function GET(request: NextRequest) {
  const session = getAdminSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const id = Number(new URL(request.url).searchParams.get('plebiscite_id'));
  if (!id || !canAccessElection(session, id)) return NextResponse.json({ error: 'Election not found' }, { status: 404 });

  const returningOfficers = session.role === 'owner' || canManageElectionTeam(session, id)
    ? db.prepare(`SELECT id, email, name FROM admin_users
        WHERE active = 1 AND authority_role = 'returning_officer' ORDER BY email`).all()
    : [];
  return NextResponse.json({
    members: listElectionTeam(id),
    returningOfficers,
    canManage: canManageElectionTeam(session, id)
  });
}

export async function PUT(request: NextRequest) {
  if (!validateCSRFRequest(request)) return NextResponse.json({ error: 'Invalid request' }, { status: 403 });
  const session = getAdminSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await request.json();
    const plebisciteId = Number(body.plebisciteId);
    const userId = Number(body.userId);
    const role = body.role as ElectionRole;
    if (!plebisciteId || !userId || !ROLES.has(role)) throw new Error('Election, person and role are required');
    if (!canManageElectionTeam(session, plebisciteId)) throw new Error('Only an election Returning Officer or Owner can manage this team');
    if (userId === session.adminUserId && session.role !== 'owner' && role !== 'returning_officer') {
      throw new Error('Ask the Owner or another Returning Officer to change your election role');
    }

    const user = db.prepare('SELECT id, authority_role, active FROM admin_users WHERE id = ?').get(userId) as any;
    if (!user?.active) throw new Error('That account is not active');
    if (role === 'returning_officer' && user.authority_role !== 'returning_officer') {
      throw new Error('Only an organisation Returning Officer can hold that election role');
    }
    const currentMembership = db.prepare('SELECT role FROM election_team_members WHERE plebiscite_id = ? AND admin_user_id = ?')
      .get(plebisciteId, userId);
    if (!currentMembership && role !== 'returning_officer') {
      throw new Error('Use an election invitation to add a new Admin or Observer');
    }
    db.prepare(`INSERT INTO election_team_members
      (plebiscite_id, admin_user_id, role, assigned_by_admin_user_id)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(plebiscite_id, admin_user_id) DO UPDATE SET
        role = excluded.role, assigned_by_admin_user_id = excluded.assigned_by_admin_user_id,
        updated_at = CURRENT_TIMESTAMP
    `).run(plebisciteId, userId, role, session.adminUserId);
    recordAdminAuditLog({ adminUserId: session.adminUserId, action: 'election_team.assign', targetType: 'plebiscite', targetId: plebisciteId, details: { userId, role } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Could not update election team' }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  if (!validateCSRFRequest(request)) return NextResponse.json({ error: 'Invalid request' }, { status: 403 });
  const session = getAdminSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await request.json();
    const plebisciteId = Number(body.plebisciteId);
    const userId = Number(body.userId);
    if (!plebisciteId || !userId || !canManageElectionTeam(session, plebisciteId)) throw new Error('You cannot remove this election assignment');
    if (userId === session.adminUserId && session.role !== 'owner') throw new Error('Ask the Owner or another Returning Officer to remove your access');
    const result = db.prepare('DELETE FROM election_team_members WHERE plebiscite_id = ? AND admin_user_id = ?').run(plebisciteId, userId);
    if (!result.changes) throw new Error('Election assignment not found');
    recordAdminAuditLog({ adminUserId: session.adminUserId, action: 'election_team.remove', targetType: 'plebiscite', targetId: plebisciteId, details: { userId } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Could not remove election assignment' }, { status: 400 });
  }
}
