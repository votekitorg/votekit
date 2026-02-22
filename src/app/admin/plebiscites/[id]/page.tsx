import { redirect } from 'next/navigation';
import { getAdminSessionFromCookies } from '@/lib/auth';
import AdminLayout from '@/components/AdminLayout';
import db from '@/lib/db';
import Link from 'next/link';
import PlebisciteManager from './PlebisciteManager';

interface Plebiscite {
  id: number;
  slug: string;
  title: string;
  description: string;
  info_url?: string;
  open_date: string;
  close_date: string;
  status: 'draft' | 'open' | 'closed';
  created_at: string;
}

interface Question {
  id: number;
  title: string;
  description?: string;
  type: 'yes_no' | 'multiple_choice' | 'ranked_choice';
  options: string[];
  display_order: number;
}

export const dynamic = 'force-dynamic';

async function getPlebiscite(id: string): Promise<{ plebiscite: Plebiscite; questions: Question[]; stats: any } | null> {
  const plebiscite = db.prepare('SELECT * FROM plebiscites WHERE id = ?').get(id) as Plebiscite | undefined;
  
  if (!plebiscite) {
    return null;
  }

  const questions = db.prepare(`
    SELECT * FROM questions 
    WHERE plebiscite_id = ? 
    ORDER BY display_order
  `).all(id).map((q: any) => ({
    ...q,
    options: JSON.parse(q.options)
  })) as Question[];

  // Get participation stats
  const participationCount = db.prepare('SELECT COUNT(*) as count FROM participation WHERE plebiscite_id = ?').get(id) as { count: number };
  const voterRollCount = db.prepare('SELECT COUNT(*) as count FROM voter_roll').get() as { count: number };
  
  const stats = {
    totalVotes: participationCount.count,
    totalVoters: voterRollCount.count,
    participationRate: voterRollCount.count > 0 ? (participationCount.count / voterRollCount.count * 100).toFixed(1) : '0.0'
  };

  return { plebiscite, questions, stats };
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-AU', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Australia/Brisbane'
  });
}

function getStatusInfo(plebiscite: Plebiscite) {
  const now = new Date();
  const openDate = new Date(plebiscite.open_date);
  const closeDate = new Date(plebiscite.close_date);

  if (plebiscite.status === 'draft') {
    return {
      status: 'Draft',
      color: 'gray',
      canOpen: now >= openDate,
      canClose: false,
      message: now < openDate ? 'Not yet ready to open' : 'Ready to open'
    };
  } else if (plebiscite.status === 'open') {
    return {
      status: 'Open',
      color: 'green',
      canOpen: false,
      canClose: true,
      message: now >= closeDate ? 'Voting period has ended' : 'Voting is active'
    };
  } else {
    return {
      status: 'Closed',
      color: 'red',
      canOpen: false,
      canClose: false,
      message: 'Results are available'
    };
  }
}

function getTypeDisplayName(type: string): string {
  switch (type) {
    case 'yes_no': return 'Yes/No';
    case 'multiple_choice': return 'Multiple Choice';
    case 'ranked_choice': return 'Ranked Choice (IRV)';
    default: return type;
  }
}

