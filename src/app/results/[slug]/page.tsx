import Link from 'next/link';
import { parseElectionCloseDate } from '@/lib/election-window';
import ResultsChart from '@/components/ResultsChart';
import CondorcetResults from '@/components/CondorcetResults';
import { getPlebisciteResults, ResultsUnavailableError, type PlebisciteResultsData } from '@/lib/results';
import ReceiptLookup from '@/components/ReceiptLookup';
import ResultsActions from '@/components/ResultsActions';
import { resultsReportFingerprint } from '@/lib/results-integrity';

type QuestionResult = PlebisciteResultsData['questions'][number];

export const dynamic = 'force-dynamic';

async function getResults(slug: string): Promise<PlebisciteResultsData | null> {
  try {
    return getPlebisciteResults(slug);
  } catch (error) {
    if (error instanceof ResultsUnavailableError) {
      return null;
    }

    console.error('Failed to load results:', error);
    return null;
  }
}

function formatDate(dateString: string): string {
  return parseElectionCloseDate(dateString).toLocaleDateString('en-AU', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Australia/Brisbane'
  });
}

function methodLabel(type: string): string {
  if (type === 'yes_no') return 'Yes / No';
  if (type === 'multiple_choice') return 'Multiple choice';
  if (type === 'ranked_choice') return 'Ranked choice · IRV';
  return 'Condorcet · Schulze';
}

