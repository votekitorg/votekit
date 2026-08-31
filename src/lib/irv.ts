// Instant Runoff Voting (IRV) Tabulation Algorithm

export interface IRVVote {
  preferences: string[]; // Array of candidate names in order of preference
}

export interface IRVRound {
  round: number;
  candidates: string[];
  votes: { [candidate: string]: number };
  eliminated: string[];
  supplementary?: boolean;
  transfer?: IRVTransfer;
  winner?: string;
  tiedCandidates?: string[];
  tieBreak?: IRVTieBreak;
}

export interface IRVTransfer {
  from: string;
  to: { [candidate: string]: number };
  exhausted: number;
}

export type IRVTieResolutionType = 'exclusion' | 'winner';
export type IRVTieResolutionMethod = 'drawing_lots' | 'governing_rules';

export interface IRVTieResolution {
  round: number;
  type: IRVTieResolutionType;
  tiedCandidates: string[];
  selectedCandidate: string;
  method: IRVTieResolutionMethod;
  note?: string | null;
  resolvedAt?: string | null;
}

export interface IRVTieBreak {
  type: IRVTieResolutionType;
  tiedCandidates: string[];
  selectedCandidate: string;
  method: 'countback' | IRVTieResolutionMethod;
  sourceRound?: number;
  note?: string | null;
  resolvedAt?: string | null;
}

export interface IRVPendingTie {
  round: number;
  type: IRVTieResolutionType;
  tiedCandidates: string[];
}

export interface IRVResult {
  winner: string | null;
  rounds: IRVRound[];
  totalVotes: number;
  exhaustedBallots: number;
  decisiveRound?: number;
  continuedForReporting?: boolean;
  pendingTie?: IRVPendingTie;
}

export interface IRVTabulationOptions {
  continueAfterMajority?: boolean;
}

function sortCandidatesByVotesThenName(entries: [string, number][]): [string, number][] {
  return [...entries].sort(([candidateA, votesA], [candidateB, votesB]) => {
    if (votesA !== votesB) return votesB - votesA;
    return candidateA.localeCompare(candidateB);
  });
}

function sameCandidates(left: string[], right: string[]): boolean {
  return [...left].sort().join('\u0000') === [...right].sort().join('\u0000');
}

function manualResolution(
  resolutions: IRVTieResolution[],
  round: number,
  type: IRVTieResolutionType,
  tiedCandidates: string[]
): IRVTieResolution | undefined {
  return resolutions.find(resolution =>
    resolution.round === round && resolution.type === type &&
    sameCandidates(resolution.tiedCandidates, tiedCandidates) &&
    tiedCandidates.includes(resolution.selectedCandidate)
  );
}

function resolveExclusionByCountback(rounds: IRVRound[], tiedCandidates: string[]): { candidate: string; sourceRound: number } | null {
  let stillTied = [...tiedCandidates];
  for (let index = rounds.length - 1; index >= 0; index -= 1) {
    const previous = rounds[index];
    const counts = stillTied.map(candidate => [candidate, previous.votes[candidate] ?? 0] as const);
    const lowest = Math.min(...counts.map(([, count]) => count));
    const lowestCandidates = counts.filter(([, count]) => count === lowest).map(([candidate]) => candidate);
    if (lowestCandidates.length === 1) return { candidate: lowestCandidates[0], sourceRound: previous.round };
    stillTied = lowestCandidates;
  }
  return null;
}

