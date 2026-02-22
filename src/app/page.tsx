import Link from 'next/link';
import db from '@/lib/db';

interface Plebiscite {
  id: number;
  slug: string;
  title: string;
  description: string;
  open_date: string;
  close_date: string;
  status: 'draft' | 'open' | 'closed';
}

export const dynamic = 'force-dynamic';

async function getActivePlebiscites(): Promise<Plebiscite[]> {
  const now = new Date().toISOString();
  
  // Get plebiscites that are either:
  // 1. Status is 'open' and within date range
  // 2. Status is 'closed' (for results viewing)
  const plebiscites = db.prepare(`
    SELECT id, slug, title, description, open_date, close_date, status
    FROM plebiscites 
    WHERE (
      (status = 'open' AND open_date <= ? AND close_date > ?) OR
      status = 'closed'
    )
    ORDER BY 
      CASE WHEN status = 'open' THEN 1 ELSE 2 END,
      open_date DESC
  `).all(now, now) as Plebiscite[];

  return plebiscites;
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

function getTimeRemaining(closeDate: string): string {
  const now = new Date();
  const close = new Date(closeDate);
  const diffMs = close.getTime() - now.getTime();
  
  if (diffMs <= 0) return 'Closed';
  
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  
  if (diffDays > 0) {
    return `${diffDays} day${diffDays > 1 ? 's' : ''} remaining`;
  } else if (diffHours > 0) {
    return `${diffHours} hour${diffHours > 1 ? 's' : ''} remaining`;
  } else {
    return `${diffMinutes} minute${diffMinutes > 1 ? 's' : ''} remaining`;
  }
}

export default async function HomePage() {
  const plebiscites = await getActivePlebiscites();

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center mr-3">
                <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/>
                </svg>
              </div>
              <h1 className="text-2xl font-bold text-gray-900">Member Plebiscite Platform</h1>
            </div>
            <Link 
              href="/admin"
              className="text-sm text-gray-600 hover:text-primary transition-colors"
            >
              Admin
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Welcome Section */}
        <div className="text-center mb-12">
          <h2 className="text-4xl font-bold text-gray-900 mb-4">
            Have Your Voice Heard
          </h2>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            Participate in democratic decision-making through secure, transparent online plebiscites. 
            Your privacy is protected while ensuring election integrity.
          </p>
        </div>

        {/* Plebiscites List */}
        {plebiscites.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Active Plebiscites</h3>
            <p className="text-gray-600">
              There are currently no active plebiscites. Check back later or contact your organization for updates.
            </p>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {plebiscites.map((plebiscite) => (
              <div key={plebiscite.id} className="card hover:shadow-lg transition-shadow duration-200">
                <div className="card-header">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-gray-900 truncate">
                      {plebiscite.title}
                    </h3>
                    <span 
                      className={`badge ${
                        plebiscite.status === 'open' 
                          ? 'badge-green' 
                          : 'badge-gray'
                      }`}
                    >
                      {plebiscite.status === 'open' ? 'Open' : 'Closed'}
                    </span>
                  </div>
                </div>
                
                <div className="card-body">
                  <p className="text-gray-600 mb-4 line-clamp-3">
                    {plebiscite.description}
                  </p>
                  
                  <div className="space-y-2 text-sm">
                    <div>
                      <span className="font-medium text-gray-700">Opens:</span>
                      <span className="text-gray-600 ml-2">
                        {formatDate(plebiscite.open_date)}
                      </span>
                    </div>
                    <div>
                      <span className="font-medium text-gray-700">Closes:</span>
                      <span className="text-gray-600 ml-2">
                        {formatDate(plebiscite.close_date)}
                      </span>
                    </div>
                    {plebiscite.status === 'open' && (
                      <div>
                        <span className="font-medium text-gray-700">Status:</span>
                        <span className="text-green-600 ml-2 font-medium">
                          {getTimeRemaining(plebiscite.close_date)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="card-footer">
                  {plebiscite.status === 'open' ? (
                    <Link
                      href={`/vote/${plebiscite.slug}`}
                      className="btn-primary w-full text-center"
                    >
                      Vote Now
                    </Link>
                  ) : (
                    <Link
                      href={`/results/${plebiscite.slug}`}
                      className="btn-secondary w-full text-center"
                    >
                      View Results
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Info Section */}
        <div className="mt-16 grid gap-8 md:grid-cols-3">
          <div className="text-center">
            <div className="w-12 h-12 bg-primary rounded-lg flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h4 className="text-lg font-semibold text-gray-900 mb-2">Secure & Private</h4>
            <p className="text-gray-600">
              Your vote is encrypted and anonymous. No one can trace your vote back to you.
            </p>
          </div>
          
          <div className="text-center">
            <div className="w-12 h-12 bg-primary rounded-lg flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h4 className="text-lg font-semibold text-gray-900 mb-2">Verifiable</h4>
            <p className="text-gray-600">
              Receive a receipt code to verify your vote was counted without revealing your choices.
            </p>
          </div>
          
          <div className="text-center">
            <div className="w-12 h-12 bg-primary rounded-lg flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <h4 className="text-lg font-semibold text-gray-900 mb-2">Member-Only</h4>
            <p className="text-gray-600">
              Only verified members can participate. Email verification ensures election integrity.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}