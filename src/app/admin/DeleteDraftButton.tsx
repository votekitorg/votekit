'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { csrfFetch } from '@/lib/csrf-client';

export default function DeleteDraftButton({ draftId, title, onDeleted }: {
  draftId: number;
  title: string;
  onDeleted: () => void;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const deleteDraft = async () => {
    if (loading || !window.confirm(`Permanently delete the unpublished draft “${title}”? This cannot be undone and its proofing link will stop working.`)) return;
    setLoading(true);
    setError('');
    try {
      const response = await csrfFetch(`/api/admin/election-drafts?id=${draftId}`, { method: 'DELETE' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not delete draft. Please try again.');
      onDeleted();
      router.refresh();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Could not delete draft. Please try again.');
      setLoading(false);
    }
  };

  return <span>
    <button type="button" onClick={deleteDraft} disabled={loading}
      className="inline-flex min-h-11 items-center text-sm font-medium text-red-700 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-700 disabled:opacity-50">
      {loading ? 'Deleting…' : 'Delete draft'}
    </button>
    {error && <span role="alert" className="mt-1 block max-w-64 text-sm text-red-700">{error}</span>}
  </span>;
}