export function tabulateIRV(
  votes: IRVVote[],
  candidates: string[],
  resolutions: IRVTieResolution[] = [],
  options: IRVTabulationOptions = {}
): IRVResult {
  if (votes.length === 0) {
    return {
      winner: null,
      rounds: [],
      totalVotes: 0,
      exhaustedBallots: 0
    };
  }

  const result: IRVResult = {
    winner: null,
    rounds: [],
    totalVotes: votes.length,
    exhaustedBallots: 0
  };

  let remainingCandidates = [...candidates];
  const activeBallots = votes.map(vote => ({
    preferences: vote.preferences.filter(pref => candidates.includes(pref)),
    exhausted: false
  }));

  let round = 1;
  let supplementary = false;

  while (remainingCandidates.length > 0) {
    // Count first preferences for remaining candidates
    const voteCounts: { [candidate: string]: number } = {};
    remainingCandidates.forEach(candidate => {
      voteCounts[candidate] = 0;
    });

    // Count votes from active ballots
    activeBallots.forEach(ballot => {
      if (ballot.exhausted) return;
      
      // Find the first preference that's still in the race
      const firstChoice = ballot.preferences.find(pref => 
        remainingCandidates.includes(pref)
      );

      if (firstChoice) {
        voteCounts[firstChoice]++;
      } else {
        // Ballot is exhausted (no remaining preferences for active candidates)
        ballot.exhausted = true;
      }
    });

    const totalActiveVotes = Object.values(voteCounts).reduce((sum, count) => sum + count, 0);
    const majority = Math.floor(totalActiveVotes / 2) + 1;

    // Check if any candidate has a majority
    const sortedCandidates = sortCandidatesByVotesThenName(Object.entries(voteCounts));

    const roundData: IRVRound = {
      round,
      candidates: [...remainingCandidates],
      votes: { ...voteCounts },
      eliminated: [],
      ...(supplementary ? { supplementary: true } : {})
    };

    // A sole continuing candidate is elected. Recounting this final round also
    // marks ballots with no continuing preference as exhausted.
    if (remainingCandidates.length === 1) {
      roundData.winner = remainingCandidates[0];
      result.winner = remainingCandidates[0];
      result.decisiveRound = round;
      result.rounds.push(roundData);
      break;
    }

    // Freeze the official result at the first majority. An optional full
    // distribution then repeats that decisive tally as the first supplementary
    // round before excluding the lowest continuing option. This keeps the
    // declaration and reporting-only preference flow unambiguous.
    if (!result.winner && sortedCandidates[0][1] >= majority) {
      roundData.winner = sortedCandidates[0][0];
      result.winner = sortedCandidates[0][0];
      result.decisiveRound = round;
      result.rounds.push(roundData);
      if (!options.continueAfterMajority || remainingCandidates.length <= 2) break;
      result.continuedForReporting = true;
      supplementary = true;
      round++;
      continue;
    }

    // A reporting-only distribution is complete when the final-two tally has
    // been recorded. It never replaces or re-declares the official winner.
    if (result.winner && remainingCandidates.length === 2) {
      result.rounds.push(roundData);
      break;
    }

    // If only two candidates remain, the one with more active votes wins. A
    // true final tie requires an explicit, audited election-rule decision.
    if (remainingCandidates.length === 2) {
      if (sortedCandidates[0][1] === sortedCandidates[1][1]) {
        const tiedCandidates = sortedCandidates.map(([candidate]) => candidate).sort();
        const resolution = manualResolution(resolutions, round, 'winner', tiedCandidates);
        if (resolution) {
          roundData.winner = resolution.selectedCandidate;
          roundData.tieBreak = { ...resolution };
          result.winner = resolution.selectedCandidate;
          result.decisiveRound = round;
        } else {
          roundData.tiedCandidates = tiedCandidates;
          result.pendingTie = { round, type: 'winner', tiedCandidates };
        }
        result.rounds.push(roundData);
        break;
      }

      const winner = sortedCandidates[0][0];
      roundData.winner = winner;
      result.winner = winner;
      result.decisiveRound = round;
      result.rounds.push(roundData);
      break;
    }

    // Find candidate(s) to eliminate (lowest vote count)
    const lowestVoteCount = Math.min(...Object.values(voteCounts));
    const candidatesToEliminate = Object.entries(voteCounts)
      .filter(([, count]) => count === lowestVoteCount)
      .map(([candidate]) => candidate);

    // Exactly one candidate is excluded per round. A tied exclusion first uses
    // countback; if prior rounds cannot separate the candidates, counting pauses
    // until a Returning Officer records the governing-rule decision.
    let eliminatedCandidate: string;
    if (candidatesToEliminate.length === 1) {
      eliminatedCandidate = candidatesToEliminate[0];
    } else {
      const tiedCandidates = [...candidatesToEliminate].sort();
      const countback = resolveExclusionByCountback(result.rounds, tiedCandidates);
      if (countback) {
        eliminatedCandidate = countback.candidate;
        roundData.tieBreak = {
          type: 'exclusion', tiedCandidates, selectedCandidate: eliminatedCandidate,
          method: 'countback', sourceRound: countback.sourceRound
        };
      } else {
        const resolution = manualResolution(resolutions, round, 'exclusion', tiedCandidates);
        if (!resolution) {
          roundData.tiedCandidates = tiedCandidates;
          result.pendingTie = { round, type: 'exclusion', tiedCandidates };
          result.rounds.push(roundData);
          break;
        }
        eliminatedCandidate = resolution.selectedCandidate;
        roundData.tieBreak = { ...resolution };
      }
    }

    roundData.eliminated = [eliminatedCandidate];

    const transfer: IRVTransfer = {
      from: eliminatedCandidate,
      to: {},
      exhausted: 0
    };
    activeBallots.forEach(ballot => {
      if (ballot.exhausted) return;
      const currentChoice = ballot.preferences.find(preference => remainingCandidates.includes(preference));
      if (currentChoice !== eliminatedCandidate) return;

      const nextChoice = ballot.preferences.find(preference =>
        preference !== eliminatedCandidate && remainingCandidates.includes(preference)
      );
      if (nextChoice) {
        transfer.to[nextChoice] = (transfer.to[nextChoice] || 0) + 1;
      } else {
        transfer.exhausted += 1;
      }
    });
    roundData.transfer = transfer;
    result.rounds.push(roundData);

    // Remove eliminated candidates from remaining candidates
    remainingCandidates = remainingCandidates.filter(
      candidate => candidate !== eliminatedCandidate
    );

    round++;
  }

  // Count exhausted ballots
  result.exhaustedBallots = activeBallots.filter(ballot => ballot.exhausted).length;

  return result;
}

