'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { csrfFetch } from '@/lib/csrf-client';

export default function DraftTakeoverButton({ draftId, title, creator }: {
  draftId: number;
  title: string;
  creator: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const takeOver = async () => {
    if (!window.confirm(`Take ownership of “${title}” from ${creator}? They will no longer be able to edit this setup draft. This action is audited.`)) return;
    setLoading(true);
    setError('');
    try {
      const response = await csrfFetch('/api/admin/election-drafts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: draftId, action: 'take_over' })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not take over draft');
      router.push(`/admin/plebiscites/new?draft=${draftId}`);
      router.refresh();
    } catch (takeoverError) {
      setError(takeoverError instanceof Error ? takeoverError.message : 'Could not take over draft');
      setLoading(false);
    }
  };

  return (
    <span>
      <button type="button" onClick={takeOver} disabled={loading} className="text-amber-700 hover:text-amber-900 disabled:opacity-50">
        {loading ? 'Taking over…' : 'Take over draft'}
      </button>
      {error && <span className="mt-1 block max-w-64 text-xs font-normal text-red-700">{error}</span>}
    </span>
  );
}