export default async function ManagePlebiscite({ params }: { params: { id: string } }) {
  // Check admin authentication
  const adminSession = getAdminSessionFromCookies();
  if (!adminSession) {
    redirect('/admin/login');
  }

  const data = await getPlebiscite(params.id);
  
  if (!data) {
    redirect('/admin');
  }

  const { plebiscite, questions, stats } = data;
  const statusInfo = getStatusInfo(plebiscite);

  return (
    <AdminLayout>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex justify-between items-start">
          <div>
            <div className="flex items-center space-x-2 mb-2">
              <h1 className="text-2xl font-bold text-gray-900">{plebiscite.title}</h1>
              <span className={`badge badge-${statusInfo.color}`}>
                {statusInfo.status}
              </span>
            </div>
            <p className="text-gray-600">{statusInfo.message}</p>
          </div>
          
          <div className="flex space-x-3">
            {plebiscite.status === 'open' && (
              <Link
                href={`/vote/${plebiscite.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary"
              >
                View Public Page
              </Link>
            )}
            
            {plebiscite.status === 'closed' && (
              <Link
                href={`/results/${plebiscite.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary"
              >
                View Results
              </Link>
            )}
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="card">
            <div className="card-body">
              <div className="flex items-center">
                <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center mr-3">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2-2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2h-2a2 2 0 00-2-2z" />
                  </svg>
                </div>
                <div>
                  <div className="text-2xl font-bold text-gray-900">{stats.totalVotes}</div>
                  <div className="text-sm text-gray-600">Votes Cast</div>
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-body">
              <div className="flex items-center">
                <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center mr-3">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <div>
                  <div className="text-2xl font-bold text-gray-900">{stats.totalVoters}</div>
                  <div className="text-sm text-gray-600">Eligible Voters</div>
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-body">
              <div className="flex items-center">
                <div className="w-8 h-8 bg-green-600 rounded-lg flex items-center justify-center mr-3">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                  </svg>
                </div>
                <div>
                  <div className="text-2xl font-bold text-gray-900">{stats.participationRate}%</div>
                  <div className="text-sm text-gray-600">Participation Rate</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Plebiscite Details */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Basic Information */}
          <div className="card">
            <div className="card-header">
              <h2 className="text-lg font-semibold text-gray-900">Plebiscite Information</h2>
            </div>
            <div className="card-body space-y-4">
              <div>
                <dt className="text-sm font-medium text-gray-500">Title</dt>
                <dd className="mt-1 text-sm text-gray-900">{plebiscite.title}</dd>
              </div>
              
              <div>
                <dt className="text-sm font-medium text-gray-500">Description</dt>
                <dd className="mt-1 text-sm text-gray-900 whitespace-pre-wrap">{plebiscite.description}</dd>
              </div>

              {plebiscite.info_url && (
                <div>
                  <dt className="text-sm font-medium text-gray-500">Background Information</dt>
                  <dd className="mt-1">
                    <a 
                      href={plebiscite.info_url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-sm text-primary hover:text-primary-dark"
                    >
                      {plebiscite.info_url}
                    </a>
                  </dd>
                </div>
              )}

              <div>
                <dt className="text-sm font-medium text-gray-500">Voting Period</dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {formatDate(plebiscite.open_date)} — {formatDate(plebiscite.close_date)}
                </dd>
              </div>

              <div>
                <dt className="text-sm font-medium text-gray-500">URL Slug</dt>
                <dd className="mt-1 text-sm text-gray-900 font-mono">{plebiscite.slug}</dd>
              </div>

              <div>
                <dt className="text-sm font-medium text-gray-500">Created</dt>
                <dd className="mt-1 text-sm text-gray-900">{formatDate(plebiscite.created_at)}</dd>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="card">
            <div className="card-header">
              <h2 className="text-lg font-semibold text-gray-900">Actions</h2>
            </div>
            <div className="card-body">
              <PlebisciteManager 
                plebiscite={plebiscite}
                statusInfo={statusInfo}
              />
            </div>
          </div>
        </div>

        {/* Questions */}
        <div className="card">
          <div className="card-header">
            <h2 className="text-lg font-semibold text-gray-900">Questions ({questions.length})</h2>
          </div>
          <div className="card-body">
            {questions.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                No questions configured
              </div>
            ) : (
              <div className="space-y-6">
                {questions.map((question, index) => (
                  <div key={question.id} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="text-md font-medium text-gray-900">
                          {index + 1}. {question.title}
                        </h3>
                        {question.description && (
                          <p className="text-sm text-gray-600 mt-1">{question.description}</p>
                        )}
                      </div>
                      <span className="badge badge-gray">
                        {getTypeDisplayName(question.type)}
                      </span>
                    </div>
                    
                    <div>
                      <h4 className="text-sm font-medium text-gray-700 mb-2">Options:</h4>
                      <ul className="list-disc list-inside text-sm text-gray-600 space-y-1">
                        {question.options.map((option, optionIndex) => (
                          <li key={optionIndex}>{option}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Share Information */}
        {plebiscite.status === 'open' && (
          <div className="card">
            <div className="card-header">
              <h2 className="text-lg font-semibold text-gray-900">Share This Plebiscite</h2>
            </div>
            <div className="card-body">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Public Voting URL
                  </label>
                  <div className="flex">
                    <input
                      type="text"
                      value={`${typeof window !== 'undefined' ? window.location.origin : ''}/vote/${plebiscite.slug}`}
                      readOnly
                      className="input-field flex-1 mr-2"
                    />
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(`${window.location.origin}/vote/${plebiscite.slug}`);
                      }}
                      className="btn-secondary"
                    >
                      Copy
                    </button>
                  </div>
                  <p className="text-sm text-gray-500 mt-1">
                    Share this URL on social media, email, or messaging apps for members to vote
                  </p>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h4 className="text-sm font-medium text-blue-900 mb-2">Voting Instructions for Members:</h4>
                  <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
                    <li>Click the voting URL</li>
                    <li>Enter your registered email address</li>
                    <li>Check your email for a 6-digit verification code</li>
                    <li>Enter the code to access the ballot</li>
                    <li>Vote on all questions and submit</li>
                    <li>Save your receipt codes for verification</li>
                  </ol>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}