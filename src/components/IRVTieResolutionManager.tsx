'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { csrfFetch } from '@/lib/csrf-client';

interface PendingTie {
  questionId: number;
  questionTitle: string;
  round: number;
  type: 'exclusion' | 'winner';
  tiedCandidates: string[];
  countRunId?: number;
}

export default function IRVTieResolutionManager({ ties }: { ties: PendingTie[] }) {
  const router = useRouter();
  const [selectedCandidate, setSelectedCandidate] = useState<Record<string, string>>({});
  const [method, setMethod] = useState<Record<string, 'drawing_lots' | 'governing_rules'>>({});
  const [note, setNote] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState('');

  if (ties.length === 0) return null;

  async function resolveTie(tie: PendingTie) {
    const tieKey = `${tie.questionId}-${tie.countRunId || 'primary'}`;
    const candidate = selectedCandidate[tieKey];
    const resolutionMethod = method[tieKey] || 'drawing_lots';
    if (!candidate) {
      setError('Select the option determined by the tie-break');
      return;
    }
    const action = tie.type === 'winner' ? 'declared the winner' : 'excluded';
    if (!confirm(`Record that ${candidate} was ${action} under the selected tie-break rule? This decision becomes part of the permanent audit record.`)) return;
    setLoading(tieKey);
    setError('');
    try {
      const response = await csrfFetch('/api/admin/irv-ties', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questionId: tie.questionId,
          countRunId: tie.countRunId,
          round: tie.round,
          type: tie.type,
          selectedCandidate: candidate,
          method: resolutionMethod,
          note: note[tieKey] || ''
        })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not resolve tie');
      router.refresh();
    } catch (err: any) {
      setError(err.message || 'Could not resolve tie');
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-5">
      <h2 className="text-lg font-semibold text-amber-950">Tie-break decision required</h2>
      <p className="mt-1 text-sm text-amber-900">VoteKit has paused counting rather than choosing an arbitrary option. An Owner or Returning Officer can resolve each tie in order; preferences will then be recounted automatically.</p>
      {error && <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      <div className="mt-5 space-y-5">
        {ties.map(tie => (
          <div key={`${tie.questionId}-${tie.countRunId || 'primary'}-${tie.round}-${tie.type}`} className="rounded-lg border border-amber-200 bg-white p-4">
            <div className="font-semibold text-gray-900">{tie.questionTitle}</div>
            <p className="mt-1 text-sm text-gray-600">Round {tie.round}: {tie.tiedCandidates.join(', ')} are tied {tie.type === 'winner' ? 'for the final result' : 'for exclusion'}.</p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="text-sm font-medium text-gray-700">
                {tie.type === 'winner' ? 'Option declared winner' : 'Option selected for exclusion'}
                <select className="input-field mt-1" value={selectedCandidate[`${tie.questionId}-${tie.countRunId || 'primary'}`] || ''} onChange={event => setSelectedCandidate(current => ({ ...current, [`${tie.questionId}-${tie.countRunId || 'primary'}`]: event.target.value }))}>
                  <option value="">Select option…</option>
                  {tie.tiedCandidates.map(candidate => <option key={candidate} value={candidate}>{candidate}</option>)}
                </select>
              </label>
              <label className="text-sm font-medium text-gray-700">
                Tie-break method
                <select className="input-field mt-1" value={method[`${tie.questionId}-${tie.countRunId || 'primary'}`] || 'drawing_lots'} onChange={event => setMethod(current => ({ ...current, [`${tie.questionId}-${tie.countRunId || 'primary'}`]: event.target.value as 'drawing_lots' | 'governing_rules' }))}>
                  <option value="drawing_lots">Supervised drawing of lots</option>
                  <option value="governing_rules">Election’s governing rules</option>
                </select>
              </label>
            </div>
            <label className="mt-4 block text-sm font-medium text-gray-700">
              Audit note {method[`${tie.questionId}-${tie.countRunId || 'primary'}`] === 'governing_rules' ? '(required)' : '(optional)'}
              <textarea className="textarea-field mt-1" rows={2} maxLength={2000} value={note[`${tie.questionId}-${tie.countRunId || 'primary'}`] || ''} onChange={event => setNote(current => ({ ...current, [`${tie.questionId}-${tie.countRunId || 'primary'}`]: event.target.value }))} placeholder="For example: Names drawn in the presence of the Returning Officer and Observer." />
            </label>
            <button type="button" className="btn-primary mt-4" disabled={loading === `${tie.questionId}-${tie.countRunId || 'primary'}`} onClick={() => resolveTie(tie)}>
              {loading === `${tie.questionId}-${tie.countRunId || 'primary'}` ? 'Recording decision…' : 'Record Tie-Break and Continue Count'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