export function formatIRVTransferSummary(transfer: IRVTransfer): string {
  const destinations = Object.entries(transfer.to)
    .sort(([candidateA, votesA], [candidateB, votesB]) => votesB - votesA || candidateA.localeCompare(candidateB))
    .map(([candidate, count]) => `${count} to ${candidate}`);
  return `${transfer.from} excluded: ${[...destinations, `${transfer.exhausted} exhausted`].join('; ')}.`;
}

// Helper function to validate IRV votes
export function validateIRVVote(vote: string[], candidates: string[]): boolean {
  // Check that all preferences are valid candidates
  const validPreferences = vote.filter(pref => candidates.includes(pref));
  
  // Check for duplicates
  const uniquePreferences = new Set(validPreferences);
  
  return validPreferences.length === vote.length && validPreferences.length === uniquePreferences.size;
}

// Helper function to format IRV results for display
export function formatIRVResults(result: IRVResult): string {
  if (!result.winner) {
    return result.pendingTie
      ? `Count paused: ${result.pendingTie.tiedCandidates.join(', ')} are tied in round ${result.pendingTie.round}.`
      : "No winner could be determined.";
  }

  let output = `Winner: ${result.winner}\n`;
  if (result.decisiveRound) output += `Official result declared: Round ${result.decisiveRound}\n`;
  if (result.continuedForReporting) output += 'Supplementary distribution: Continued to a final-two tally for reporting only\n';
  output += `Total Votes: ${result.totalVotes}\n`;
  output += `Exhausted Ballots: ${result.exhaustedBallots}\n\n`;

  result.rounds.forEach(round => {
    output += `Round ${round.round}${round.supplementary ? ' (supplementary distribution)' : ''}:\n`;
    
    const sortedVotes = sortCandidatesByVotesThenName(Object.entries(round.votes));
    
    sortedVotes.forEach(([candidate, votes]) => {
      const percentage = round.votes && Object.values(round.votes).reduce((sum, count) => sum + count, 0) > 0
        ? ((votes / Object.values(round.votes).reduce((sum, count) => sum + count, 0)) * 100).toFixed(1)
        : '0.0';
      output += `  ${candidate}: ${votes} votes (${percentage}%)\n`;
    });

    if (round.eliminated.length > 0) {
      output += `  Eliminated: ${round.eliminated.join(', ')}\n`;
    }

    if (round.transfer) {
      output += `  ${formatIRVTransferSummary(round.transfer)}\n`;
    }

    if (round.winner) {
      output += `  Winner: ${round.winner}\n`;
    }

    output += '\n';
  });

  return output;
}

// Helper function to export IRV results as CSV
export function exportIRVResultsCSV(result: IRVResult): string {
  const csvCell = (value: unknown): string => {
    let text = String(value ?? '');
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  };
  let csv = `Official winner,${csvCell(result.winner || '')}\n`;
  csv += `Decisive round,${result.decisiveRound || ''}\n`;
  csv += `Continued for reporting,${result.continuedForReporting ? 'Yes' : 'No'}\n\n`;
  csv += 'Round,Phase,Candidate,Votes,Percentage,Status\n';
  
  result.rounds.forEach(round => {
    const totalVotes = Object.values(round.votes).reduce((sum, count) => sum + count, 0);
    
    sortCandidatesByVotesThenName(Object.entries(round.votes))
      .forEach(([candidate, votes]) => {
        const percentage = totalVotes > 0 ? ((votes / totalVotes) * 100).toFixed(1) : '0.0';
        let status = 'Active';
        
        if (round.eliminated.includes(candidate)) {
          status = 'Eliminated';
        } else if (round.winner === candidate) {
          status = 'Winner';
        }
        
        csv += `${round.round},${csvCell(round.supplementary ? 'Supplementary distribution' : 'Official count')},${csvCell(candidate)},${votes},${percentage}%,${status}\n`;
      });

    if (round.tieBreak) {
      const action = round.tieBreak.type === 'exclusion'
        ? `Excluded ${round.tieBreak.selectedCandidate}`
        : `Selected ${round.tieBreak.selectedCandidate} as winner`;
      const method = round.tieBreak.method === 'countback'
        ? `Countback to round ${round.tieBreak.sourceRound}`
        : round.tieBreak.method === 'drawing_lots' ? 'Supervised drawing of lots' : 'Election governing rules';
      csv += `${round.round},${csvCell(round.supplementary ? 'Supplementary distribution' : 'Official count')},${csvCell('Tie resolution')},,,${csvCell(`${action}; ${method}${round.tieBreak.note ? `; ${round.tieBreak.note}` : ''}`)}\n`;
    }
    if (round.transfer) {
      csv += `${round.round},${csvCell(round.supplementary ? 'Supplementary distribution' : 'Official count')},${csvCell('Preference transfers')},,,${csvCell(formatIRVTransferSummary(round.transfer))}\n`;
    }
  });

  if (result.pendingTie) {
    csv += `${result.pendingTie.round},${csvCell(result.winner ? 'Supplementary distribution' : 'Official count')},${csvCell('Count paused')},,,${csvCell(`Unresolved ${result.pendingTie.type} tie: ${result.pendingTie.tiedCandidates.join(' | ')}`)}\n`;
  }
  
  return csv;
}
