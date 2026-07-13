import { redirect } from 'next/navigation';
import AdminLayout from '@/components/AdminLayout';
import { getAdminSessionFromCookies, listAdminUsers } from '@/lib/auth';
import AdminUsersManager from './AdminUsersManager';

export const dynamic = 'force-dynamic';

export default async function AdminUsersPage() {
  const adminSession = await getAdminSessionFromCookies();
  if (!adminSession) {
    redirect('/admin/login');
  }

  if (adminSession.role !== 'admin') {
    redirect('/admin');
  }

  const users = listAdminUsers();

  return (
    <AdminLayout currentUser={adminSession}>
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Admin Users</h1>
          <p className="text-gray-600">Manage who can administer or observe elections.</p>
        </div>

        <AdminUsersManager users={users} />
      </div>
    </AdminLayout>
  );
}
