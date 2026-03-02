'use client';

import { useState } from 'react';
import Link from 'next/link';

interface VerifyResult {
  found: boolean;
  election?: string;
  votedAt?: string;
  identifier?: string;
  verificationMethod?: string;
}

export default function VerifyPage() {
  const [receiptCode, setReceiptCode] = useState('');
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!receiptCode.trim()) {
      setError('Please enter a receipt code');
      return;
    }

    setLoading(true);
    setError('');
    setResult(null);

    try {
      const res = await fetch('/api/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receiptCode: receiptCode.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Verification failed');
        return;
      }
      setResult(data);
    } catch (err) {
      setError('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm border-b">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="text-xl font-bold text-primary">
            VoteKit Election
          </Link>
          <span className="text-sm text-gray-500">Verify Your Vote</span>
        </div>
      </nav>

      <div className="max-w-xl mx-auto px-4 py-16">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Verify Your Vote</h1>
          <p className="mt-2 text-gray-600">
            Enter the receipt code you received after voting to confirm your vote was recorded.
          </p>
        </div>

        <div className="bg-white rounded-lg shadow-sm border p-6">
          <form onSubmit={handleVerify} className="space-y-4">
            <div>
              <label htmlFor="receiptCode" className="block text-sm font-medium text-gray-700 mb-2">
                Receipt Code
              </label>
              <input
                type="text"
                id="receiptCode"
                value={receiptCode}
                onChange={(e) => setReceiptCode(e.target.value)}
                className="input-field font-mono text-lg tracking-wider"
                placeholder="Enter your receipt code"
                autoComplete="off"
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full"
            >
              {loading ? 'Verifying...' : 'Verify'}
            </button>
          </form>

          {result && (
            <div className="mt-6">
              {result.found ? (
                <div className="bg-green-50 border border-green-200 rounded-lg p-6">
                  <div className="flex items-center mb-4">
                    <svg className="w-8 h-8 text-green-600 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <h3 className="text-lg font-semibold text-green-900">Vote Confirmed</h3>
                  </div>
                  <p className="text-sm text-green-800 mb-4">
                    Your vote was successfully recorded and is included in the tally.
                  </p>
                  <dl className="space-y-3">
                    <div>
                      <dt className="text-xs font-medium text-green-700 uppercase">Election</dt>
                      <dd className="text-sm text-green-900 font-medium">{result.election}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium text-green-700 uppercase">Cast At</dt>
                      <dd className="text-sm text-green-900">{result.votedAt}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium text-green-700 uppercase">Verified By ({result.verificationMethod})</dt>
                      <dd className="text-sm text-green-900 font-mono">{result.identifier}</dd>
                    </div>
                  </dl>
                </div>
              ) : (
                <div className="bg-red-50 border border-red-200 rounded-lg p-6">
                  <div className="flex items-center mb-3">
                    <svg className="w-8 h-8 text-red-600 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <h3 className="text-lg font-semibold text-red-900">Not Found</h3>
                  </div>
                  <p className="text-sm text-red-700">
                    No vote was found with this receipt code. Please check the code and try again.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="mt-8 text-center">
          <p className="text-xs text-gray-500">
            Receipt codes prove your vote was counted without revealing how you voted.
            Your actual ballot choices are never shown here.
          </p>
        </div>
      </div>

      <footer className="mt-16 py-8 border-t bg-white">
        <div className="max-w-4xl mx-auto px-4 text-center text-sm text-gray-500">
          &copy; {new Date().getFullYear()} VoteKit Election Platform. Secure, transparent, democratic.
        </div>
      </footer>
    </div>
  );
}
