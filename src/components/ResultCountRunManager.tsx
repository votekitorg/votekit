'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { csrfFetch } from '@/lib/csrf-client';
import type { ResultCountRun, ResultCountMethod } from '@/lib/result-count-runs';

interface RankedQuestion {
  id: number;
  title: string;
  type: 'ranked_choice' | 'condorcet';
}

export default function ResultCountRunManager({ questions, runs }: { questions: RankedQuestion[]; runs: ResultCountRun[] }) {
  const router = useRouter();
  const [loading, setLoading] = useState('');
  const [error, setError] = useState('');

  async function createRun(questionId: number, method: ResultCountMethod, continueAfterMajority = false) {
    const label = continueAfterMajority ? 'full preference distribution' : method === 'irv' ? 'IRV' : 'Condorcet';
    if (!confirm(`Create an audited ${label} from the frozen ballots? The declared result will not change.`)) return;
    const loadingKey = `${questionId}-${method}-${continueAfterMajority ? 'full' : 'standard'}`;
    setLoading(loadingKey);
    setError('');
    try {
      const response = await csrfFetch('/api/admin/result-count-runs', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionId, method, continueAfterMajority })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not create alternative count');
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create alternative count');
    } finally {
      setLoading('');
    }
  }

  if (questions.length === 0) return null;
  return (
    <section className="card">
      <div className="card-header">
        <h2 className="text-lg font-semibold text-gray-900">Supplementary and alternative counts</h2>
        <p className="mt-1 text-sm text-gray-600">Create an immutable audited count from the same frozen ranked ballots. The declared result is never replaced.</p>
      </div>
      <div className="card-body space-y-5">
        {error && <div className="alert-error text-sm">{error}</div>}
        {questions.map(question => (
          <div key={question.id} className="rounded-lg border border-gray-200 p-4">
            <div className="font-medium text-gray-900">{question.title}</div>
            <div className="mt-3 flex flex-wrap gap-2">
              {(['irv', 'condorcet'] as ResultCountMethod[]).map(method => (
                <button key={method} type="button" className="btn-secondary" disabled={Boolean(loading)} onClick={() => createRun(question.id, method, false)}>
                  {loading === `${question.id}-${method}-standard` ? 'Counting…' : `Run ${method === 'irv' ? 'IRV' : 'Condorcet'} count`}
                </button>
              ))}
              {question.type === 'ranked_choice' && (
                <button type="button" className="btn-secondary" disabled={Boolean(loading)} onClick={() => createRun(question.id, 'irv', true)}>
                  {loading === `${question.id}-irv-full` ? 'Counting…' : 'Run full preference distribution'}
                </button>
              )}
            </div>
          </div>
        ))}
        {runs.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Recorded count runs</h3>
            <div className="mt-2 space-y-2">
              {runs.map(run => (
                <div key={run.id} className="rounded-lg bg-gray-50 px-4 py-3 text-sm">
                  <div className="font-medium text-gray-900">#{run.id} · {run.questionTitle} · {run.settings.continueAfterMajority ? 'Full preference distribution' : run.method.toUpperCase()}</div>
                  <div className="mt-1 text-gray-600">{run.status === 'pending_tie' ? 'Paused for an audited tie decision' : `Winner: ${run.result.winner || 'Tie reported'}`}</div>
                  <div className="mt-1 break-all font-mono text-xs text-gray-500">Result {run.resultHash}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
