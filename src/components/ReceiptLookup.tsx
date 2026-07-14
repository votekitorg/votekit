'use client';

import { useState } from 'react';

export default function ReceiptLookup({ slug }: { slug: string }) {
  const [receipt, setReceipt] = useState('');
  const [ballot, setBallot] = useState<Array<{ title: string; answer: unknown }> | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function verify(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError('');
    setBallot(null);
    try {
      const response = await fetch(`/api/results/${slug}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receipt: receipt.trim() }),
        cache: 'no-store'
      });
      const result = await response.json();
      if (!response.ok) throw new Error('No published ballot matches that receipt');
      setBallot(result.ballot);
    } catch (err: any) {
      setError(err.message || 'Receipt verification failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card mb-8">
      <div className="card-header">
        <h3 className="text-lg font-semibold text-gray-900">Verify Your Complete Ballot</h3>
      </div>
      <div className="card-body">
        <form onSubmit={verify} className="flex flex-col gap-3 sm:flex-row">
          <input
            type="text" value={receipt} onChange={event => setReceipt(event.target.value)}
            className="input-field flex-1 font-mono" placeholder="Enter your private receipt"
            autoComplete="off" required
          />
          <button className="btn-primary" disabled={loading}>{loading ? 'Checking...' : 'Verify Ballot'}</button>
        </form>
        {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
        {ballot && (
          <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-4">
            <p className="font-medium text-green-900">Your receipt is present in the shuffled ballot box.</p>
            <dl className="mt-3 space-y-3 text-sm">
              {ballot.map((item, index) => (
                <div key={index}>
                  <dt className="font-medium text-gray-700">{item.title}</dt>
                  <dd className="text-gray-900">{Array.isArray(item.answer) ? item.answer.join(' > ') : String(item.answer)}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </div>
    </div>
  );
}
