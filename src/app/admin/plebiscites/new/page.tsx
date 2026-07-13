import { redirect } from 'next/navigation';
import { getAdminSessionFromCookies } from '@/lib/auth';
import CreatePlebisciteForm from './CreatePlebisciteForm';

export const dynamic = 'force-dynamic';

export default async function CreatePlebiscitePage() {
  const adminSession = await getAdminSessionFromCookies();
  if (!adminSession) {
    redirect('/admin/login');
  }

  if (adminSession.role !== 'admin') {
    redirect('/admin');
  }

  return <CreatePlebisciteForm currentUser={adminSession} />;
}
