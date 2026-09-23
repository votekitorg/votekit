import { redirect } from 'next/navigation';
import { canManageElection, canManageElections, getAdminSessionFromCookies, listAccessibleElectionIds } from '@/lib/auth';
import AdminLayout from '@/components/AdminLayout';
import db from '@/lib/db';
import { reconcileScheduledElections } from '@/lib/election-opening';
import ElectionList, { type ElectionListEntry } from './ElectionList';

export const dynamic = 'force-dynamic';

export default async function AdminElections() {
  const session = await getAdminSessionFromCookies();
  if (!session) redirect('/admin/login');
  await reconcileScheduledElections();

  const accessibleIds = listAccessibleElectionIds(session);
  const fields = 'id, slug, title, status, open_date, close_date, close_state, created_at, archived_at';
  const elections = accessibleIds?.length === 0 ? [] : db.prepare(`
    SELECT ${fields} FROM plebiscites
    WHERE ${session.role === 'owner' ? '1 = 1' : `archived_at IS NULL AND id IN (${accessibleIds!.map(() => '?').join(',')})`}
    ORDER BY created_at DESC, id DESC
  `).all(...(accessibleIds || [])) as Array<{
    id: number; slug: string; title: string; status: 'draft' | 'open' | 'closed';
    open_date: string; close_date: string; close_state: string; created_at: string; archived_at: string | null;
  }>;

  const entries: ElectionListEntry[] = elections.map(election => ({
    key: `election-${election.id}`, kind: 'election', id: election.id,
    title: election.title, slug: election.slug, status: election.status,
    openDate: election.open_date, closeDate: election.close_date,
    closeState: election.close_state, updatedAt: election.created_at,
    archived: !!election.archived_at, canManage: canManageElection(session, election.id),
  }));

  if (canManageElections(session.role)) {
    const drafts = db.prepare(`
      SELECT d.id, d.title, d.current_step, d.proof_token, d.updated_at,
        d.created_by_admin_user_id, u.name AS creator_name, u.email AS creator_email
      FROM election_setup_drafts d JOIN admin_users u ON u.id = d.created_by_admin_user_id
      ${session.role === 'owner' ? '' : 'WHERE d.created_by_admin_user_id = ?'}
      ORDER BY d.updated_at DESC
    `).all(...(session.role === 'owner' ? [] : [session.adminUserId])) as Array<{
      id: number; title: string; current_step: number; proof_token: string; updated_at: string;
      created_by_admin_user_id: number; creator_name: string | null; creator_email: string;
    }>;
    entries.push(...drafts.map(draft => ({
      key: `draft-${draft.id}`, kind: 'setup' as const, id: draft.id, title: draft.title,
      updatedAt: draft.updated_at, archived: false, canManage: true,
      step: draft.current_step, proofToken: draft.proof_token,
      creator: draft.creator_name || draft.creator_email,
      ownDraft: draft.created_by_admin_user_id === session.adminUserId,
    })));
  }

  return <AdminLayout currentUser={session}>
    <ElectionList entries={entries} canCreate={canManageElections(session.role)}
      canViewArchive={session.role === 'owner'} initialNow={Date.now()} />
  </AdminLayout>;
}
