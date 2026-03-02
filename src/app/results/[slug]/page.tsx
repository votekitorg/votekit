'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

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

interface IRVTransfer {
  fromCandidate: string;
  transfers: { [toCandidate: string]: number };
  exhausted: number;
}

interface IRVRound {
  round: number;
  candidates: string[];
  votes: { [candidate: string]: number };
  previousVotes?: { [candidate: string]: number };
  eliminated: string[];
  winner?: string;
  transfers?: IRVTransfer;
  exhaustedThisRound?: number;
  totalExhausted?: number;
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

// ============================================================================
// VOTING METHOD BADGES
// ============================================================================

function MethodBadge({ type, preferentialType }: { type: string; preferentialType?: string }) {
  const labels: { [key: string]: string } = {
    'yes_no': 'Yes/No',
    'multiple_choice': 'Multiple Choice',
    'ranked_choice': 'Ranked Choice (IRV)',
    'condorcet': 'Condorcet'
  };
  
  return (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 border border-gray-200">
      {labels[type] || type}
    </span>
  );
}

// ============================================================================
// HORIZONTAL BAR COMPONENT
// ============================================================================

interface HorizontalBarProps {
  label: string;
  value: number;
  total: number;
  maxValue: number;
  isWinner?: boolean;
  isEliminated?: boolean;
  highlight?: boolean;
  transferReceived?: number;
  showTransferBreakdown?: boolean;
}

function HorizontalBar({ 
  label, 
  value, 
  total, 
  maxValue, 
  isWinner = false, 
  isEliminated = false,
  highlight = false,
  transferReceived = 0,
  showTransferBreakdown = false
}: HorizontalBarProps) {
  const percentage = total > 0 ? (value / total) * 100 : 0;
  const barWidth = maxValue > 0 ? (value / maxValue) * 100 : 0;
  const carriedWidth = showTransferBreakdown && transferReceived > 0 && maxValue > 0 
    ? ((value - transferReceived) / maxValue) * 100 
    : barWidth;
  const transferWidth = showTransferBreakdown && transferReceived > 0 && maxValue > 0
    ? (transferReceived / maxValue) * 100
    : 0;

  return (
    <div className={`py-3 ${isEliminated ? 'opacity-60' : ''}`}>
      <div className="flex justify-between items-center mb-1.5">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className={`font-medium truncate ${isWinner ? 'text-green-800' : isEliminated ? 'text-red-700 line-through' : 'text-gray-900'}`}>
            {label}
          </span>
          {isWinner && (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-green-100 text-green-800 whitespace-nowrap">
              Winner
            </span>
          )}
          {isEliminated && (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-red-100 text-red-700 whitespace-nowrap">
              Eliminated
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 ml-4">
          <span className="text-sm font-semibold text-gray-900 tabular-nums">{value.toLocaleString()}</span>
          <span className="text-sm text-gray-500 tabular-nums w-16 text-right">{percentage.toFixed(1)}%</span>
        </div>
      </div>
      <div className="h-6 bg-gray-100 rounded-full overflow-hidden relative">
        {showTransferBreakdown && transferReceived > 0 ? (
          <>
            <div
              className={`absolute h-full rounded-l-full transition-all duration-500 ${isWinner ? 'bg-green-600' : isEliminated ? 'bg-red-400' : 'bg-primary'}`}
              style={{ width: `${carriedWidth}%` }}
            />
            <div
              className={`absolute h-full transition-all duration-500 ${isWinner ? 'bg-green-400' : 'bg-emerald-300'}`}
              style={{ left: `${carriedWidth}%`, width: `${transferWidth}%` }}
              title={`+${transferReceived} transferred`}
            />
          </>
        ) : (
          <div
            className={`h-full rounded-full transition-all duration-500 ${isWinner ? 'bg-green-600' : isEliminated ? 'bg-red-400' : highlight ? 'bg-green-600' : 'bg-primary'}`}
            style={{ width: `${barWidth}%` }}
          />
        )}
        {/* Majority line for IRV (50% mark) */}
      </div>
    </div>
  );
}

// ============================================================================
// YES/NO RESULTS
// ============================================================================

function YesNoResults({ question }: { question: QuestionResult }) {
  const results = question.results as { [key: string]: number };
  const total = Object.values(results).reduce((sum, count) => sum + count, 0);
  const sortedResults = Object.entries(results).sort(([, a], [, b]) => b - a);
  const maxValue = Math.max(...Object.values(results));
  
  const [winner, winnerVotes] = sortedResults[0] || ['', 0];
  const [loser, loserVotes] = sortedResults[1] || ['', 0];
  const isTie = winnerVotes === loserVotes;
  const winnerPct = total > 0 ? ((winnerVotes / total) * 100).toFixed(1) : '0';
  
  // Determine if it's a yes/no style question
  const yesOptions = ['yes', 'in favour', 'approve', 'accept', 'for'];
  const noOptions = ['no', 'against', 'reject', 'oppose'];
  const isYesWinner = yesOptions.some(y => winner.toLowerCase().includes(y));
  const isNoWinner = noOptions.some(n => winner.toLowerCase().includes(n));

  let summaryText = '';
  if (isTie) {
    summaryText = 'The vote is tied.';
  } else if (isYesWinner) {
    summaryText = `The motion passed with ${winnerPct}% in favour.`;
  } else if (isNoWinner) {
    summaryText = `The motion was defeated with ${winnerPct}% against.`;
  } else {
    summaryText = `"${winner}" received the most votes with ${winnerPct}%.`;
  }

  return (
    <div className="card print:shadow-none print:border">
      {/* Header */}
      <div className="card-header border-b border-gray-200">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">{question.title}</h3>
            {question.description && (
              <p className="text-sm text-gray-600 mt-1">{question.description}</p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <MethodBadge type={question.type} />
            <span className="text-sm text-gray-500">{total.toLocaleString()} votes</span>
          </div>
        </div>
      </div>

      <div className="card-body">
        {/* Summary */}
        <div className={`p-4 rounded-lg mb-6 ${isTie ? 'bg-gray-50 border border-gray-200' : isYesWinner ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
          <p className={`text-lg font-medium ${isTie ? 'text-gray-800' : isYesWinner ? 'text-green-800' : 'text-red-800'}`}>
            {summaryText}
          </p>
        </div>

        {/* Bars */}
        <div className="space-y-1">
          {sortedResults.map(([option, count], index) => (
            <HorizontalBar
              key={option}
              label={option}
              value={count}
              total={total}
              maxValue={maxValue}
              isWinner={index === 0 && !isTie}
              highlight={index === 0 && !isTie}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// MULTIPLE CHOICE RESULTS
// ============================================================================

function MultipleChoiceResults({ question }: { question: QuestionResult }) {
  const results = question.results as { [key: string]: number };
  const total = Object.values(results).reduce((sum, count) => sum + count, 0);
  const sortedResults = Object.entries(results).sort(([, a], [, b]) => b - a);
  const maxValue = Math.max(...Object.values(results));
  
  const [winner, winnerVotes] = sortedResults[0] || ['', 0];
  const [runnerUp, runnerUpVotes] = sortedResults[1] || ['', 0];
  const isTie = sortedResults.length > 1 && winnerVotes === runnerUpVotes;
  const winnerPct = total > 0 ? ((winnerVotes / total) * 100).toFixed(1) : '0';

  return (
    <div className="card print:shadow-none print:border">
      {/* Header */}
      <div className="card-header border-b border-gray-200">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">{question.title}</h3>
            {question.description && (
              <p className="text-sm text-gray-600 mt-1">{question.description}</p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <MethodBadge type={question.type} />
            <span className="text-sm text-gray-500">{total.toLocaleString()} votes</span>
          </div>
        </div>
      </div>

      <div className="card-body">
        {/* Summary */}
        <div className={`p-4 rounded-lg mb-6 ${isTie ? 'bg-gray-50 border border-gray-200' : 'bg-green-50 border border-green-200'}`}>
          <p className={`text-lg font-medium ${isTie ? 'text-gray-800' : 'text-green-800'}`}>
            {isTie 
              ? `Multiple options are tied for first place with ${winnerVotes.toLocaleString()} votes each.`
              : `"${winner}" received the most votes with ${winnerPct}%.`
            }
          </p>
        </div>

        {/* Bars */}
        <div className="space-y-1">
          {sortedResults.map(([option, count], index) => (
            <HorizontalBar
              key={option}
              label={option}
              value={count}
              total={total}
              maxValue={maxValue}
              isWinner={index === 0 && !isTie}
              highlight={index === 0 && !isTie}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// IRV / RANKED CHOICE RESULTS
// ============================================================================

function IRVResults({ question }: { question: QuestionResult }) {
  const results = question.results;
  const rounds: IRVRound[] = results.rounds || [];
  const winner = results.winner;
  const totalVotes = results.totalVotes || 0;
  const exhaustedBallots = results.exhaustedBallots || 0;
  
  const [expandedRound, setExpandedRound] = useState<number | null>(null);
  const [showExplanation, setShowExplanation] = useState(false);

  if (rounds.length === 0) {
    return (
      <div className="card print:shadow-none print:border">
        <div className="card-header">
          <h3 className="text-lg font-semibold text-gray-900">{question.title}</h3>
        </div>
        <div className="card-body text-center py-8 text-gray-500">No results available</div>
      </div>
    );
  }

  const finalRound = rounds[rounds.length - 1];
  const finalTotalActive = Object.values(finalRound.votes).reduce((s, v) => s + v, 0);
  const winnerVotes = winner ? finalRound.votes[winner] || 0 : 0;
  const winnerPct = finalTotalActive > 0 ? ((winnerVotes / finalTotalActive) * 100).toFixed(1) : '0';

  return (
    <div className="card print:shadow-none print:border">
      {/* Header */}
      <div className="card-header border-b border-gray-200">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">{question.title}</h3>
            {question.description && (
              <p className="text-sm text-gray-600 mt-1">{question.description}</p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <MethodBadge type={question.type} />
            <span className="text-sm text-gray-500">{totalVotes.toLocaleString()} votes</span>
          </div>
        </div>
      </div>

      <div className="card-body space-y-6">
        {/* Winner Announcement */}
        {winner && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
            <p className="text-sm font-medium text-green-600 mb-1">Winner</p>
            <p className="text-2xl font-bold text-green-800 mb-2">{winner}</p>
            <p className="text-green-700">
              {rounds.length === 1 
                ? `Won in the first round with ${winnerPct}% of votes.`
                : `Won after ${rounds.length} rounds of counting with ${winnerVotes.toLocaleString()} votes (${winnerPct}%).`
              }
            </p>
          </div>
        )}

        {/* Summary Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 bg-gray-50 rounded-lg">
          <div className="text-center">
            <p className="text-2xl font-bold text-gray-900">{totalVotes.toLocaleString()}</p>
            <p className="text-sm text-gray-600">Total Ballots</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-gray-900">{rounds.length}</p>
            <p className="text-sm text-gray-600">Rounds</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-gray-900">{question.options.length}</p>
            <p className="text-sm text-gray-600">Candidates</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-gray-900">{exhaustedBallots.toLocaleString()}</p>
            <p className="text-sm text-gray-600">Exhausted</p>
          </div>
        </div>

        {/* Round by Round */}
        <div>
          <h4 className="text-lg font-semibold text-gray-900 mb-4">Round-by-Round Count</h4>
          <div className="space-y-4">
            {rounds.map((round, roundIndex) => {
              const roundTotal = Object.values(round.votes).reduce((s, v) => s + v, 0);
              const maxVotes = Math.max(...Object.values(round.votes));
              const majority = Math.floor(roundTotal / 2) + 1;
              const sortedCandidates = Object.entries(round.votes).sort(([, a], [, b]) => b - a);
              const isExpanded = expandedRound === round.round;
              
              // Calculate transfers received this round
              const transfersReceived: { [candidate: string]: number } = {};
              if (roundIndex > 0) {
                const prevRound = rounds[roundIndex - 1];
                sortedCandidates.forEach(([candidate]) => {
                  const prevVotes = prevRound.votes[candidate] || 0;
                  const currVotes = round.votes[candidate];
                  if (currVotes > prevVotes) {
                    transfersReceived[candidate] = currVotes - prevVotes;
                  }
                });
              }

              // Generate narrative
              let narrative = '';
              if (round.round === 1) {
                narrative = `First preference votes were counted. ${sortedCandidates[0][0]} led with ${sortedCandidates[0][1].toLocaleString()} votes (${((sortedCandidates[0][1] / roundTotal) * 100).toFixed(1)}%)`;
                if (sortedCandidates.length > 1) {
                  narrative += `, followed by ${sortedCandidates[1][0]} with ${sortedCandidates[1][1].toLocaleString()} votes.`;
                } else {
                  narrative += '.';
                }
              } else if (round.eliminated.length > 0) {
                const prevRound = rounds[roundIndex - 1];
                const eliminatedName = round.eliminated[0];
                const eliminatedVotes = prevRound.votes[eliminatedName] || 0;
                narrative = `${eliminatedName} had the fewest votes (${eliminatedVotes.toLocaleString()}) and was eliminated.`;
              }

              if (round.winner) {
                narrative += ` ${round.winner} reached a majority and won.`;
              }

              return (
                <div 
                  key={round.round} 
                  className={`border rounded-lg overflow-hidden ${round.winner ? 'border-green-300 bg-green-50/50' : 'border-gray-200'}`}
                >
                  {/* Round Header */}
                  <button
                    onClick={() => setExpandedRound(isExpanded ? null : round.round)}
                    className="w-full px-4 py-3 flex justify-between items-center hover:bg-gray-50 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3">
                      <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold ${round.winner ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-700'}`}>
                        {round.round}
                      </span>
                      <span className="font-medium text-gray-900">
                        {round.round === 1 ? 'First Preferences' : round.winner ? 'Final Round' : `After eliminating ${round.eliminated.join(', ')}`}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {round.winner && (
                        <span className="text-sm text-green-700 font-medium">Winner: {round.winner}</span>
                      )}
                      <svg 
                        className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} 
                        fill="none" 
                        stroke="currentColor" 
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </button>

                  {/* Round Content (always visible on print) */}
                  <div className={`px-4 pb-4 ${isExpanded ? '' : 'hidden print:block'}`}>
                    {/* Narrative */}
                    <p className="text-sm text-gray-700 mb-4 p-3 bg-gray-100 rounded">{narrative}</p>

                    {/* Majority threshold indicator */}
                    <div className="flex items-center gap-2 mb-3 text-sm text-gray-600">
                      <span>Majority needed: {majority.toLocaleString()} votes</span>
                      <span className="flex-1 border-b-2 border-dashed border-gray-300"></span>
                    </div>

                    {/* Candidate Bars */}
                    <div className="space-y-1">
                      {sortedCandidates.map(([candidate, votes]) => (
                        <HorizontalBar
                          key={candidate}
                          label={candidate}
                          value={votes}
                          total={roundTotal}
                          maxValue={maxVotes}
                          isWinner={round.winner === candidate}
                          isEliminated={round.eliminated.includes(candidate)}
                          showTransferBreakdown={roundIndex > 0}
                          transferReceived={transfersReceived[candidate] || 0}
                        />
                      ))}
                    </div>

                    {/* Transfer Table */}
                    {round.transfers && (
                      <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                        <p className="text-sm font-medium text-amber-800 mb-2">
                          Vote transfers from {round.transfers.fromCandidate}:
                        </p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
                          {Object.entries(round.transfers.transfers)
                            .filter(([, count]) => count > 0)
                            .sort(([, a], [, b]) => b - a)
                            .map(([candidate, count]) => (
                              <div key={candidate} className="flex justify-between items-center bg-white rounded px-2 py-1">
                                <span className="text-gray-700 truncate">{candidate}</span>
                                <span className="font-medium text-amber-700 ml-2">+{count}</span>
                              </div>
                            ))
                          }
                          {round.transfers.exhausted > 0 && (
                            <div className="flex justify-between items-center bg-white rounded px-2 py-1">
                              <span className="text-gray-500 italic">Exhausted</span>
                              <span className="font-medium text-gray-500">{round.transfers.exhausted}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Exhausted this round */}
                    {round.totalExhausted !== undefined && round.totalExhausted > 0 && (
                      <p className="mt-3 text-sm text-gray-600">
                        Exhausted ballots so far: {round.totalExhausted.toLocaleString()}
                        {round.exhaustedThisRound && round.exhaustedThisRound > 0 && (
                          <span className="text-gray-500"> (+{round.exhaustedThisRound} this round)</span>
                        )}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Exhausted Ballots Explanation */}
        {exhaustedBallots > 0 && (
          <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
            <h5 className="font-medium text-gray-900 mb-2">About Exhausted Ballots</h5>
            <p className="text-sm text-gray-700">
              {exhaustedBallots.toLocaleString()} ballot{exhaustedBallots !== 1 ? 's' : ''} became exhausted during counting. 
              A ballot becomes exhausted when all of its ranked candidates have been eliminated, meaning it 
              cannot be transferred to any remaining candidate. This happens when voters do not rank all available options.
            </p>
          </div>
        )}

        {/* How Does IRV Work? */}
        <div className="border border-gray-200 rounded-lg overflow-hidden print:break-before-avoid">
          <button
            onClick={() => setShowExplanation(!showExplanation)}
            className="w-full px-4 py-3 flex justify-between items-center hover:bg-gray-50 transition-colors text-left print:hidden"
          >
            <span className="font-medium text-gray-900">How does Ranked Choice Voting work?</span>
            <svg 
              className={`w-5 h-5 text-gray-400 transition-transform ${showExplanation ? 'rotate-180' : ''}`} 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          <div className={`px-4 pb-4 text-sm text-gray-700 space-y-3 ${showExplanation ? '' : 'hidden'} print:block`}>
            <p className="hidden print:block font-medium text-gray-900 pt-3">How does Ranked Choice Voting work?</p>
            <p>
              Ranked Choice Voting (also known as Instant Runoff Voting) works like a series of runoff elections, 
              but all in one ballot. Instead of voting for just one candidate, voters rank candidates in order of preference.
            </p>
            <p>
              In the first round, everyone's first preference is counted. If any candidate has more than 50% of the votes, 
              they win outright. If not, the candidate with the fewest votes is eliminated.
            </p>
            <p>
              When a candidate is eliminated, their votes are redistributed to each ballot's next-ranked candidate who 
              is still in the race. This process continues, eliminating the last-place candidate and redistributing 
              their votes, until one candidate achieves a majority.
            </p>
            <p>
              This system ensures the winner has broad support, as they need to be an acceptable choice to a majority 
              of voters, not just the first choice of the largest minority.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// CONDORCET RESULTS
// ============================================================================

function CondorcetResults({ question }: { question: QuestionResult }) {
  const results = question.results;
  const winner = results.winner;
  const isCondorcetWinner = results.condorcetWinner;
  const method = results.method;
  const matrix = results.pairwiseMatrix || {};
  const rankings = results.rankings || [];
  const options = question.options;
  
  const [showExplanation, setShowExplanation] = useState(false);

  return (
    <div className="card print:shadow-none print:border">
      {/* Header */}
      <div className="card-header border-b border-gray-200">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">{question.title}</h3>
            {question.description && (
              <p className="text-sm text-gray-600 mt-1">{question.description}</p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <MethodBadge type={question.type} />
            <span className="text-sm text-gray-500">{results.totalVotes?.toLocaleString() || 0} votes</span>
          </div>
        </div>
      </div>

      <div className="card-body space-y-6">
        {/* Winner Announcement */}
        {winner && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
            <p className="text-sm font-medium text-green-600 mb-1">
              {isCondorcetWinner ? 'Condorcet Winner' : 'Winner (Schulze Method)'}
            </p>
            <p className="text-2xl font-bold text-green-800 mb-2">{winner}</p>
            <p className="text-green-700">
              {isCondorcetWinner 
                ? `${winner} beat every other candidate in head-to-head matchups.`
                : `No candidate beat all others. ${winner} was determined by the Schulze method, which finds the strongest paths of preference.`
              }
            </p>
          </div>
        )}

        {/* Rankings */}
        <div>
          <h4 className="text-lg font-semibold text-gray-900 mb-4">Overall Rankings</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-gray-200">
                  <th className="text-left py-2 px-3 font-semibold text-gray-700">Rank</th>
                  <th className="text-left py-2 px-3 font-semibold text-gray-700">Candidate</th>
                  <th className="text-center py-2 px-3 font-semibold text-gray-700">Wins</th>
                  <th className="text-center py-2 px-3 font-semibold text-gray-700">Losses</th>
                  <th className="text-center py-2 px-3 font-semibold text-gray-700">Ties</th>
                </tr>
              </thead>
              <tbody>
                {rankings.map((r: any, i: number) => (
                  <tr key={r.candidate} className={`border-b border-gray-100 ${r.candidate === winner ? 'bg-green-50' : ''}`}>
                    <td className="py-3 px-3 font-bold text-gray-700">{i + 1}</td>
                    <td className="py-3 px-3 font-medium text-gray-900">
                      {r.candidate}
                      {r.candidate === winner && (
                        <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-green-100 text-green-800">
                          Winner
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-center font-semibold text-green-700">{r.wins}</td>
                    <td className="py-3 px-3 text-center font-semibold text-red-600">{r.losses}</td>
                    <td className="py-3 px-3 text-center text-gray-500">{r.ties}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pairwise Matrix */}
        <div>
          <h4 className="text-lg font-semibold text-gray-900 mb-2">Head-to-Head Results</h4>
          <p className="text-sm text-gray-600 mb-4">
            Each cell shows how many voters preferred the row candidate over the column candidate.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border border-gray-200">
              <thead>
                <tr className="bg-gray-50">
                  <th className="py-2 px-3 text-left font-semibold text-gray-700 border-b border-gray-200">vs.</th>
                  {options.map(opt => (
                    <th key={opt} className="py-2 px-3 text-center font-semibold text-gray-700 border-b border-l border-gray-200 min-w-[80px]">
                      {opt.length > 12 ? opt.slice(0, 12) + '...' : opt}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {options.map(rowOpt => (
                  <tr key={rowOpt}>
                    <td className="py-2 px-3 font-medium text-gray-900 border-b border-gray-200 bg-gray-50">
                      {rowOpt.length > 15 ? rowOpt.slice(0, 15) + '...' : rowOpt}
                    </td>
                    {options.map(colOpt => {
                      if (rowOpt === colOpt) {
                        return (
                          <td key={colOpt} className="py-2 px-3 text-center bg-gray-100 text-gray-400 border-b border-l border-gray-200">
                            -
                          </td>
                        );
                      }
                      const val = matrix[rowOpt]?.[colOpt] ?? 0;
                      const opp = matrix[colOpt]?.[rowOpt] ?? 0;
                      const isWin = val > opp;
                      const isTie = val === opp;
                      return (
                        <td 
                          key={colOpt} 
                          className={`py-2 px-3 text-center font-medium border-b border-l border-gray-200 ${
                            isWin ? 'text-green-700 bg-green-50' : isTie ? 'text-gray-600' : 'text-red-600 bg-red-50'
                          }`}
                          title={`${rowOpt} vs ${colOpt}: ${val} to ${opp}`}
                        >
                          {val}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Individual Matchups (Plain English) */}
        <div>
          <h4 className="text-lg font-semibold text-gray-900 mb-4">All Matchups</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {options.flatMap((a, i) => 
              options.slice(i + 1).map(b => {
                const aVotes = matrix[a]?.[b] ?? 0;
                const bVotes = matrix[b]?.[a] ?? 0;
                const aWins = aVotes > bVotes;
                const tie = aVotes === bVotes;
                return (
                  <div key={`${a}-${b}`} className="p-3 bg-gray-50 rounded-lg text-sm">
                    {tie ? (
                      <p className="text-gray-700">
                        <span className="font-medium">{a}</span> tied with <span className="font-medium">{b}</span> ({aVotes} to {bVotes})
                      </p>
                    ) : (
                      <p className="text-gray-700">
                        <span className={`font-medium ${aWins ? 'text-green-700' : ''}`}>{aWins ? a : b}</span> beat{' '}
                        <span className={`font-medium ${!aWins ? 'text-red-600' : ''}`}>{aWins ? b : a}</span> by{' '}
                        <span className="font-semibold">{aWins ? aVotes : bVotes}</span> to <span className="font-semibold">{aWins ? bVotes : aVotes}</span> votes
                      </p>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* How Does Condorcet Work? */}
        <div className="border border-gray-200 rounded-lg overflow-hidden print:break-before-avoid">
          <button
            onClick={() => setShowExplanation(!showExplanation)}
            className="w-full px-4 py-3 flex justify-between items-center hover:bg-gray-50 transition-colors text-left print:hidden"
          >
            <span className="font-medium text-gray-900">How does Condorcet voting work?</span>
            <svg 
              className={`w-5 h-5 text-gray-400 transition-transform ${showExplanation ? 'rotate-180' : ''}`} 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          <div className={`px-4 pb-4 text-sm text-gray-700 space-y-3 ${showExplanation ? '' : 'hidden'} print:block`}>
            <p className="hidden print:block font-medium text-gray-900 pt-3">How does Condorcet voting work?</p>
            <p>
              Condorcet voting compares every candidate against every other candidate in hypothetical head-to-head 
              matchups. For each pair, we count how many voters preferred one candidate over the other based on 
              their rankings.
            </p>
            <p>
              A Condorcet winner is a candidate who beats every other candidate in these head-to-head comparisons. 
              This is considered the strongest form of majority preference, as this candidate is preferred over 
              any single alternative.
            </p>
            <p>
              Sometimes no Condorcet winner exists because of cyclical preferences (A beats B, B beats C, but C 
              beats A). In these cases, we use the Schulze method, which finds the candidate with the strongest 
              "paths" of preference through all candidates.
            </p>
            <p>
              Condorcet voting is particularly good at finding consensus candidates and avoiding scenarios where 
              a candidate wins despite being strongly opposed by the majority.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// MAIN RESULTS PAGE
// ============================================================================

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
        <div className="text-center max-w-md px-4">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Results Not Available</h2>
          <p className="text-gray-600 mb-6">{error || 'This election may not exist, or results may not yet be published.'}</p>
          <Link href="/" className="btn-primary">Return Home</Link>
        </div>
      </div>
    );
  }

  const { plebiscite, participation, questions } = data;

  return (
    <div className="min-h-screen bg-gray-50 print:bg-white">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200 print:shadow-none">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center mr-3">
                <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/>
                </svg>
              </div>
              <div>
                <h1 className="text-lg font-semibold text-gray-900">Election Results</h1>
                <p className="text-sm text-gray-500">VoteKit</p>
              </div>
            </div>
            <div className="flex items-center gap-3 print:hidden">
              <a 
                href={`/api/results/${params.slug}?format=csv${token ? '&token=' + token : ''}`} 
                className="btn-secondary text-sm"
              >
                <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Export CSV
              </a>
              <button
                onClick={() => window.print()}
                className="btn-secondary text-sm"
              >
                <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                </svg>
                Print
              </button>
              <Link href="/" className="btn-primary text-sm">Home</Link>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Election Title & Info */}
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold text-gray-900 mb-3">{plebiscite.title}</h2>
          <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-sm text-gray-600 mb-4">
            <span>Opened: {formatDate(plebiscite.open_date)}</span>
            <span className="hidden sm:inline">|</span>
            <span>Closed: {formatDate(plebiscite.close_date)}</span>
          </div>
          {plebiscite.description && (
            <p className="text-gray-700 max-w-3xl mx-auto whitespace-pre-wrap">{plebiscite.description}</p>
          )}
        </div>

        {/* Participation Summary */}
        <div className="flex justify-center mb-10">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 px-8 py-5 text-center">
            <p className="text-4xl font-bold text-primary mb-1">{participation.totalVotes.toLocaleString()}</p>
            <p className="text-gray-600">Total Votes Cast</p>
          </div>
        </div>

        {/* Questions */}
        <div className="space-y-10">
          {questions.length === 0 ? (
            <div className="text-center py-12 text-gray-500">No questions found in this election.</div>
          ) : (
            questions.map((question, index) => {
              // Prefix question title with number
              const numberedQuestion = { ...question, title: `${index + 1}. ${question.title}` };
              
              switch (question.type) {
                case 'yes_no':
                  return <YesNoResults key={question.id} question={numberedQuestion} />;
                case 'multiple_choice':
                  return <MultipleChoiceResults key={question.id} question={numberedQuestion} />;
                case 'ranked_choice':
                  return <IRVResults key={question.id} question={numberedQuestion} />;
                case 'condorcet':
                  return <CondorcetResults key={question.id} question={numberedQuestion} />;
                default:
                  return (
                    <div key={question.id} className="card">
                      <div className="card-body text-center py-8 text-gray-500">
                        Unknown question type: {question.type}
                      </div>
                    </div>
                  );
              }
            })
          )}
        </div>

        {/* Footer Info */}
        <div className="mt-12 p-6 bg-blue-50 border border-blue-200 rounded-lg print:bg-gray-50 print:border-gray-200">
          <h4 className="font-semibold text-blue-900 print:text-gray-900 mb-3">About These Results</h4>
          <div className="text-sm text-blue-800 print:text-gray-700 space-y-2">
            <p>
              All votes were cast securely and anonymously. Results are final and preserved for audit purposes.
            </p>
            <p>
              Individual votes cannot be traced back to electors while maintaining full verifiability 
              through receipt codes.
            </p>
          </div>
        </div>
      </main>

      {/* Print Footer */}
      <footer className="hidden print:block mt-8 text-center text-sm text-gray-500 border-t border-gray-200 pt-4">
        <p>Generated by VoteKit on {new Date().toLocaleDateString('en-AU', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
      </footer>
    </div>
  );
}
