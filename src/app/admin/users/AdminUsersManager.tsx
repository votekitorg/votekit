'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { csrfFetch } from '@/lib/csrf-client';

type AdminRole = 'owner' | 'returning_officer' | 'admin' | 'observer';

interface AdminUser {
  id: number;
  email: string;
  name: string | null;
  role: AdminRole;
  active: boolean;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
}

interface AdminInvitation {
  id: number;
  email: string;
  name: string | null;
  role: Exclude<AdminRole, 'owner'>;
  expires_at: string;
  created_at: string;
  invited_by_name: string | null;
  invited_by_email: string;
}

const roleLabels: Record<AdminRole, string> = {
  owner: 'Owner',
  returning_officer: 'Returning Officer',
  admin: 'Admin',
  observer: 'Observer'
};

const roleDescriptions: Record<Exclude<AdminRole, 'owner'>, string> = {
  returning_officer: 'Can create elections and lead election teams',
  admin: 'Operates only elections they are assigned to',
  observer: 'Read-only access only to assigned elections'
};

export default function AdminUsersManager({
  users,
  invitations,
  currentUser
}: {
  users: AdminUser[];
  invitations: AdminInvitation[];
  currentUser: { adminUserId: number; role: AdminRole };
}) {
  const router = useRouter();
  const allowedRoles: Array<Exclude<AdminRole, 'owner'>> = ['returning_officer'];
  const [form, setForm] = useState({ email: '', name: '', role: allowedRoles[0] });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loadingAction, setLoadingAction] = useState('');

  function resetMessages() {
    setError('');
    setSuccess('');
  }

  async function sendInvitation(e: React.FormEvent) {
    e.preventDefault();
    resetMessages();
    setLoadingAction('invite');
    try {
      const response = await csrfFetch('/api/admin/invitations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not send invitation');
      setForm({ email: '', name: '', role: allowedRoles[0] });
      setSuccess(`Invitation sent to ${result.invitation.email}`);
      router.refresh();
    } catch (err: any) {
      setError(err.message || 'Could not send invitation');
    } finally {
      setLoadingAction('');
    }
  }

  async function invitationAction(id: number, action: 'resend' | 'revoke') {
    resetMessages();
    setLoadingAction(`${action}-${id}`);
    try {
      const response = await csrfFetch('/api/admin/invitations', {
        method: action === 'revoke' ? 'DELETE' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(action === 'revoke' ? { id } : { action, id })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || `Could not ${action} invitation`);
      setSuccess(action === 'resend' ? 'Invitation resent' : 'Invitation revoked');
      router.refresh();
    } catch (err: any) {
      setError(err.message || `Could not ${action} invitation`);
    } finally {
      setLoadingAction('');
    }
  }

  function canManage(user: AdminUser): boolean {
    if (user.id === currentUser.adminUserId || user.role === 'owner') return false;
    if (currentUser.role === 'owner') return true;
    return user.role === 'admin' || user.role === 'observer';
  }

  async function updateUser(id: number, changes: Partial<AdminUser>) {
    resetMessages();
    setLoadingAction(`user-${id}`);
    try {
      const response = await csrfFetch('/api/admin/users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...changes })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not update account');
      setSuccess('Account updated');
      router.refresh();
    } catch (err: any) {
      setError(err.message || 'Could not update account');
    } finally {
      setLoadingAction('');
    }
  }

  return (
    <div className="space-y-8">
      {error && <div className="alert-error" role="alert">{error}</div>}
      {success && <div className="alert-success" role="status">{success}</div>}

      <div className="card overflow-hidden">
        <div className="grid lg:grid-cols-[1.1fr_0.9fr]">
          <div className="card-body">
            <div className="mb-6">
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">Secure invitation</p>
              <h2 className="mt-1 text-xl font-semibold text-gray-900">Invite a Returning Officer</h2>
              <p className="mt-2 text-sm text-gray-600">They will receive a private 48-hour link and choose their own password. You never need to share credentials.</p>
            </div>
            <form onSubmit={sendInvitation} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="invite-email" className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input id="invite-email" type="email" required autoComplete="email" value={form.email}
                    onChange={e => setForm({ ...form, email: e.target.value })} className="input-field" placeholder="person@example.org" />
                </div>
                <div>
                  <label htmlFor="invite-name" className="block text-sm font-medium text-gray-700 mb-1">Name <span className="text-gray-400">(optional)</span></label>
                  <input id="invite-name" type="text" value={form.name}
                    onChange={e => setForm({ ...form, name: e.target.value })} className="input-field" placeholder="Full name" />
                </div>
              </div>
              <div>
                <label htmlFor="invite-role" className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                <select id="invite-role" value={form.role} onChange={e => setForm({ ...form, role: e.target.value as typeof form.role })} className="input-field">
                  {allowedRoles.map(role => <option key={role} value={role}>{roleLabels[role]} - {roleDescriptions[role]}</option>)}
                </select>
              </div>
              <button type="submit" disabled={Boolean(loadingAction)} className="btn-primary">
                {loadingAction === 'invite' ? 'Sending invitation...' : 'Send invitation'}
              </button>
            </form>
          </div>
          <div className="bg-green-50 border-t lg:border-t-0 lg:border-l border-green-100 p-6">
            <h3 className="font-semibold text-gray-900">How access works</h3>
            <div className="mt-4 space-y-3 text-sm">
              <div><strong>Owner</strong><p className="text-gray-600">Controls Returning Officers and all lower roles.</p></div>
              <div><strong>Returning Officer</strong><p className="text-gray-600">Can create elections. They automatically lead elections they create.</p></div>
              <div><strong>Election teams</strong><p className="text-gray-600">Returning Officers, Admins and Observers are assigned from inside each election.</p></div>
            </div>
          </div>
        </div>
      </div>

      {invitations.length > 0 && (
        <div className="card">
          <div className="card-header"><h2 className="text-lg font-semibold text-gray-900">Pending invitations</h2></div>
          <div className="divide-y divide-gray-100">
            {invitations.map(invitation => (
              <div key={invitation.id} className="card-body flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="font-medium text-gray-900">{invitation.name || invitation.email}</div>
                  <div className="text-sm text-gray-600">{invitation.email} · {roleLabels[invitation.role]}</div>
                  <div className="text-xs text-gray-500 mt-1">Expires {new Date(invitation.expires_at).toLocaleString('en-AU')}</div>
                </div>
                <div className="flex gap-3 text-sm">
                  <button type="button" disabled={Boolean(loadingAction)} onClick={() => invitationAction(invitation.id, 'resend')} className="text-primary hover:text-primary-dark">Resend</button>
                  <button type="button" disabled={Boolean(loadingAction)} onClick={() => invitationAction(invitation.id, 'revoke')} className="text-red-700 hover:text-red-900">Revoke</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-header"><h2 className="text-lg font-semibold text-gray-900">Organisation authority</h2></div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50"><tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Person</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last login</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {users.map(user => {
                const manageable = canManage(user);
                return <tr key={user.id}>
                  <td className="px-6 py-4"><div className="font-medium text-gray-900">{user.name || user.email}</div><div className="text-sm text-gray-500">{user.email}</div></td>
                  <td className="px-6 py-4">
                    {manageable ? <select value={user.role} disabled={Boolean(loadingAction)} onChange={e => updateUser(user.id, { role: e.target.value as AdminRole })} className="input-field max-w-52">
                      {allowedRoles.map(role => <option key={role} value={role}>{roleLabels[role]}</option>)}
                    </select> : <span className="font-medium text-gray-700">{roleLabels[user.role]}</span>}
                  </td>
                  <td className="px-6 py-4"><span className={`badge ${user.active ? 'badge-green' : 'badge-gray'}`}>{user.active ? 'Active' : 'Inactive'}</span></td>
                  <td className="px-6 py-4 text-sm text-gray-600">{user.last_login_at ? new Date(user.last_login_at).toLocaleString('en-AU') : 'Never'}</td>
                  <td className="px-6 py-4 text-sm">
                    {manageable ? <button type="button" disabled={Boolean(loadingAction)} onClick={() => updateUser(user.id, { active: !user.active })} className={user.active ? 'text-red-700 hover:text-red-900' : 'text-primary hover:text-primary-dark'}>{user.active ? 'Deactivate' : 'Reactivate'}</button>
                      : <span className="text-gray-400">{user.id === currentUser.adminUserId ? 'Your account' : 'Protected'}</span>}
                  </td>
                </tr>;
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
