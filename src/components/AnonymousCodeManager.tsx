'use client';

import { useCallback, useEffect, useState } from 'react';
import { csrfFetch } from '@/lib/csrf-client';

interface GeneratedCode { code: string; link: string }

export default function AnonymousCodeManager({ plebisciteId, status }: { plebisciteId: number; status: string }) {
  const [count, setCount] = useState(500);
  const [stats, setStats] = useState({ total: 0, used: 0, remaining: 0 });
  const [generated, setGenerated] = useState<GeneratedCode[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    const response = await csrfFetch(`/api/admin/access-codes?plebiscite_id=${plebisciteId}`);
    if (response.ok) setStats(await response.json());
  }, [plebisciteId]);

  useEffect(() => { void refresh(); }, [refresh]);

  async function generate() {
    setBusy(true); setError(''); setGenerated([]);
    try {
      const response = await csrfFetch('/api/admin/access-codes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plebiscite_id: plebisciteId, count })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not generate codes');
      setGenerated(result.codes);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not generate codes');
    } finally { setBusy(false); }
  }

  function downloadCsv() {
    const escape = (value: string) => `"${value.replaceAll('"', '""')}"`;
    const csv = ['code,link', ...generated.map(item => `${escape(item.code)},${escape(item.link)}`)].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = `votekit-access-codes-${plebisciteId}.csv`; anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-900">Anonymous voting codes</h2>
      <p className="mt-1 text-sm text-gray-600">Each code or link can submit one ballot. VoteKit stores only a hash, so this is your only opportunity to save the usable codes.</p>
      <div className="mt-5 grid grid-cols-3 gap-3 text-center">
        <div className="rounded-lg bg-gray-50 p-3"><strong className="block text-xl">{stats.total}</strong><span className="text-xs text-gray-600">Generated</span></div>
        <div className="rounded-lg bg-gray-50 p-3"><strong className="block text-xl">{stats.used}</strong><span className="text-xs text-gray-600">Used</span></div>
        <div className="rounded-lg bg-gray-50 p-3"><strong className="block text-xl">{stats.remaining}</strong><span className="text-xs text-gray-600">Remaining</span></div>
      </div>
      {status === 'draft' && (
        <div className="mt-5 flex flex-wrap items-end gap-3">
          <label className="text-sm font-medium text-gray-700">Number of codes
            <input type="number" min={1} max={10000} value={count} onChange={event => setCount(Number(event.target.value))} className="input-field mt-1 w-40" />
          </label>
          <button type="button" className="btn-primary" disabled={busy || count < 1 || count > 10000} onClick={generate}>{busy ? 'Generating…' : `Generate ${count} codes`}</button>
        </div>
      )}
      {error && <div className="alert-error mt-4">{error}</div>}
      {generated.length > 0 && (
        <div className="mt-5 rounded-lg border border-amber-300 bg-amber-50 p-4">
          <p className="font-semibold text-amber-900">Save this batch now</p>
          <p className="mt-1 text-sm text-amber-800">These {generated.length} plaintext codes cannot be recovered from VoteKit later.</p>
          <button type="button" className="btn-primary mt-3" onClick={downloadCsv}>Download codes and links (CSV)</button>
        </div>
      )}
    </div>
  );
}
