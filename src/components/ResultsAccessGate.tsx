'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { csrfFetch } from '@/lib/csrf-client';
import { confirmSmsCode, sendSmsCode } from '@/lib/firebase';

export default function ResultsAccessGate({ slug, title, accessMode, smsEnabled }: {
  slug: string;
  title: string;
  accessMode: 'voter_roll' | 'anonymous_codes';
  smsEnabled: boolean;
}) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [votingCode, setVotingCode] = useState('');
  const [emailSent, setEmailSent] = useState(false);
  const [phoneMode, setPhoneMode] = useState(false);
  const [phone, setPhone] = useState('');
  const [smsCode, setSmsCode] = useState('');
  const [smsSent, setSmsSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function authorize(body: Record<string, unknown>) {
    setLoading(true);
    setError('');
    try {
      const response = await csrfFetch(`/api/results/${slug}/access`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not verify access');
      if (body.action === 'request_email') setEmailSent(true);
      else {
        history.replaceState(null, '', window.location.pathname);
        router.refresh();
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not verify access');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const codeMatch = window.location.hash.match(/^#code=(.+)$/u);
    const voterMatch = window.location.hash.match(/^#voter=(.+)$/u);
    if (accessMode === 'anonymous_codes' && codeMatch) {
      const value = decodeURIComponent(codeMatch[1]);
      setVotingCode(value);
      void authorize({ action: 'access_code', code: value });
    } else if (accessMode === 'voter_roll' && voterMatch) {
      void authorize({ action: 'voter_link', token: decodeURIComponent(voterMatch[1]) });
    }
    // authorize intentionally runs once for the initial private URL fragment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessMode]);

  async function submitPhone(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      if (!smsSent) {
        let normalized = phone.replace(/[^\d+]/g, '');
        if (normalized.startsWith('0') && normalized.length === 10) normalized = `+61${normalized.slice(1)}`;
        else if (normalized.startsWith('61')) normalized = `+${normalized}`;
        await sendSmsCode(normalized, 'results-sms-code');
        setPhone(normalized);
        setSmsSent(true);
      } else {
        const idToken = await confirmSmsCode(smsCode);
        await authorize({ action: 'verify_phone', idToken });
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Phone verification failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-12">
      <div className="card w-full max-w-md">
        <div className="card-body space-y-5">
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-2xl">🔒</div>
            <h1 className="text-2xl font-bold text-gray-900">Private election results</h1>
            <p className="mt-2 text-sm text-gray-600">{title}</p>
            <p className="mt-3 text-sm text-gray-600">Results are available to eligible electors and assigned election officials.</p>
          </div>

          {accessMode === 'anonymous_codes' ? (
            <form className="space-y-4" onSubmit={event => { event.preventDefault(); void authorize({ action: 'access_code', code: votingCode }); }}>
              <label className="block text-sm font-medium text-gray-700" htmlFor="results-voting-code">Enter the same voting code issued for this election</label>
              <input id="results-voting-code" className="input-field text-center font-mono" value={votingCode} onChange={event => setVotingCode(event.target.value.toUpperCase())} required />
              <button className="btn-primary w-full" disabled={loading}>{loading ? 'Checking…' : 'View results'}</button>
            </form>
          ) : phoneMode ? (
            <form className="space-y-4" onSubmit={submitPhone}>
              {!smsSent ? <>
                <label className="block text-sm font-medium text-gray-700" htmlFor="results-phone">Registered phone number</label>
                <input id="results-phone" type="tel" className="input-field" value={phone} onChange={event => setPhone(event.target.value)} required />
              </> : <>
                <label className="block text-sm font-medium text-gray-700" htmlFor="results-sms-code">SMS verification code</label>
                <input id="results-sms-input" inputMode="numeric" className="input-field text-center font-mono" value={smsCode} onChange={event => setSmsCode(event.target.value)} required />
              </>}
              <button id="results-sms-code" className="btn-primary w-full" disabled={loading}>{loading ? 'Checking…' : smsSent ? 'Verify and view results' : 'Send SMS code'}</button>
              <button type="button" className="w-full text-sm text-primary" onClick={() => { setPhoneMode(false); setError(''); }}>Use email instead</button>
            </form>
          ) : (
            <form className="space-y-4" onSubmit={event => { event.preventDefault(); void authorize(emailSent ? { action: 'confirm_email', email, code } : { action: 'request_email', email }); }}>
              <label className="block text-sm font-medium text-gray-700" htmlFor="results-email">{emailSent ? 'Enter the six-digit code sent to your email' : 'Enter your registered email address'}</label>
              {!emailSent ? (
                <input id="results-email" type="email" className="input-field" value={email} onChange={event => setEmail(event.target.value)} required />
              ) : (
                <input id="results-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} className="input-field text-center font-mono tracking-widest" value={code} onChange={event => setCode(event.target.value.replace(/\D/g, ''))} required />
              )}
              <button className="btn-primary w-full" disabled={loading}>{loading ? 'Checking…' : emailSent ? 'Verify and view results' : 'Send access code'}</button>
              {smsEnabled && <button type="button" className="w-full text-sm text-primary" onClick={() => { setPhoneMode(true); setError(''); }}>Use a registered phone number instead</button>}
            </form>
          )}

          {error && <div className="alert-error text-sm">{error}</div>}
          <p className="text-center text-xs text-gray-500">This check confirms eligibility only. VoteKit does not connect your identity or voting code to your ballot.</p>
        </div>
      </div>
    </div>
  );
}
