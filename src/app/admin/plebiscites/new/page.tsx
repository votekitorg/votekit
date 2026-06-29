import { redirect } from 'next/navigation';
import { getAdminSessionFromCookies } from '@/lib/auth';
import CreatePlebisciteForm from './CreatePlebisciteForm';

export const dynamic = 'force-dynamic';

export default function CreatePlebiscitePage() {
  const adminSession = getAdminSessionFromCookies();
  if (!adminSession) {
    redirect('/admin/login');
  }

  if (adminSession.role !== 'admin') {
    redirect('/admin');
  }

  return <CreatePlebisciteForm currentUser={adminSession} />;
}
