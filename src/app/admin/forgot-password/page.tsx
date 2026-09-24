'use client';

import Link from 'next/link';
import { useState } from 'react';
import { csrfFetch } from '@/lib/csrf-client';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true); setError('');
    try {
      const response = await csrfFetch('/api/admin/password-resets/request', {
        method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({email})
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not request a reset. Please try again.');
      setMessage(result.message); setEmail('');
    } catch (err: any) { setError(err.message || 'Could not request a reset. Please try again.'); }
    finally { setLoading(false); }
  }
  return <main className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
    <div className="w-full max-w-lg overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="bg-primary p-6 text-white"><p className="text-sm text-green-100">VoteKit Election Platform</p><h1 className="mt-1 text-2xl font-bold">Forgot your password?</h1></div>
      <div className="p-6 sm:p-8">
        {message ? <div role="status">
          <h2 className="text-xl font-semibold">Check your email</h2>
          <p className="mt-3 text-gray-600">{message}</p>
          <p className="mt-3 text-sm text-gray-600">No email? Wait a minute before trying again. If it still does not arrive, contact your account administrator.</p>
          <button type="button" className="mt-5 text-primary underline" onClick={() => setMessage('')}>Try again or use another email</button>
        </div> : <form onSubmit={submit} className="space-y-4">
          <p className="text-gray-600">Enter the email address you use to sign in. We will email you a link to choose a new password.</p>
          <div><label htmlFor="recovery-email" className="block text-sm font-medium mb-1">Email</label><input id="recovery-email" name="email" type="email" autoComplete="username" required maxLength={254} value={email} onChange={e => setEmail(e.target.value)} className="input-field" /></div>
          <p className="text-sm text-gray-600">Request the link when you are ready to use it. It expires after 30 minutes.</p>
          {error && <div role="alert" className="alert-error">{error}</div>}
          <button type="submit" disabled={loading} className="btn-primary w-full">{loading ? 'Requesting link…' : 'Send reset link'}</button>
        </form>}
        <Link href="/admin/login" className="mt-6 inline-block text-primary">Back to sign in</Link>
      </div>
    </div>
  </main>;
}
