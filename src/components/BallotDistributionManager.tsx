'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { csrfFetch } from '@/lib/csrf-client';
import type { BallotDistributionSummary } from '@/lib/ballot-distribution';

function formatAuditDate(value: string): string {
  const utc = /Z$|[+-]\d{2}:?\d{2}$/.test(value) ? value : `${value.replace(' ', 'T')}Z`;
  return new Date(utc).toLocaleString('en-AU', {
    timeZone: 'Australia/Brisbane',
    dateStyle: 'medium',
    timeStyle: 'short'
  });
}

export default function BallotDistributionManager({
  plebisciteId,
  summary
}: {
  plebisciteId: number;
  summary: BallotDistributionSummary;
}) {
  const router = useRouter();
  const [ballotsDistributed, setBallotsDistributed] = useState(String(summary.ballotsDistributed));
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const response = await csrfFetch('/api/admin/ballot-distribution', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plebisciteId,
          ballotsDistributed: Number(ballotsDistributed),
          reason
        })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not update ballots distributed');
      setReason('');
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update ballots distributed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="text-lg font-semibold text-gray-900">Ballot distribution</h2>
      </div>
      <div className="card-body space-y-5">
        <p className="text-sm text-gray-600">
          Report how many voting credentials were actually distributed. This changes the participation denominator only and never creates, revokes or changes voting credentials.
        </p>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-lg bg-gray-50 p-3">
            <div className="text-xl font-bold text-gray-900">{summary.eligibleCredentials.toLocaleString()}</div>
            <div className="text-xs text-gray-600">Credentials generated</div>
          </div>
          <div className="rounded-lg bg-gray-50 p-3">
            <div className="text-xl font-bold text-gray-900">{summary.ballotsDistributed.toLocaleString()}</div>
            <div className="text-xs text-gray-600">Ballots distributed</div>
          </div>
          <div className="rounded-lg bg-gray-50 p-3">
            <div className="text-xl font-bold text-gray-900">
              {summary.participationRate === null ? '—' : `${summary.participationRate.toFixed(1)}%`}
            </div>
            <div className="text-xs text-gray-600">Participation</div>
          </div>
        </div>

        {summary.ballotsDistributedSource === 'generated_credentials' && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            No distribution figure has been reported yet. VoteKit is currently assuming all generated credentials were distributed.
          </div>
        )}

        <form className="space-y-3" onSubmit={submit}>
          <label className="block text-sm font-medium text-gray-700">
            Ballots distributed
            <input
              className="input-field mt-1"
              type="number"
              min={summary.totalVotes}
              max={summary.eligibleCredentials}
              step={1}
              required
              value={ballotsDistributed}
              onChange={event => setBallotsDistributed(event.target.value)}
            />
          </label>
          <label className="block text-sm font-medium text-gray-700">
            Reason for adjustment
            <textarea
              className="input-field mt-1 min-h-24"
              required
              maxLength={500}
              value={reason}
              onChange={event => setReason(event.target.value)}
              placeholder="For example: 127 members had opted out of email communications."
            />
          </label>
          {error && <div className="text-sm text-red-700">{error}</div>}
          <button className="btn-primary" type="submit" disabled={loading}>
            {loading ? 'Saving...' : 'Update Ballots Distributed'}
          </button>
        </form>

        {summary.distributionAdjustments.length > 0 && (
          <details>
            <summary className="cursor-pointer text-sm font-semibold text-gray-800">
              Adjustment history ({summary.distributionAdjustments.length})
            </summary>
            <div className="mt-3 space-y-3">
              {[...summary.distributionAdjustments].reverse().map(adjustment => (
                <div className="rounded-lg border border-gray-200 p-3 text-sm" key={adjustment.id}>
                  <div className="font-medium text-gray-900">
                    {adjustment.previousBallotsDistributed.toLocaleString()} to {adjustment.ballotsDistributed.toLocaleString()}
                  </div>
                  <div className="mt-1 text-gray-600">{adjustment.reason}</div>
                  <div className="mt-2 text-xs text-gray-500">
                    {adjustment.adjustedByName || 'Election administrator'} · {formatAuditDate(adjustment.createdAt)} AEST
                  </div>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>
    </div>
  );
}
