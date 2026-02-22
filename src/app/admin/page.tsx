import { redirect } from 'next/navigation';
import { getAdminSessionFromCookies } from '@/lib/auth';
import AdminLayout from '@/components/AdminLayout';
import db from '@/lib/db';
import Link from 'next/link';

interface Plebiscite {
  id: number;
  slug: string;
  title: string;
  description: string;
  open_date: string;
  close_date: string;
  status: 'draft' | 'open' | 'closed';
  created_at: string;
  vote_count: number;
  question_count: number;
}

export const dynamic = 'force-dynamic';

async function getDashboardData() {
  // Get plebiscites with stats
  const plebiscites = db.prepare(`
    SELECT 
      p.*,
      (SELECT COUNT(*) FROM participation WHERE plebiscite_id = p.id) as vote_count,
      (SELECT COUNT(*) FROM questions WHERE plebiscite_id = p.id) as question_count
    FROM plebiscites p
    ORDER BY p.created_at DESC
    LIMIT 10
  `).all() as Plebiscite[];

  // Get overall stats
  const totalPlebiscites = db.prepare('SELECT COUNT(*) as count FROM plebiscites').get() as { count: number };
  const totalVoters = db.prepare('SELECT COUNT(*) as count FROM voter_roll').get() as { count: number };
  const totalVotes = db.prepare('SELECT COUNT(*) as count FROM participation').get() as { count: number };
  const activePlebiscites = db.prepare("SELECT COUNT(*) as count FROM plebiscites WHERE status = 'open'").get() as { count: number };

  return {
    plebiscites,
    stats: {
      totalPlebiscites: totalPlebiscites.count,
      totalVoters: totalVoters.count,
      totalVotes: totalVotes.count,
      activePlebiscites: activePlebiscites.count
    }
  };
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-AU', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Australia/Brisbane'
  });
}

function getStatusBadge(status: string) {
  switch (status) {
    case 'draft':
      return <span className="badge badge-gray">Draft</span>;
    case 'open':
      return <span className="badge badge-green">Open</span>;
    case 'closed':
      return <span className="badge badge-red">Closed</span>;
    default:
      return <span className="badge badge-gray">{status}</span>;
  }
}

export default async function AdminDashboard() {
  // Check admin authentication
  const adminSession = getAdminSessionFromCookies();
  if (!adminSession) {
    redirect('/admin/login');
  }

  const { plebiscites, stats } = await getDashboardData();

  return (
    <AdminLayout>
      <div className="space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-600">Overview of your plebiscites and voting activity</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="card">
            <div className="card-body">
              <div className="flex items-center">
                <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center mr-3">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                  </svg>
                </div>
                <div>
                  <div className="text-2xl font-bold text-gray-900">{stats.totalPlebiscites}</div>
                  <div className="text-sm text-gray-600">Total Plebiscites</div>
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-body">
              <div className="flex items-center">
                <div className="w-8 h-8 bg-green-600 rounded-lg flex items-center justify-center mr-3">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <div>
                  <div className="text-2xl font-bold text-gray-900">{stats.activePlebiscites}</div>
                  <div className="text-sm text-gray-600">Active Plebiscites</div>
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-body">
              <div className="flex items-center">
                <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center mr-3">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
                  </svg>
                </div>
                <div>
                  <div className="text-2xl font-bold text-gray-900">{stats.totalVoters}</div>
                  <div className="text-sm text-gray-600">Registered Voters</div>
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-body">
              <div className="flex items-center">
                <div className="w-8 h-8 bg-purple-600 rounded-lg flex items-center justify-center mr-3">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2h-2a2 2 0 00-2-2z" />
                  </svg>
                </div>
                <div>
                  <div className="text-2xl font-bold text-gray-900">{stats.totalVotes}</div>
                  <div className="text-sm text-gray-600">Total Votes Cast</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Link href="/admin/plebiscites/new" className="card hover:shadow-lg transition-shadow duration-200">
            <div className="card-body text-center">
              <div className="w-12 h-12 bg-primary rounded-lg flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Create Plebiscite</h3>
              <p className="text-gray-600">Set up a new plebiscite with questions and voting options</p>
            </div>
          </Link>

          <Link href="/admin/voters" className="card hover:shadow-lg transition-shadow duration-200">
            <div className="card-body text-center">
              <div className="w-12 h-12 bg-blue-600 rounded-lg flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Manage Voters</h3>
              <p className="text-gray-600">Upload voter roll and manage member email addresses</p>
            </div>
          </Link>

          <div className="card">
            <div className="card-body text-center">
              <div className="w-12 h-12 bg-gray-400 rounded-lg flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2-2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2h-2a2 2 0 00-2-2z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">View Reports</h3>
              <p className="text-gray-600">Analyze participation and results across all plebiscites</p>
            </div>
          </div>
        </div>

        {/* Recent Plebiscites */}
        <div className="card">
          <div className="card-header">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-semibold text-gray-900">Recent Plebiscites</h2>
              <Link href="/admin/plebiscites/new" className="btn-primary">
                Create New
              </Link>
            </div>
          </div>
          <div className="card-body p-0">
            {plebiscites.length === 0 ? (
              <div className="text-center py-8">
                <div className="text-gray-500 mb-4">No plebiscites created yet</div>
                <Link href="/admin/plebiscites/new" className="btn-primary">
                  Create Your First Plebiscite
                </Link>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Title
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Questions
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Votes
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Closes
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {plebiscites.map((plebiscite) => (
                      <tr key={plebiscite.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div>
                            <div className="text-sm font-medium text-gray-900">{plebiscite.title}</div>
                            <div className="text-sm text-gray-500 truncate max-w-xs">
                              {plebiscite.description}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {getStatusBadge(plebiscite.status)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {plebiscite.question_count}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {plebiscite.vote_count}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {formatDate(plebiscite.close_date)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                          <Link
                            href={`/admin/plebiscites/${plebiscite.id}`}
                            className="text-primary hover:text-primary-dark"
                          >
                            Manage
                          </Link>
                          {plebiscite.status === 'open' && (
                            <Link
                              href={`/vote/${plebiscite.slug}`}
                              className="text-blue-600 hover:text-blue-800"
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              View
                            </Link>
                          )}
                          {plebiscite.status === 'closed' && (
                            <Link
                              href={`/results/${plebiscite.slug}`}
                              className="text-purple-600 hover:text-purple-800"
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              Results
                            </Link>
                          )}
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