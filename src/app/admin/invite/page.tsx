'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { csrfFetch } from '@/lib/csrf-client';

interface InvitationPreview {
  email: string;
  name: string | null;
  role: string;
  roleLabel: string;
  expiresAt: string;
  inviter: string;
}

export default function AcceptAdminInvitationPage() {
  const [token, setToken] = useState('');
  const [invitation, setInvitation] = useState<InvitationPreview | null>(null);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [status, setStatus] = useState<'loading' | 'ready' | 'submitting' | 'complete' | 'error'>('loading');
  const [error, setError] = useState('');

  useEffect(() => {
    const invitationToken = new URLSearchParams(window.location.hash.slice(1)).get('token') || '';
    window.history.replaceState(null, '', window.location.pathname);
    if (!invitationToken) {
      setError('This invitation link is incomplete. Ask the person who invited you to resend it.');
      setStatus('error');
      return;
    }
    setToken(invitationToken);
    csrfFetch('/api/admin/invitations/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'inspect', token: invitationToken })
    }).then(async response => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'This invitation is invalid or has expired');
      setInvitation(result.invitation);
      setStatus('ready');
    }).catch(err => {
      setError(err.message || 'This invitation is invalid or has expired');
      setStatus('error');
    });
  }, []);

  async function acceptInvitation(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (password.length < 12) {
      setError('Use at least 12 characters for your password');
      return;
    }
    if (password !== confirmation) {
      setError('The passwords do not match');
      return;
    }
    setStatus('submitting');
    try {
      const response = await csrfFetch('/api/admin/invitations/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'accept', token, password })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not accept invitation');
      setStatus('complete');
    } catch (err: any) {
      setError(err.message || 'Could not accept invitation');
      setStatus('ready');
    }
  }

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="bg-primary p-6 text-white">
          <p className="text-sm font-medium text-green-100">VoteKit Election Platform</p>
          <h1 className="mt-1 text-2xl font-bold">Join the election team</h1>
        </div>
        <div className="p-6 sm:p-8">
          {status === 'loading' && <p className="text-gray-600">Checking your invitation...</p>}

          {status === 'error' && <div>
            <div className="alert-error">{error}</div>
            <Link href="/admin/login" className="mt-5 inline-block text-primary font-medium">Go to sign in</Link>
          </div>}

          {status === 'complete' && <div>
            <div className="w-12 h-12 rounded-full bg-green-100 text-green-700 flex items-center justify-center text-2xl">✓</div>
            <h2 className="mt-4 text-xl font-semibold text-gray-900">Your account is ready</h2>
            <p className="mt-2 text-gray-600">Sign in with {invitation?.email} and the password you just created.</p>
            <Link href="/admin/login" className="btn-primary mt-6 inline-block">Continue to sign in</Link>
          </div>}

          {(status === 'ready' || status === 'submitting') && invitation && <>
            <div className="rounded-lg bg-green-50 border border-green-100 p-4 mb-6">
              <div className="text-sm text-gray-600">Invited by {invitation.inviter}</div>
              <div className="mt-1 font-semibold text-gray-900">{invitation.name || invitation.email}</div>
              <div className="text-sm text-gray-700">{invitation.email}</div>
              <span className="mt-3 inline-flex badge badge-green">{invitation.roleLabel}</span>
            </div>
            <form onSubmit={acceptInvitation} className="space-y-4">
              <div>
                <label htmlFor="new-password" className="block text-sm font-medium text-gray-700 mb-1">Create password</label>
                <input id="new-password" type="password" minLength={12} maxLength={128} required autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} className="input-field" placeholder="At least 12 characters" />
              </div>
              <div>
                <label htmlFor="confirm-password" className="block text-sm font-medium text-gray-700 mb-1">Confirm password</label>
                <input id="confirm-password" type="password" minLength={12} maxLength={128} required autoComplete="new-password" value={confirmation} onChange={e => setConfirmation(e.target.value)} className="input-field" />
              </div>
              {error && <div className="alert-error" role="alert">{error}</div>}
              <button type="submit" disabled={status === 'submitting'} className="btn-primary w-full">
                {status === 'submitting' ? 'Creating your account...' : 'Accept invitation'}
              </button>
              <p className="text-xs text-gray-500 text-center">This single-use invitation expires {new Date(invitation.expiresAt).toLocaleString('en-AU')}.</p>
            </form>
          </>}
        </div>
      </div>
    </main>
  );
}
