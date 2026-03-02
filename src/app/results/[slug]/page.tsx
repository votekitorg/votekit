import { redirect } from 'next/navigation';
import Link from 'next/link';
import ResultsChart from '@/components/ResultsChart';
import CondorcetResults from '@/components/CondorcetResults';

interface Plebiscite {
  id: number;
  slug: string;
  title: string;
  description: string;
  info_url?: string;
  open_date: string;
  close_date: string;
  status: string;
}

interface QuestionResult {
  id: number;
  title: string;
  description?: string;
  type: 'yes_no' | 'multiple_choice' | 'ranked_choice' | 'condorcet';
  options: string[];
  totalVotes: number;
  results: any;
}

interface ResultsData {
  plebiscite: Plebiscite;
  participation: {
    totalVotes: number;
  };
  questions: QuestionResult[];
}

export const dynamic = 'force-dynamic';

async function getResults(slug: string): Promise<ResultsData | null> {
  try {
    const response = await fetch(`${process.env.VERCEL_URL ? 'https://' + process.env.VERCEL_URL : 'http://localhost:3006'}/api/results/${slug}`, {
      cache: 'no-store'
    });

    if (!response.ok) {
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error('Failed to fetch results:', error);
    return null;
  }
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

function IRVResultsDisplay({ results }: { results: any }) {
  if (!results.rounds || results.rounds.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        No results available
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Winner */}
      {results.winner && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-center">
            <svg className="w-6 h-6 text-green-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <h4 className="text-lg font-semibold text-green-900">Winner</h4>
              <p className="text-green-800">{results.winner}</p>
            </div>
          </div>
        </div>
      )}

      {/* Round by Round */}
      <div>
        <h4 className="text-md font-semibold text-gray-900 mb-4">Round-by-Round Results</h4>
        <div className="space-y-4">
          {results.rounds.map((round: any, index: number) => (
            <div key={index} className="border border-gray-200 rounded-lg p-4">
              <div className="flex justify-between items-center mb-3">
                <h5 className="font-medium text-gray-900">Round {round.round}</h5>
                {round.eliminated.length > 0 && (
                  <span className="text-sm text-red-600">
                    Eliminated: {round.eliminated.join(', ')}
                  </span>
                )}
              </div>
              
              <div className="space-y-2">
                {Object.entries(round.votes)
                  .sort(([, a]: any, [, b]: any) => b - a)
                  .map(([candidate, votes]: any, idx: number) => {
                    const totalVotes = Object.values(round.votes).reduce((sum: number, count: any) => sum + count, 0);
                    const percentage = totalVotes > 0 ? ((votes / totalVotes) * 100).toFixed(1) : '0.0';
                    const isWinner = round.winner === candidate;
                    const isEliminated = round.eliminated.includes(candidate);
                    
                    return (
                      <div key={candidate} className="flex justify-between items-center">
                        <div className="flex items-center">
                          <span className={`w-3 h-3 rounded-full mr-2 ${
                            isWinner ? 'bg-green-500' :
                            isEliminated ? 'bg-red-500' : 'bg-gray-400'
                          }`}></span>
                          <span className={`font-medium ${
                            isWinner ? 'text-green-900' :
                            isEliminated ? 'text-red-700' : 'text-gray-900'
                          }`}>
                            {candidate}
                            {isWinner && ' 🏆'}
                          </span>
                        </div>
                        <span className="text-sm text-gray-600">
                          {votes} votes ({percentage}%)
                        </span>
                      </div>
                    );
                  })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Summary */}
      <div className="bg-gray-50 rounded-lg p-4">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="font-medium text-gray-700">Total Votes:</span>
            <span className="ml-2 text-gray-900">{results.totalVotes}</span>
          </div>
          <div>
            <span className="font-medium text-gray-700">Exhausted Ballots:</span>
            <span className="ml-2 text-gray-900">{results.exhaustedBallots}</span>
          </div>
          <div>
            <span className="font-medium text-gray-700">Rounds:</span>
            <span className="ml-2 text-gray-900">{results.rounds.length}</span>
          </div>
          <div>
            <span className="font-medium text-gray-700">Method:</span>
            <span className="ml-2 text-gray-900">Instant Runoff Voting (IRV)</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default async function ResultsPage({ params }: { params: { slug: string } }) {
  const data = await getResults(params.slug);

  if (!data) {
    return (
      <div className="min-h-screen bg-gray-50 flex justify-center items-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-red-200 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Results Not Available</h2>
          <p className="text-gray-600 mb-4">
            This plebiscite may not exist, or results may not yet be published.
          </p>
          <Link href="/" className="btn-primary">
            Return Home
          </Link>
        </div>
      </div>
    );
  }

  const { plebiscite, participation, questions } = data;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center mr-3">
                <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/>
                </svg>
              </div>
              <div>
                <h1 className="text-lg font-semibold text-gray-900">Plebiscite Results</h1>
                <p className="text-sm text-gray-600">VoteKit Election Platform</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <a
                href={`/api/results/${params.slug}?format=csv`}
                className="btn-secondary"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Download CSV
              </a>
              <Link href="/" className="btn-primary">
                View More Plebiscites
              </Link>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Plebiscite Information */}
        <div className="mb-8">
          <div className="text-center mb-6">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">
              {plebiscite.title}
            </h2>
            <div className="flex justify-center space-x-4 text-sm text-gray-600 mb-4">
              <span>Opened: {formatDate(plebiscite.open_date)}</span>
              <span>•</span>
              <span>Closed: {formatDate(plebiscite.close_date)}</span>
            </div>
            <div className="max-w-3xl mx-auto">
              <p className="text-gray-700 whitespace-pre-wrap">
                {plebiscite.description}
              </p>
            </div>
          </div>

          {/* Participation Stats */}
          <div className="max-w-md mx-auto mb-8">
            <div className="card">
              <div className="card-body text-center">
                <div className="text-3xl font-bold text-primary mb-2">
                  {participation.totalVotes}
                </div>
                <div className="text-sm text-gray-600">
                  Total Votes Cast
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Results */}
        <div className="space-y-12">
          {questions.length === 0 ? (
            <div className="text-center py-8">
              <div className="text-gray-500">No questions found for this plebiscite</div>
            </div>
          ) : (
            questions.map((question, index) => (
              <div key={question.id}>
                {question.type === 'ranked_choice' ? (
                  <div className="card">
                    <div className="card-header">
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="text-lg font-semibold text-gray-900">
                            {index + 1}. {question.title}
                          </h3>
                          {question.description && (
                            <p className="text-sm text-gray-600 mt-1">{question.description}</p>
                          )}
                          <div className="flex items-center mt-2">
                            <span className="badge badge-gray text-xs">
                              Ranked Choice (IRV)
                            </span>
                            <span className="text-xs text-gray-500 ml-2">
                              {question.totalVotes} vote{question.totalVotes !== 1 ? 's' : ''}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="card-body">
                      <IRVResultsDisplay results={question.results} />
                    </div>
                  </div>
                ) : question.type === 'condorcet' ? (
                  <CondorcetResults
                    title={`${index + 1}. ${question.title}`}
                    results={question.results}
                    options={question.options}
                  />
                ) : (
                  <ResultsChart
                    data={question.results}
                    type={question.type}
                    title={`${index + 1}. ${question.title}`}
                    totalVotes={question.totalVotes}
                  />
                )}
              </div>
            ))
          )}
        </div>

        {/* Footer Information */}
        <div className="mt-16 text-center">
          <div className="max-w-2xl mx-auto">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
              <h4 className="text-lg font-semibold text-blue-900 mb-3">About These Results</h4>
              <div className="text-sm text-blue-800 space-y-2">
                <p>
                  All votes were cast securely and anonymously. Results are final and have been preserved for audit purposes.
                </p>
                <p>
                  For ranked choice questions, Instant Runoff Voting (IRV) was used to determine winners through elimination rounds. For Condorcet questions, head-to-head pairwise comparison was used, with the Schulze method resolving any cycles.
                </p>
                <p>
                  Individual votes cannot be traced back to voters while maintaining full verifiability through receipt codes.
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}