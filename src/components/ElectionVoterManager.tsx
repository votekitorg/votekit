'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

interface Voter {
  id: number;
  email: string | null;
  phone: string | null;
  added_at: string;
}

interface Props {
  plebisciteId: number;
  plebisciteTitle: string;
  onVoterCountChange?: (count: number) => void;
}

export default function ElectionVoterManager({ plebisciteId, plebisciteTitle, onVoterCountChange }: Props) {
  const [voters, setVoters] = useState<Voter[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{
    inserted: number;
    duplicates: number;
    invalid: number;
  } | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchVoters = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/voters?plebiscite_id=' + plebisciteId);
      const result = await response.json();
      
      if (response.ok) {
        setVoters(result.voters);
        onVoterCountChange?.(result.voters.length);
      } else {
        setError(result.error || 'Failed to fetch voters');
      }
    } catch (err) {
      setError('Failed to fetch voters');
    } finally {
      setIsLoading(false);
    }
  }, [plebisciteId, onVoterCountChange]);

  useEffect(() => {
    fetchVoters();
  }, [fetchVoters]);

  const addSingleVoter = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newEmail.trim() && !newPhone.trim()) {
      setError('Email or phone number is required');
      return;
    }

    setIsAdding(true);
    setError('');
    setSuccess('');

    try {
      const response = await fetch('/api/admin/voters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add',
          email: newEmail.trim() || undefined,
          phone: newPhone.trim() || undefined,
          plebiscite_id: plebisciteId
        }),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        setSuccess('Voter added successfully');
        setNewEmail('');
        setNewPhone('');
        fetchVoters();
      } else {
        setError(result.error || 'Failed to add voter');
      }
    } catch (err) {
      setError('An error occurred. Please try again.');
    } finally {
      setIsAdding(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.csv')) {
      setError('Please select a CSV file');
      return;
    }

    setIsUploading(true);
    setError('');
    setSuccess('');
    setUploadResult(null);

    try {
      const text = await file.text();
      const lines = text.split(/[\n\r]+/).filter(line => line.trim());
      
      const voterList: Array<{email: string | null; phone: string | null}> = [];
      
      for (const line of lines) {
        if (line.toLowerCase().includes('email') && line.toLowerCase().includes('phone')) {
          continue;
        }
        
        const parts = line.split(',').map(p => p.trim().replace(/^["']|["']$/g, ''));
        
        if (parts.length >= 2) {
          voterList.push({
            email: parts[0] || null,
            phone: parts[1] || null
          });
        } else if (parts.length === 1 && parts[0]) {
          const value = parts[0];
          if (value.includes('@')) {
            voterList.push({ email: value, phone: null });
          } else if (/^[\d\+\s\-\(\)]+$/.test(value)) {
            voterList.push({ email: null, phone: value });
          } else {
            voterList.push({ email: value, phone: null });
          }
        }
      }

      if (voterList.length === 0) {
        setError('No valid entries found in the file');
        return;
      }

      const response = await fetch('/api/admin/voters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'upload',
          voters: voterList,
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
        setSuccess('Upload completed: ' + result.inserted + ' added, ' + result.duplicates + ' duplicates, ' + result.invalid + ' invalid');
        fetchVoters();
      } else {
        setError(result.error || 'Failed to upload voters');
      }
    } catch (err) {
      setError('Failed to process file. Please check the format.');
    } finally {
      setIsUploading(false);
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
      const response = await fetch('/api/admin/voters?id=' + id + '&plebiscite_id=' + plebisciteId, {
        method: 'DELETE',
      });

      const result = await response.json();

      if (response.ok && result.success) {
        setSuccess('Voter removed successfully');
        fetchVoters();
      } else {
        setError(result.error || 'Failed to remove voter');
      }
    } catch (err) {
      setError('An error occurred. Please try again.');
    }
  };

  const clearAllVoters = async () => {
    if (!confirm('Are you sure you want to clear ALL voters from this election? This action cannot be undone.')) {
      return;
    }

    try {
      const response = await fetch('/api/admin/voters?action=clear-all&plebiscite_id=' + plebisciteId, {
        method: 'DELETE',
      });

      const result = await response.json();

      if (response.ok && result.success) {
        setSuccess('All voters cleared successfully');
        fetchVoters();
      } else {
        setError(result.error || 'Failed to clear voters');
      }
    } catch (err) {
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

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-32">
        <div className="spinner w-6 h-6"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Manage Voters</h3>
          <p className="text-sm text-gray-600">
            Upload and manage voters for &quot;{plebisciteTitle}&quot;
          </p>
        </div>
        <div className="text-sm text-gray-500">
          {voters.length} voter{voters.length !== 1 ? 's' : ''} registered
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
                <label htmlFor="newPhone" className="block text-sm font-medium text-gray-700 mb-1">
                  Phone Number
                </label>
                <input
                  type="tel"
                  id="newPhone"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  className="input-field"
                  placeholder="+61 412 345 678"
                  disabled={isAdding}
                />
                <p className="text-xs text-gray-500 mt-1">
                  At least email or phone required
                </p>
              </div>
              
              <button type="submit" disabled={isAdding} className="btn-primary w-full">
                {isAdding ? 'Adding...' : 'Add Voter'}
              </button>
            </form>
          </div>
        </div>

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
                  CSV format: <code className="bg-gray-100 px-1 rounded">email,phone</code><br/>
                  Either column can be empty but not both
                </p>
              </div>

              {isUploading && (
                <div className="alert-info">
                  Processing file...
                </div>
              )}

              {uploadResult && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                  <h5 className="text-sm font-medium text-green-900 mb-1">Upload Results:</h5>
                  <ul className="text-sm text-green-800 space-y-1">
                    <li>• {uploadResult.inserted} new voters added</li>
                    <li>• {uploadResult.duplicates} duplicate entries skipped</li>
                    <li>• {uploadResult.invalid} invalid entries rejected</li>
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

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

      <div className="card">
        <div className="card-header">
          <div className="flex justify-between items-center">
            <h4 className="text-md font-medium text-gray-900">
              Registered Voters ({voters.length})
            </h4>
            {voters.length > 0 && (
              <button onClick={clearAllVoters} className="btn-danger text-sm px-3 py-1">
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
                      Email
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Phone
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
                        <div className="text-sm font-medium text-gray-900">
                          {voter.email || <span className="text-gray-400">—</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {voter.phone || <span className="text-gray-400">—</span>}
                        </div>
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