function outcomeSummary(question: QuestionResult): string {
  if (question.type === 'ranked_choice') {
    if (question.results.winner) return `${question.results.winner} won after ${question.results.rounds?.length || 0} counting round${question.results.rounds?.length === 1 ? '' : 's'}.`;
    const tied = question.results.rounds?.find((round: any) => round.tiedCandidates?.length)?.tiedCandidates;
    return tied?.length ? `Tied result: ${tied.join(', ')}.` : 'No winner was determined.';
  }
  if (question.type === 'condorcet') {
    if (question.results.winner) return `${question.results.winner} is the ${question.results.condorcetWinner ? 'Condorcet winner' : 'Schulze-method winner'}.`;
    return question.results.tiedCandidates?.length ? `Tied result: ${question.results.tiedCandidates.join(', ')}.` : 'No winner was determined.';
  }
  const entries = Object.entries(question.results as Record<string, number>).sort((a, b) => b[1] - a[1]);
  if (!entries.length || question.totalVotes === 0) return 'No ballots were recorded for this question.';
  const leaders = entries.filter(([, count]) => count === entries[0][1]);
  if (leaders.length > 1) return `Tied result: ${leaders.map(([name]) => name).join(', ')}.`;
  const denominator = question.type === 'multiple_choice' ? entries.reduce((sum, [, count]) => sum + count, 0) : question.totalVotes;
  return `${entries[0][0]} received the highest count with ${entries[0][1]} (${denominator > 0 ? ((entries[0][1] / denominator) * 100).toFixed(1) : '0.0'}%).`;
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

      {!results.winner && results.rounds.some((round: any) => round.tiedCandidates?.length > 0) && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <h4 className="text-lg font-semibold text-yellow-900">Tie reported</h4>
          <p className="text-yellow-800">
            {results.rounds.find((round: any) => round.tiedCandidates?.length > 0)?.tiedCandidates.join(', ')} are tied. This result needs to be resolved under the election rules.
          </p>
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
                {round.tiedCandidates?.length > 0 && (
                  <span className="text-sm text-yellow-700">
                    Tied: {round.tiedCandidates.join(', ')}
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
                            {isWinner && ' (winner)'}
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

function formatBallot(ballot: QuestionResult['publicBallots'][number]['ballot']): string {
  if (ballot.choice) return ballot.choice;
  if (ballot.choices) return ballot.choices.join(', ');
  if (ballot.preferences) return ballot.preferences.join(' > ');
  return 'No recorded selection';
}

function PublicBallotsDisplay({ ballots }: { ballots: QuestionResult['publicBallots'] }) {
  if (!ballots || ballots.length === 0) return null;

  return (
    <div className="mt-6 border-t border-gray-200 pt-6">
      <h4 className="text-md font-semibold text-gray-900 mb-2">Anonymous Ballot Verification</h4>
      <p className="text-sm text-gray-600 mb-4">
        Find your saved receipt code below to confirm your ballot was included and recorded correctly. Receipt codes are published with ballots only, not with voter identities.
      </p>
      <div className="overflow-x-auto border border-gray-200 rounded-lg">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-gray-700">Receipt Code</th>
              <th className="px-4 py-3 text-left font-medium text-gray-700">Published Ballot</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-100">
            {ballots.map((ballot) => (
              <tr key={ballot.receiptCode}>
                <td className="px-4 py-3 font-mono text-xs text-gray-800 whitespace-nowrap">{ballot.receiptCode}</td>
                <td className="px-4 py-3 text-gray-900">{formatBallot(ballot.ballot)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default async function ResultsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await getResults(slug);

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
            This election may not exist, or results may not yet be published.
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
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center mr-3">
                <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/>
                </svg>
              </div>
              <div>
                <h1 className="text-lg font-semibold text-gray-900">Election Results</h1>
                <p className="text-sm text-gray-600">VoteKit</p>
              </div>
            </div>
            
            <ResultsActions slug={slug} />
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {/* Plebiscite Information */}
        <div className="mb-8">
          <div className="text-center mb-8">
            <div className="mb-4 inline-flex items-center rounded-full border border-green-200 bg-green-50 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-green-800">
              Closed · Final result published
            </div>
            <h2 className="text-3xl font-bold tracking-tight text-gray-900 mb-4 sm:text-4xl">
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
          <div className="mx-auto mb-10 grid max-w-4xl grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ['Ballots cast', participation.totalVotes.toLocaleString()],
              ['Eligible credentials', participation.eligibleCredentials.toLocaleString()],
              ['Participation', participation.participationRate === null ? '—' : `${participation.participationRate.toFixed(1)}%`],
              ['Questions', questions.length.toLocaleString()]
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-gray-200 bg-white p-5 text-center shadow-sm">
                <div className="text-2xl font-bold text-primary sm:text-3xl">{value}</div>
                <div className="mt-1 text-xs font-medium uppercase tracking-wide text-gray-500">{label}</div>
              </div>
            ))}
          </div>

          <div className="mx-auto mb-10 max-w-4xl overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-200 bg-gray-50 px-5 py-3">
              <h3 className="font-semibold text-gray-900">Result at a glance</h3>
            </div>
            <div className="divide-y divide-gray-100">
              {questions.map((question, index) => (
                <div key={question.id} className="grid gap-2 px-5 py-4 sm:grid-cols-[2rem_1fr_auto] sm:items-center">
                  <div className="font-mono text-sm font-bold text-primary">{String(index + 1).padStart(2, '0')}</div>
                  <div>
                    <div className="font-semibold text-gray-900">{question.title}</div>
                    <div className="mt-1 text-sm text-gray-600">{outcomeSummary(question)}</div>
                  </div>
                  <span className="badge badge-gray w-fit">{methodLabel(question.type)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Results */}
        {plebiscite.privacyMode === 'encrypted' && <ReceiptLookup slug={slug} />}

        <div className="space-y-12">
          {questions.length === 0 ? (
            <div className="text-center py-8">
              <div className="text-gray-500">No questions found for this election</div>
            </div>
          ) : (
            questions.map((question, index) => (
              <div key={question.id} className="results-question">
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
                      <PublicBallotsDisplay ballots={question.publicBallots} />
                    </div>
                  </div>
                ) : question.type === 'condorcet' ? (
                  <div className="space-y-0">
                    <CondorcetResults
                      title={`${index + 1}. ${question.title}`}
                      results={question.results}
                      options={question.options}
                    />
                    <div className="card mt-4">
                      <div className="card-body">
                        <PublicBallotsDisplay ballots={question.publicBallots} />
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <ResultsChart
                      data={question.results}
                      type={question.type}
                      title={`${index + 1}. ${question.title}`}
                      totalVotes={question.totalVotes}
                    />
                    <div className="card mt-4">
                      <div className="card-body">
                      <PublicBallotsDisplay ballots={question.publicBallots} />
                      </div>
                    </div>
                  </>
                )}
              </div>
            ))
          )}
        </div>

        {/* Footer Information */}
        <div className="mt-16 overflow-hidden rounded-2xl border border-emerald-200 bg-emerald-50">
          <div className="grid gap-8 p-6 sm:p-8 lg:grid-cols-[1.4fr_1fr]">
            <div>
              <h4 className="text-xl font-semibold text-emerald-950">Verification and transparency</h4>
              <div className="mt-3 space-y-3 text-sm leading-6 text-emerald-900">
                <p>Ballots are counted anonymously. Participation records establish that a credential voted, but are not connected to the published ballot contents.</p>
                <p>Voters can use their private receipt code to confirm that their ballot is included. Public ballot details remain subject to VoteKit’s minimum privacy threshold.</p>
                <p>Ranked-choice counts use instant-runoff rounds. Condorcet counts use head-to-head comparisons and the Schulze strongest-path method when necessary. VoteKit reports unresolved ties rather than choosing an arbitrary winner.</p>
              </div>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-white/80 p-5">
              <div className="text-xs font-semibold uppercase tracking-wider text-emerald-800">Report fingerprint · SHA-256</div>
              <div className="mt-3 break-all font-mono text-xs leading-5 text-gray-700">{resultsReportFingerprint(data)}</div>
              <div className="mt-4 text-xs text-gray-600">This identifies the exact published result dataset used by the online page, CSV and PDF report.</div>
            </div>
          </div>
          {data.encryptedAudit && (
            <div className="border-t border-emerald-200 bg-white/60 px-6 py-5 sm:px-8">
              <div className="text-sm font-semibold text-emerald-950">Encrypted ballot audit</div>
              <div className="mt-2 grid gap-2 font-mono text-xs text-gray-600 sm:grid-cols-2">
                <div className="break-all">Manifest: {data.encryptedAudit.manifestHash}</div>
                <div className="break-all">Published output: {data.encryptedAudit.outputHash}</div>
              </div>
            </div>
          )}
        </div>

        <div className="mt-8 flex justify-center print:hidden">
          <ResultsActions slug={slug} />
        </div>
      </main>
    </div>
  );
}
