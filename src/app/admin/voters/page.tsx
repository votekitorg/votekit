'use client';

import { useState, useEffect, useRef } from 'react';
import AdminLayout from '@/components/AdminLayout';

interface Voter {
  id: number;
  email: string;
  added_at: string;
}

export default function ManageVoters() {
  const [voters, setVoters] = useState<Voter[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  // Add single voter
  const [newEmail, setNewEmail] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  
  // CSV upload
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{
    inserted: number;
    duplicates: number;
    invalid: number;
  } | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchVoters = async () => {
    try {
      const response = await fetch('/api/admin/voters');
      const result = await response.json();
      
      if (response.ok) {
        setVoters(result.voters);
      } else {
        setError(result.error || 'Failed to fetch voters');
      }
    } catch (error) {
      setError('Failed to fetch voters');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchVoters();
  }, []);

  const addSingleVoter = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newEmail.trim()) {
      setError('Email address is required');
      return;
    }

    setIsAdding(true);
    setError('');
    setSuccess('');

    try {
      const response = await fetch('/api/admin/voters', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'add',
          email: newEmail.trim()
        }),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        setSuccess('Voter added successfully');
        setNewEmail('');
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
      
      // Parse CSV - simple parsing, assumes one email per line or comma-separated
      const emails = text
        .split(/[\n\r,;]/)
        .map(line => line.trim())
        .filter(line => line && line.includes('@'))
        .map(line => {
          // Handle cases where email might be in quotes or have extra text
          const match = line.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
          return match ? match[1] : line;
        });

      if (emails.length === 0) {
        setError('No valid email addresses found in the file');
        return;
      }

      // Upload emails
      const response = await fetch('/api/admin/voters', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'upload',
          emails: emails
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
    if (!confirm('Are you sure you want to remove this voter?')) {
      return;
    }

    try {
      const response = await fetch(`/api/admin/voters?id=${id}`, {
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
    if (!confirm('Are you sure you want to clear ALL voters? This action cannot be undone.')) {
      return;
    }

    try {
      const response = await fetch('/api/admin/voters?action=clear-all', {
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

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="flex justify-center items-center h-64">
          <div className="spinner w-8 h-8"></div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Manage Voter Roll</h1>
          <p className="text-gray-600">
            Upload and manage member email addresses who are eligible to vote in plebiscites
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="card">
            <div className="card-body">
              <div className="flex items-center">
                <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center mr-3">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <div>
                  <div className="text-2xl font-bold text-gray-900">{voters.length}</div>
                  <div className="text-sm text-gray-600">Registered Voters</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Add Methods */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Add Single Voter */}
          <div className="card">
            <div className="card-header">
              <h2 className="text-lg font-semibold text-gray-900">Add Single Voter</h2>
            </div>
            <div className="card-body">
              <form onSubmit={addSingleVoter} className="space-y-4">
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
                    required
                  />
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
              <h2 className="text-lg font-semibold text-gray-900">Upload CSV</h2>
            </div>
            <div className="card-body">
              <div className="space-y-4">
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
                    CSV file with email addresses (one per line or comma-separated)
                  </p>
                </div>

                {isUploading && (
                  <div className="alert-info">
                    <div className="spinner mr-2"></div>
                    Processing file...
                  </div>
                )}

                {uploadResult && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <h4 className="text-sm font-medium text-green-900 mb-2">Upload Results:</h4>
                    <ul className="text-sm text-green-800 space-y-1">
                      <li>• {uploadResult.inserted} new voters added</li>
                      <li>• {uploadResult.duplicates} duplicate emails skipped</li>
                      <li>• {uploadResult.invalid} invalid entries rejected</li>
                    </ul>
                  </div>
                )}

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h4 className="text-sm font-medium text-blue-900 mb-2">CSV Format:</h4>
                  <div className="text-sm text-blue-800">
                    <p>Example CSV content:</p>
                    <pre className="mt-2 text-xs bg-white p-2 rounded border">
{`member1@example.com
member2@example.com
member3@example.com`}
                    </pre>
                    <p className="mt-2">Or comma-separated: <code>email1@domain.com, email2@domain.com</code></p>
                  </div>
                </div>
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
              <h2 className="text-lg font-semibold text-gray-900">
                Registered Voters ({voters.length})
              </h2>
              {voters.length > 0 && (
                <button
                  onClick={clearAllVoters}
                  className="btn-danger"
                >
                  Clear All
                </button>
              )}
            </div>
          </div>
          <div className="card-body p-0">
            {voters.length === 0 ? (
              <div className="text-center py-8">
                <div className="w-12 h-12 bg-gray-200 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">No Voters Registered</h3>
                <p className="text-gray-600">
                  Add voters using the forms above to get started.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Email Address
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Added
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {voters.map((voter) => (
                      <tr key={voter.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">{voter.email}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-500">{formatDate(voter.added_at)}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
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
    </AdminLayout>
  );
}