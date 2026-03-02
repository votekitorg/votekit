'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
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
  participation: { totalVotes: number };
  questions: QuestionResult[];
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
    return <div className="text-center py-8 text-gray-500">No results available</div>;
  }

  return (
    <div className="space-y-6">
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
                  .map(([candidate, votes]: any) => {
                    const totalVotes = Object.values(round.votes).reduce((sum: number, count: any) => sum + count, 0);
                    const percentage = totalVotes > 0 ? ((votes / totalVotes) * 100).toFixed(1) : '0.0';
                    const isWinner = round.winner === candidate;
                    const isEliminated = round.eliminated.includes(candidate);
                    return (
                      <div key={candidate} className="flex justify-between items-center">
                        <div className="flex items-center">
                          <span className={`w-3 h-3 rounded-full mr-2 ${isWinner ? 'bg-green-500' : isEliminated ? 'bg-red-500' : 'bg-gray-400'}`}></span>
                          <span className={`font-medium ${isWinner ? 'text-green-900' : isEliminated ? 'text-red-700' : 'text-gray-900'}`}>
                            {candidate}{isWinner && ' \u{1F3C6}'}
                          </span>
                        </div>
                        <span className="text-sm text-gray-600">{votes} votes ({percentage}%)</span>
                      </div>
                    );
                  })}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-gray-50 rounded-lg p-4">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div><span className="font-medium text-gray-700">Total Votes:</span><span className="ml-2 text-gray-900">{results.totalVotes}</span></div>
          <div><span className="font-medium text-gray-700">Exhausted Ballots:</span><span className="ml-2 text-gray-900">{results.exhaustedBallots}</span></div>
          <div><span className="font-medium text-gray-700">Rounds:</span><span className="ml-2 text-gray-900">{results.rounds.length}</span></div>
          <div><span className="font-medium text-gray-700">Method:</span><span className="ml-2 text-gray-900">Instant Runoff Voting (IRV)</span></div>
        </div>
      </div>
    </div>
  );
}

export default function ResultsPage({ params }: { params: { slug: string } }) {
  const [data, setData] = useState<ResultsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  useEffect(() => {
    const fetchResults = async () => {
      try {
        const url = token 
          ? `/api/results/${params.slug}?token=${token}`
          : `/api/results/${params.slug}`;
        const response = await fetch(url, { credentials: 'include' });
        
        if (response.status === 403) {
          const result = await response.json();
          setError(result.error || 'You do not have permission to view these results.');
          return;
        }
        
        if (!response.ok) {
          setError('Results are not available.');
          return;
        }

        setData(await response.json());
      } catch (err) {
        setError('Failed to load results.');
      } finally {
        setIsLoading(false);
      }
    };
    fetchResults();
  }, [params.slug, token]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex justify-center items-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-gray-600">Loading results...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gray-50 flex justify-center items-center">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 bg-red-200 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m0 0v2m0-2h2m-2 0H10m11-7a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Results Not Available</h2>
          <p className="text-gray-600 mb-4">{error || 'This election may not exist, or results may not yet be published.'}</p>
          <Link href="/" className="btn-primary">Return Home</Link>
        </div>
      </div>
    );
  }

  const { plebiscite, participation, questions } = data;

  return (
    <div className="min-h-screen bg-gray-50">
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
                <h1 className="text-lg font-semibold text-gray-900">Election Results</h1>
                <p className="text-sm text-gray-600">VoteKit Election Platform</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <a href={`/api/results/${params.slug}?format=csv${token ? '&token=' + token : ''}`} className="btn-secondary">
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Download CSV
              </a>
              <Link href="/" className="btn-primary">Home</Link>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <div className="text-center mb-6">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">{plebiscite.title}</h2>
            <div className="flex justify-center space-x-4 text-sm text-gray-600 mb-4">
              <span>Opened: {formatDate(plebiscite.open_date)}</span>
              <span>&bull;</span>
              <span>Closed: {formatDate(plebiscite.close_date)}</span>
            </div>
            <div className="max-w-3xl mx-auto">
              <p className="text-gray-700 whitespace-pre-wrap">{plebiscite.description}</p>
            </div>
          </div>

          <div className="max-w-md mx-auto mb-8">
            <div className="card">
              <div className="card-body text-center">
                <div className="text-3xl font-bold text-primary mb-2">{participation.totalVotes}</div>
                <div className="text-sm text-gray-600">Total Votes Cast</div>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-12">
          {questions.length === 0 ? (
            <div className="text-center py-8"><div className="text-gray-500">No questions found</div></div>
          ) : (
            questions.map((question, index) => (
              <div key={question.id}>
                {question.type === 'ranked_choice' ? (
                  <div className="card">
                    <div className="card-header">
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="text-lg font-semibold text-gray-900">{index + 1}. {question.title}</h3>
                          {question.description && <p className="text-sm text-gray-600 mt-1">{question.description}</p>}
                          <div className="flex items-center mt-2">
                            <span className="badge badge-gray text-xs">Ranked Choice (IRV)</span>
                            <span className="text-xs text-gray-500 ml-2">{question.totalVotes} vote{question.totalVotes !== 1 ? 's' : ''}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="card-body"><IRVResultsDisplay results={question.results} /></div>
                  </div>
                ) : question.type === 'condorcet' ? (
                  <CondorcetResults title={`${index + 1}. ${question.title}`} results={question.results} options={question.options} />
                ) : (
                  <ResultsChart data={question.results} type={question.type} title={`${index + 1}. ${question.title}`} totalVotes={question.totalVotes} />
                )}
              </div>
            ))
          )}
        </div>

        <div className="mt-16 text-center">
          <div className="max-w-2xl mx-auto">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
              <h4 className="text-lg font-semibold text-blue-900 mb-3">About These Results</h4>
              <div className="text-sm text-blue-800 space-y-2">
                <p>All votes were cast securely and anonymously. Results are final and preserved for audit purposes.</p>
                <p>For ranked choice questions, Instant Runoff Voting (IRV) was used. For Condorcet questions, head-to-head pairwise comparison was used with the Schulze method resolving cycles.</p>
                <p>Individual votes cannot be traced back to electors while maintaining full verifiability through receipt codes.</p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
