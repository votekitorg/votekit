import { redirect } from 'next/navigation';
import { canManageElections, getAdminSessionFromCookies } from '@/lib/auth';
import CreatePlebisciteForm from './CreatePlebisciteForm';

export const dynamic = 'force-dynamic';

export default async function CreatePlebiscitePage() {
  const adminSession = await getAdminSessionFromCookies();
  if (!adminSession) {
    redirect('/admin/login');
  }

  if (!canManageElections(adminSession.role)) {
    redirect('/admin');
  }

  return <CreatePlebisciteForm currentUser={adminSession} />;
}
