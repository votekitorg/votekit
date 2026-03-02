'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Plebiscite {
  id: number;
  slug: string;
  title: string;
  status: 'draft' | 'open' | 'closed';
  sms_enabled?: boolean;
}

interface StatusInfo {
  status: string;
  color: string;
  canOpen: boolean;
  canClose: boolean;
  message: string;
}

interface SendResult {
  totalVoters: number;
  sentCount: number;
  failedCount: number;
  errors?: string[];
  message?: string;
}

export default function PlebisciteManager({ 
  plebiscite, 
  statusInfo 
}: { 
  plebiscite: Plebiscite; 
  statusInfo: StatusInfo;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [smsEnabled, setSmsEnabled] = useState(!!plebiscite.sms_enabled);
  const [smsToggling, setSmsToggling] = useState(false);
  
  // Ballot sending states
  const [sendingBallots, setSendingBallots] = useState(false);
  const [sendingReminders, setSendingReminders] = useState(false);
  const [sendResult, setSendResult] = useState<SendResult | null>(null);
  const [showSendResult, setShowSendResult] = useState(false);

  async function handleAction(action: string) {
    if (!confirm('Are you sure you want to ' + action + ' this election?')) return;
    
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/plebiscites', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: plebiscite.id, action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      router.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSmsToggle() {
    setSmsToggling(true);
    setError('');
    try {
      const res = await fetch('/api/admin/plebiscites', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: plebiscite.id, action: 'toggle_sms' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSmsEnabled(data.sms_enabled);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSmsToggling(false);
    }
  }

  async function handleSendBallots() {
    if (!confirm('Send ballot link emails to ALL voters with email addresses? This may take a moment.')) return;
    
    setSendingBallots(true);
    setError('');
    setSendResult(null);
    setShowSendResult(false);
    
    try {
      const res = await fetch('/api/admin/plebiscites/send-ballots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plebisciteId: plebiscite.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSendResult(data);
      setShowSendResult(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSendingBallots(false);
    }
  }

  async function handleSendReminders() {
    if (!confirm('Send reminder emails to voters who have NOT yet voted?')) return;
    
    setSendingReminders(true);
    setError('');
    setSendResult(null);
    setShowSendResult(false);
    
    try {
      const res = await fetch('/api/admin/plebiscites/send-reminders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plebisciteId: plebiscite.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSendResult(data);
      setShowSendResult(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSendingReminders(false);
    }
  }

  async function handleDelete() {
    if (!confirm('Delete this election? This cannot be undone.')) return;
    
    setLoading(true);
    try {
      const res = await fetch('/api/admin/plebiscites?id=' + plebiscite.id, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      router.push('/admin');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function copyUrl() {
    const url = window.location.origin + '/vote/' + plebiscite.slug;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {showSendResult && sendResult && (
        <div className={`border rounded-lg p-4 text-sm ${sendResult.failedCount > 0 ? 'bg-yellow-50 border-yellow-200' : 'bg-green-50 border-green-200'}`}>
          <div className="flex items-start justify-between">
            <div>
              <h4 className={`font-semibold ${sendResult.failedCount > 0 ? 'text-yellow-800' : 'text-green-800'}`}>
                {sendResult.message || 'Emails Sent'}
              </h4>
              <p className={sendResult.failedCount > 0 ? 'text-yellow-700' : 'text-green-700'}>
                {sendResult.sentCount} of {sendResult.totalVoters} emails sent successfully
                {sendResult.failedCount > 0 && ` (${sendResult.failedCount} failed)`}
              </p>
              {sendResult.errors && sendResult.errors.length > 0 && (
                <details className="mt-2">
                  <summary className="text-xs text-yellow-600 cursor-pointer">View errors</summary>
                  <ul className="mt-1 text-xs text-yellow-600 list-disc list-inside">
                    {sendResult.errors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
            <button 
              onClick={() => setShowSendResult(false)} 
              className="text-gray-400 hover:text-gray-600"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      <div className="border border-gray-200 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-medium text-gray-900">SMS Verification</h4>
            <p className="text-xs text-gray-500 mt-1">
              Allow voters to verify via SMS (requires Firebase config)
            </p>
          </div>
          <button
            onClick={handleSmsToggle}
            disabled={smsToggling}
            className={'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ' + 
              (smsEnabled ? 'bg-primary' : 'bg-gray-200') + ' ' +
              (smsToggling ? 'opacity-50' : '')}
          >
            <span
              className={'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ' +
                (smsEnabled ? 'translate-x-5' : 'translate-x-0')}
            />
          </button>
        </div>
        {smsEnabled && (
          <div className="mt-3 p-2 bg-green-50 border border-green-200 rounded text-xs text-green-800">
            <strong>SMS enabled.</strong> Voters with phone numbers can verify via SMS.
            Make sure Firebase Phone Auth is configured in your environment.
          </div>
        )}
      </div>

      {statusInfo.canOpen && (
        <button
          onClick={() => handleAction('open')}
          disabled={loading}
          className="btn-primary w-full"
        >
          {loading ? 'Opening...' : 'Open Voting'}
        </button>
      )}

      {statusInfo.canClose && (
        <>
          <button
            onClick={copyUrl}
            className="btn-secondary w-full"
          >
            {copied ? 'Copied!' : 'Copy Voting URL'}
          </button>
          
          {/* Ballot Link Buttons */}
          <div className="border border-blue-200 rounded-lg p-4 bg-blue-50">
            <h4 className="text-sm font-medium text-blue-900 mb-3">📧 Email Ballot Links</h4>
            <div className="space-y-2">
              <button
                onClick={handleSendBallots}
                disabled={sendingBallots || sendingReminders}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center"
              >
                {sendingBallots ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Sending...
                  </>
                ) : 'Send Ballot Links to All Voters'}
              </button>
              <button
                onClick={handleSendReminders}
                disabled={sendingBallots || sendingReminders}
                className="w-full px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50 flex items-center justify-center"
              >
                {sendingReminders ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Sending...
                  </>
                ) : 'Send Reminders (Non-Voters Only)'}
              </button>
            </div>
            <p className="text-xs text-blue-700 mt-2">
              Ballot links allow voters to skip email verification and go straight to voting.
            </p>
          </div>
          
          <button
            onClick={() => handleAction('close')}
            disabled={loading}
            className="w-full px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
          >
            {loading ? 'Closing...' : 'Close Voting'}
          </button>
        </>
      )}

      {plebiscite.status === 'draft' && (
        <button
          onClick={handleDelete}
          disabled={loading}
          className="w-full px-4 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-50"
        >
          {loading ? 'Deleting...' : 'Delete Election'}
        </button>
      )}

      {plebiscite.status === 'closed' && (
        <p className="text-sm text-gray-500 text-center">
          This election is closed. Results are now available.
        </p>
      )}
    </div>
  );
}
