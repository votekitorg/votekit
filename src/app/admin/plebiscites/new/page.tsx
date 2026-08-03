import { redirect } from 'next/navigation';
import { canManageElections, getAdminSessionFromCookies } from '@/lib/auth';
import CreatePlebisciteForm from './CreatePlebisciteForm';
import db from '@/lib/db';

export const dynamic = 'force-dynamic';

export default async function CreatePlebiscitePage({ searchParams }: { searchParams: Promise<{ draft?: string }> }) {
  const adminSession = await getAdminSessionFromCookies();
  if (!adminSession) {
    redirect('/admin/login');
  }

  if (!canManageElections(adminSession.role)) {
    redirect('/admin');
  }

  const { draft: draftParam } = await searchParams;
  const draftId = Number(draftParam);
  const row = Number.isInteger(draftId) && draftId > 0
    ? db.prepare(`
        SELECT id, payload_json, current_step, proof_token, revision
        FROM election_setup_drafts
        WHERE id = ? AND created_by_admin_user_id = ?
      `).get(draftId, adminSession.adminUserId) as any
    : null;
  let initialDraft = null;
  if (row) {
    try {
      initialDraft = {
        id: row.id,
        payload: JSON.parse(row.payload_json),
        currentStep: row.current_step,
        proofToken: row.proof_token,
        revision: row.revision
      };
    } catch {
      initialDraft = null;
    }
  }

  return <CreatePlebisciteForm currentUser={adminSession} initialDraft={initialDraft} />;
}
