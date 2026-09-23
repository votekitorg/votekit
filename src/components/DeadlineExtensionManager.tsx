'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { csrfFetch } from '@/lib/csrf-client';

export default function DeadlineExtensionManager({ electionId, currentDeadline }: { electionId: number; currentDeadline: string }) {
  const [deadline, setDeadline] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  return <form className="card p-5 space-y-3" onSubmit={async event => {
    event.preventDefault();
    if (!confirm('Extend voting to this deadline? The reason and your name will appear in the election history. If voting has ended but is not finalised, this resumes voting.')) return;
    setBusy(true); setError('');
    try {
      const response = await csrfFetch('/api/admin/deadline-extensions', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plebisciteId: electionId, previousDeadline: currentDeadline, newDeadline: deadline, reason }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setDeadline(''); setReason(''); router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not extend deadline'); }
    finally { setBusy(false); }
  }}>
    <h3 className="font-semibold">Extend voting deadline</h3>
    <p className="text-sm text-gray-600">Only extensions are allowed, before finalisation starts. This does not change the electorate. No automatic notification emails are sent.</p>
    <label className="block">New deadline (Australia/Brisbane)<input type="datetime-local" required value={deadline} onChange={e => setDeadline(e.target.value)} className="input-field" disabled={busy} /></label>
    <label className="block">Public reason<textarea required maxLength={2000} value={reason} onChange={e => setReason(e.target.value)} className="input-field" disabled={busy} /></label>
    {error && <p role="alert" className="alert-error">{error}</p>}
    <button className="btn-primary" disabled={busy}>{busy ? 'Saving...' : 'Extend voting deadline'}</button>
  </form>;
}
