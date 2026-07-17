'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { csrfFetch } from '@/lib/csrf-client';

type ElectionRole = 'returning_officer' | 'admin' | 'observer';
type Member = { id:number; email:string; name:string|null; electionRole:ElectionRole; active:boolean };
type ReturningOfficer = { id:number; email:string; name:string|null };
type PendingInvitation = { id:number; email:string; name:string|null; role:ElectionRole; expires_at:string };
const labels: Record<ElectionRole,string> = { returning_officer:'Returning Officer', admin:'Admin', observer:'Observer' };

export default function ElectionTeamManager({ plebisciteId, members, returningOfficers, pendingInvitations, canManage }:{
  plebisciteId:number; members:Member[]; returningOfficers:ReturningOfficer[]; pendingInvitations:PendingInvitation[]; canManage:boolean;
}) {
  const router = useRouter();
  const [invite, setInvite] = useState({ email:'', name:'', role:'admin' as 'admin'|'observer' });
  const [roId, setRoId] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const assigned = new Set(members.map(m => m.id));
  const availableROs = returningOfficers.filter(ro => !assigned.has(ro.id));

  async function request(url:string, method:string, body:any) {
    setBusy(true); setError(''); setMessage('');
    try {
      const response = await csrfFetch(url, { method, headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Request failed');
      return result;
    } catch (e:any) { setError(e.message || 'Request failed'); throw e; }
    finally { setBusy(false); }
  }

  async function invitePerson(e:React.FormEvent) {
    e.preventDefault();
    try {
      await request('/api/admin/invitations','POST',{...invite, plebisciteId});
      setInvite({email:'',name:'',role:'admin'}); setMessage('Election invitation sent'); router.refresh();
    } catch {}
  }

  async function addRO() {
    if (!roId) return;
    try { await request('/api/admin/election-team','PUT',{plebisciteId,userId:Number(roId),role:'returning_officer'}); setRoId(''); setMessage('Returning Officer assigned'); router.refresh(); } catch {}
  }

  async function changeRole(userId:number, role:ElectionRole) {
    try { await request('/api/admin/election-team','PUT',{plebisciteId,userId,role}); setMessage('Election role updated'); router.refresh(); } catch {}
  }

  async function remove(userId:number) {
    if (!window.confirm('Remove this person from the election? Their account will remain available for other elections.')) return;
    try { await request('/api/admin/election-team','DELETE',{plebisciteId,userId}); setMessage('Election access removed'); router.refresh(); } catch {}
  }

  async function invitationAction(id:number, action:'resend'|'revoke') {
    try {
      await request('/api/admin/invitations', action === 'revoke' ? 'DELETE' : 'POST', action === 'revoke' ? {id} : {action,id});
      setMessage(action === 'resend' ? 'Invitation resent' : 'Invitation revoked'); router.refresh();
    } catch {}
  }

  return <div className="card">
    <div className="card-header"><h2 className="text-lg font-semibold text-gray-900">Election Team</h2><p className="mt-1 text-sm text-gray-600">Access here applies only to this election. Organisation Owners always retain access.</p></div>
    <div className="card-body space-y-6">
      {error && <div className="alert-error" role="alert">{error}</div>}
      {message && <div className="alert-success" role="status">{message}</div>}
      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-lg border p-3"><strong>Returning Officer</strong><p className="text-sm text-gray-600">Leads this election and manages its team.</p></div>
        <div className="rounded-lg border p-3"><strong>Admin</strong><p className="text-sm text-gray-600">Manages this election and its voters.</p></div>
        <div className="rounded-lg border p-3"><strong>Observer</strong><p className="text-sm text-gray-600">Can view this election without changing it.</p></div>
      </div>
      {canManage && <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <h3 className="font-semibold text-gray-900">Assign a Returning Officer</h3>
          <p className="mb-3 text-sm text-gray-600">Choose from Returning Officers appointed at organisation level.</p>
          <div className="flex gap-2"><select value={roId} onChange={e=>setRoId(e.target.value)} className="input-field"><option value="">Select a Returning Officer</option>{availableROs.map(ro=><option key={ro.id} value={ro.id}>{ro.name || ro.email}</option>)}</select><button disabled={busy || !roId} onClick={addRO} className="btn-secondary">Assign</button></div>
        </div>
        <form onSubmit={invitePerson}>
          <h3 className="font-semibold text-gray-900">Invite an election team member</h3>
          <p className="mb-3 text-sm text-gray-600">Their access will be limited to this election.</p>
          <div className="grid gap-2 sm:grid-cols-2"><input required type="email" className="input-field" placeholder="person@example.org" value={invite.email} onChange={e=>setInvite({...invite,email:e.target.value})}/><input className="input-field" placeholder="Name (optional)" value={invite.name} onChange={e=>setInvite({...invite,name:e.target.value})}/></div>
          <div className="mt-2 flex gap-2"><select className="input-field" value={invite.role} onChange={e=>setInvite({...invite,role:e.target.value as 'admin'|'observer'})}><option value="admin">Admin - can operate this election</option><option value="observer">Observer - read only</option></select><button disabled={busy} className="btn-primary">Send invite</button></div>
        </form>
      </div>}
      <div className="divide-y rounded-lg border">
        {members.length === 0 ? <p className="p-4 text-sm text-gray-600">No election-specific team members yet.</p> : members.map(member=><div key={member.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"><div><div className="font-medium">{member.name || member.email}</div><div className="text-sm text-gray-500">{member.email}</div></div><div className="flex items-center gap-3">{canManage ? <select className="input-field" value={member.electionRole} disabled={busy} onChange={e=>changeRole(member.id,e.target.value as ElectionRole)}><option value="returning_officer" disabled={!returningOfficers.some(ro=>ro.id===member.id)}>Returning Officer</option><option value="admin">Admin</option><option value="observer">Observer</option></select> : <span className="badge badge-gray">{labels[member.electionRole]}</span>}{canManage && <button className="text-sm text-red-700" disabled={busy} onClick={()=>remove(member.id)}>Remove</button>}</div></div>)}
      </div>
      {pendingInvitations.length > 0 && <div>
        <h3 className="mb-2 font-semibold text-gray-900">Pending invitations</h3>
        <div className="divide-y rounded-lg border">{pendingInvitations.map(invitation=><div key={invitation.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between"><div><div className="font-medium">{invitation.name || invitation.email}</div><div className="text-sm text-gray-500">{invitation.email} · {labels[invitation.role]} · expires {new Date(invitation.expires_at).toLocaleString('en-AU')}</div></div><div className="flex gap-3 text-sm"><button disabled={busy} className="text-primary" onClick={()=>invitationAction(invitation.id,'resend')}>Resend</button><button disabled={busy} className="text-red-700" onClick={()=>invitationAction(invitation.id,'revoke')}>Revoke</button></div></div>)}</div>
      </div>}
    </div>
  </div>;
}
