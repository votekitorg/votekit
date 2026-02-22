'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Plebiscite {
  id: number;
  slug: string;
  title: string;
  status: 'draft' | 'open' | 'closed';
}

interface StatusInfo {
  status: string;
  color: string;
  canOpen: boolean;
  canClose: boolean;
  message: string;
}

export default function PlebisciteManager({ 
  plebiscite, 
  statusInfo 
}: { 
  plebiscite: Plebiscite; 
  statusInfo: StatusInfo;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  async function handleAction(action: string) {
    if (!confirm(`Are you sure you want to ${action} this plebiscite?`)) return;
    
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/plebiscites', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: plebiscite.id, action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      router.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!confirm('Delete this plebiscite? This cannot be undone.')) return;
    
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/plebiscites?id=${plebiscite.id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      router.push('/admin');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function copyUrl() {
    const url = `${window.location.origin}/vote/${plebiscite.slug}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {statusInfo.canOpen && (
        <button
          onClick={() => handleAction('open')}
          disabled={loading}
          className="btn-primary w-full"
        >
          {loading ? 'Opening...' : 'Open Voting'}
        </button>
      )}

      {statusInfo.canClose && (
        <>
          <button
            onClick={copyUrl}
            className="btn-secondary w-full"
          >
            {copied ? 'Copied!' : 'Copy Voting URL'}
          </button>
          <button
            onClick={() => handleAction('close')}
            disabled={loading}
            className="w-full px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
          >
            {loading ? 'Closing...' : 'Close Voting'}
          </button>
        </>
      )}

      {plebiscite.status === 'draft' && (
        <button
          onClick={handleDelete}
          disabled={loading}
          className="w-full px-4 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-50"
        >
          {loading ? 'Deleting...' : 'Delete Plebiscite'}
        </button>
      )}

      {plebiscite.status === 'closed' && (
        <p className="text-sm text-gray-500 text-center">
          This plebiscite is closed. Results are now available.
        </p>
      )}
    </div>
  );
}
