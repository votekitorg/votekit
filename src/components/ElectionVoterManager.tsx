'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { csrfFetch } from '@/lib/csrf-client';

interface Voter {
  id: number;
  email: string | null;
  phone: string | null;
  added_at: string;
}

interface Props {
  plebisciteId: number;
  plebisciteTitle: string;
  status: string;
  onVoterCountChange?: (count: number) => void;
}

export default function ElectionVoterManager({ plebisciteId, plebisciteTitle, status, onVoterCountChange }: Props) {
  const [voters, setVoters] = useState<Voter[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  // Add single voter
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  
  // CSV upload
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{
    inserted: number;
    duplicates: number;
    invalid: number;
  } | null>(null);
  const [sendingLinks, setSendingLinks] = useState(false);
  const [delivery, setDelivery] = useState({ queued: 0, processing: 0, sent: 0, failed: 0, suppressed: 0 });
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchVoters = useCallback(async () => {
    try {
      const response = await csrfFetch(`/api/admin/voters?plebiscite_id=${plebisciteId}`);
      const result = await response.json();
      
      if (response.ok) {
        setVoters(result.voters);
        onVoterCountChange?.(result.voters.length);
      } else {
        setError(result.error || 'Failed to fetch voters');
      }
    } catch (error) {
      setError('Failed to fetch voters');
    } finally {
      setIsLoading(false);
    }
  }, [plebisciteId, onVoterCountChange]);

  useEffect(() => {
    fetchVoters();
  }, [fetchVoters]);

  const fetchDelivery = useCallback(async () => {
    try {
      const response = await csrfFetch(`/api/admin/voter-links?plebiscite_id=${plebisciteId}`);
      if (response.ok) setDelivery((await response.json()).delivery);
    } catch {
      // Delivery is supplementary status; voter management remains usable.
    }
  }, [plebisciteId]);

  useEffect(() => {
    void fetchDelivery();
    const timer = window.setInterval(() => { void fetchDelivery(); }, 5000);
    return () => window.clearInterval(timer);
  }, [fetchDelivery]);

  const addSingleVoter = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newEmail.trim() && !newPhone.trim()) {
      setError('Email address or phone number is required');
      return;
    }

    setIsAdding(true);
    setError('');
    setSuccess('');

    try {
      const response = await csrfFetch('/api/admin/voters', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'add',
          email: newEmail.trim(),
          phone: newPhone.trim(),
          plebiscite_id: plebisciteId
        }),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        setSuccess('Voter added successfully');
        setNewEmail('');
        setNewPhone('');
        fetchVoters(); // Refresh list
      } else {
        setError(result.error || 'Failed to add voter');
      }
    } catch (error) {
      setError('An error occurred. Please try again.');
    } finally {
      setIsAdding(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setError('Please select a CSV file');
      return;
    }

    setIsUploading(true);
    setError('');
    setSuccess('');
    setUploadResult(null);

    try {
      // Read file content
      const text = await file.text();
      
      const rows = text.split(/\r?\n/).map(line => line.split(',').map(cell => cell.trim().replace(/^"|"$/g, ''))).filter(row => row.some(Boolean));
      const header = rows[0]?.map(cell => cell.toLowerCase()) || [];
      const hasHeader = header.includes('email') || header.includes('phone');
      const emailIndex = hasHeader ? header.indexOf('email') : 0;
      const phoneIndex = hasHeader ? header.indexOf('phone') : 1;
      const voters = rows.slice(hasHeader ? 1 : 0).map(row => {
        if (!hasHeader && row.length === 1) return row[0].includes('@') ? { email: row[0], phone: '' } : { email: '', phone: row[0] };
        return { email: emailIndex >= 0 ? row[emailIndex] || '' : '', phone: phoneIndex >= 0 ? row[phoneIndex] || '' : '' };
      }).filter(voter => voter.email || voter.phone);

      if (voters.length === 0) {
        setError('No email addresses or phone numbers found in the file');
        return;
      }

      // Upload emails
      const response = await csrfFetch('/api/admin/voters', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'upload',
          voters,
          plebiscite_id: plebisciteId
        }),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        setUploadResult({
          inserted: result.inserted,
          duplicates: result.duplicates,
          invalid: result.invalid
        });
        setSuccess(`Upload completed: ${result.inserted} added, ${result.duplicates} duplicates, ${result.invalid} invalid`);
        fetchVoters(); // Refresh list
      } else {
        setError(result.error || 'Failed to upload voters');
      }
    } catch (error) {
      setError('Failed to process file. Please check the format.');
    } finally {
      setIsUploading(false);
      // Clear file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const removeVoter = async (id: number) => {
    if (!confirm('Are you sure you want to remove this voter from this election?')) {
      return;
    }

    try {
      const response = await csrfFetch(`/api/admin/voters?id=${id}&plebiscite_id=${plebisciteId}`, {
        method: 'DELETE',
      });

      const result = await response.json();

      if (response.ok && result.success) {
        setSuccess('Voter removed successfully');
        fetchVoters(); // Refresh list
      } else {
        setError(result.error || 'Failed to remove voter');
      }
    } catch (error) {
      setError('An error occurred. Please try again.');
    }
  };

  const clearAllVoters = async () => {
    if (!confirm('Are you sure you want to clear ALL voters from this election? This action cannot be undone.')) {
      return;
    }

    try {
      const response = await csrfFetch(`/api/admin/voters?action=clear-all&plebiscite_id=${plebisciteId}`, {
        method: 'DELETE',
      });

      const result = await response.json();

      if (response.ok && result.success) {
        setSuccess('All voters cleared successfully');
        fetchVoters(); // Refresh list
      } else {
        setError(result.error || 'Failed to clear voters');
      }
    } catch (error) {
      setError('An error occurred. Please try again.');
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-AU', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Australia/Brisbane'
    });
  };

  const sendLinks = async (action: 'send' | 'remind') => {
    if (!confirm(action === 'send' ? 'Send a private ballot link to every registered voter with an email address?' : 'Send reminders only to registered voters who have not voted?')) return;
    setSendingLinks(true); setError(''); setSuccess('');
    try {
      const response = await csrfFetch('/api/admin/voter-links', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plebiscite_id: plebisciteId, action }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not queue ballot links');
      setDelivery(result.delivery);
      setSuccess(`${result.queued} link${result.queued === 1 ? '' : 's'} queued for delivery${result.suppressed ? `, ${result.suppressed} suppressed` : ''}. VoteKit will send them in reliable batches in the background.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not send ballot links'); }
    finally { setSendingLinks(false); }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-32">
        <div className="spinner w-6 h-6"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Manage Voters</h3>
          <p className="text-sm text-gray-600">
            Upload and manage voters for "{plebisciteTitle}"
          </p>
        </div>
        <div className="text-sm text-gray-500">
          {voters.length} voter{voters.length !== 1 ? 's' : ''} registered
        </div>
      </div>
      {voters.some(voter => voter.email) && (
        <div className="flex flex-wrap gap-3 rounded-lg border border-green-200 bg-green-50 p-4">
          <div className="mr-auto"><strong className="block text-sm text-green-900">Private one-click ballot links</strong><span className="text-sm text-green-800">Available after the election opens.</span><span className="mt-1 block text-xs text-green-900">Delivery: {delivery.queued + delivery.processing} pending, {delivery.sent} sent, {delivery.failed} failed, {delivery.suppressed} suppressed</span></div>
          <button type="button" className="btn-secondary" disabled={sendingLinks || status !== 'open'} onClick={() => sendLinks('send')}>Send ballot links</button>
          <button type="button" className="btn-secondary" disabled={sendingLinks || status !== 'open'} onClick={() => sendLinks('remind')}>Remind non-voters</button>
        </div>
      )}

      {/* Add Methods */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Add Single Voter */}
        <div className="card">
          <div className="card-header">
            <h4 className="text-md font-medium text-gray-900">Add Single Voter</h4>
          </div>
          <div className="card-body">
            <form onSubmit={addSingleVoter} className="space-y-3">
              <div>
                <label htmlFor="newEmail" className="block text-sm font-medium text-gray-700 mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  id="newEmail"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="input-field"
                  placeholder="member@example.com"
                  disabled={isAdding}
                />
              </div>
              <div>
                <label htmlFor="newPhone" className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
                <input type="tel" id="newPhone" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} className="input-field" placeholder="04xx xxx xxx" disabled={isAdding} />
                <p className="mt-1 text-xs text-gray-500">At least one of email or phone is required.</p>
              </div>
              
              <button
                type="submit"
                disabled={isAdding}
                className="btn-primary w-full"
              >
                {isAdding ? (
                  <>
                    <div className="spinner mr-2"></div>
                    Adding...
                  </>
                ) : (
                  'Add Voter'
                )}
              </button>
            </form>
          </div>
        </div>

        {/* CSV Upload */}
        <div className="card">
          <div className="card-header">
            <h4 className="text-md font-medium text-gray-900">Upload CSV</h4>
          </div>
          <div className="card-body">
            <div className="space-y-3">
              <div>
                <label htmlFor="csvFile" className="block text-sm font-medium text-gray-700 mb-1">
                  Select CSV File
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  id="csvFile"
                  accept=".csv"
                  onChange={handleFileUpload}
                  className="input-field"
                  disabled={isUploading}
                />
                <p className="text-sm text-gray-500 mt-1">
                  CSV columns: email, phone. Either value may be blank.
                </p>
              </div>

              {isUploading && (
                <div className="alert-info">
                  <div className="spinner mr-2"></div>
                  Processing file...
                </div>
              )}

              {uploadResult && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                  <h5 className="text-sm font-medium text-green-900 mb-1">Upload Results:</h5>
                  <ul className="text-sm text-green-800 space-y-1">
                    <li>• {uploadResult.inserted} new voters added</li>
                    <li>• {uploadResult.duplicates} duplicate emails skipped</li>
                    <li>• {uploadResult.invalid} invalid entries rejected</li>
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Messages */}
      {error && (
        <div className="alert-error">
          <svg className="w-5 h-5 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {error}
        </div>
      )}

      {success && (
        <div className="alert-success">
          <svg className="w-5 h-5 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {success}
        </div>
      )}

      {/* Voter List */}
      <div className="card">
        <div className="card-header">
          <div className="flex justify-between items-center">
            <h4 className="text-md font-medium text-gray-900">
              Registered Voters ({voters.length})
            </h4>
            {voters.length > 0 && (
              <button
                onClick={clearAllVoters}
                className="btn-danger text-sm px-3 py-1"
              >
                Clear All
              </button>
            )}
          </div>
        </div>
        <div className="card-body p-0">
          {voters.length === 0 ? (
            <div className="text-center py-6">
              <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center mx-auto mb-3">
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <h5 className="text-md font-medium text-gray-900 mb-2">No Voters Registered</h5>
              <p className="text-sm text-gray-600">
                Add voters using the forms above to get started.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Voter identifier
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Added
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {voters.map((voter) => (
                    <tr key={voter.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{voter.email || voter.phone}</div>
                        {voter.email && voter.phone && <div className="text-xs text-gray-500">{voter.phone}</div>}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="text-sm text-gray-500">{formatDate(voter.added_at)}</div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-medium">
                        <button
                          onClick={() => removeVoter(voter.id)}
                          className="text-red-600 hover:text-red-900"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
