'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { csrfFetch } from '@/lib/csrf-client';

export default function ResetPasswordPage() {
  const started = useRef(false);
  const [token, setToken] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [status, setStatus] = useState<'loading' | 'ready' | 'saving' | 'complete' | 'invalid'>('loading');
  const [error, setError] = useState('');

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const resetToken = new URLSearchParams(window.location.hash.slice(1)).get('token') || '';
    window.history.replaceState(null, '', window.location.pathname);
    setToken(resetToken);
    if (!resetToken) {
      setError('This reset link is incomplete. Open the link in your reset email, or request a new one below.');
      setStatus('invalid');
      return;
    }
    csrfFetch('/api/admin/password-resets/complete', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'inspect', token: resetToken })
    }).then(async response => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not check this reset link');
      setEmail(result.reset.email);
      setStatus('ready');
    }).catch(err => { setError(err.message || 'Could not check this reset link'); setStatus('invalid'); });
  }, []);

  async function resetPassword(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    if (password !== confirmation) { setError('The passwords do not match'); return; }
    setStatus('saving');
    try {
      const response = await csrfFetch('/api/admin/password-resets/complete', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'complete', token, password, confirmation })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not reset password');
      setPassword(''); setConfirmation(''); setToken(''); setStatus('complete');
    } catch (err: any) { setError(err.message || 'Could not reset password'); setStatus('ready'); }
  }

  return <main className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
    <div className="w-full max-w-lg overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="bg-primary p-6 text-white"><p className="text-sm text-green-100">VoteKit Election Platform</p><h1 className="mt-1 text-2xl font-bold">Reset your password</h1></div>
      <div className="p-6 sm:p-8">
        {status === 'loading' && <p role="status">Checking your reset link…</p>}
        {status === 'invalid' && <><div role="alert" className="alert-error">{error}</div><Link href="/admin/forgot-password" className="mt-5 inline-block text-primary underline">Request a new reset link</Link></>}
        {status === 'complete' && <div role="status">
          <h2 className="text-xl font-semibold">Password updated</h2>
          <p className="mt-3 text-gray-600">Your existing sessions have been signed out. Sign in with your new password. Your role and election access have not changed.</p>
          <Link href="/admin/login" className="btn-primary mt-6 inline-block">Continue to sign in</Link>
        </div>}
        {(status === 'ready' || status === 'saving') && <form onSubmit={resetPassword} className="space-y-4">
          <div><label htmlFor="reset-email" className="block text-sm font-medium mb-1">Email</label><input id="reset-email" name="username" type="email" autoComplete="username" readOnly value={email} className="input-field" /></div>
          <div><label htmlFor="new-password" className="block text-sm font-medium mb-1">New password</label><input id="new-password" name="password" type="password" autoComplete="new-password" required minLength={12} maxLength={72} value={password} onChange={e => setPassword(e.target.value)} className="input-field" /></div>
          <div><label htmlFor="confirm-password" className="block text-sm font-medium mb-1">Confirm new password</label><input id="confirm-password" name="confirmation" type="password" autoComplete="new-password" required minLength={12} maxLength={72} value={confirmation} onChange={e => setConfirmation(e.target.value)} className="input-field" /></div>
          <p className="text-sm text-gray-600">Use at least 12 characters. Save your new password in your password manager before continuing.</p>
          {error && <div role="alert" className="alert-error">{error}</div>}
          <button type="submit" disabled={status === 'saving'} className="btn-primary w-full">{status === 'saving' ? 'Updating password…' : 'Set new password'}</button>
        </form>}
      </div>
    </div>
  </main>;
}
