import { redirect } from 'next/navigation';
import AdminLayout from '@/components/AdminLayout';
import { canManageUsers, getAdminSessionFromCookies, listAdminUsers, listPendingAdminInvitations } from '@/lib/auth';
import AdminUsersManager from './AdminUsersManager';

export const dynamic = 'force-dynamic';

export default async function AdminUsersPage() {
  const adminSession = await getAdminSessionFromCookies();
  if (!adminSession) {
    redirect('/admin/login');
  }

  if (!canManageUsers(adminSession.role)) {
    redirect('/admin');
  }

  const users = listAdminUsers();
  const invitations = listPendingAdminInvitations(adminSession);

  return (
    <AdminLayout currentUser={adminSession}>
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">People & Roles</h1>
          <p className="text-gray-600">Invite people and delegate election authority safely.</p>
        </div>

        <AdminUsersManager users={users} invitations={invitations} currentUser={adminSession} />
      </div>
    </AdminLayout>
  );
}
