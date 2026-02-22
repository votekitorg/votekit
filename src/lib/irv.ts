// Instant Runoff Voting (IRV) Tabulation Algorithm

export interface IRVVote {
  preferences: string[]; // Array of candidate names in order of preference
}

export interface IRVRound {
  round: number;
  candidates: string[];
  votes: { [candidate: string]: number };
  eliminated: string[];
  winner?: string;
}

export interface IRVResult {
  winner: string | null;
  rounds: IRVRound[];
  totalVotes: number;
  exhaustedBallots: number;
}

export function tabulateIRV(votes: IRVVote[], candidates: string[]): IRVResult {
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

  while (remainingCandidates.length > 1) {
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
    const sortedCandidates = Object.entries(voteCounts)
      .sort(([, a], [, b]) => b - a);

    const roundData: IRVRound = {
      round,
      candidates: [...remainingCandidates],
      votes: { ...voteCounts },
      eliminated: []
    };

    // Check for winner
    if (sortedCandidates[0][1] >= majority) {
      roundData.winner = sortedCandidates[0][0];
      result.winner = sortedCandidates[0][0];
      result.rounds.push(roundData);
      break;
    }

    // If only two candidates remain, the one with more votes wins
    if (remainingCandidates.length === 2) {
      const winner = sortedCandidates[0][1] > sortedCandidates[1][1] 
        ? sortedCandidates[0][0] 
        : sortedCandidates[1][0];
      roundData.winner = winner;
      result.winner = winner;
      result.rounds.push(roundData);
      break;
    }

    // Find candidate(s) to eliminate (lowest vote count)
    const lowestVoteCount = Math.min(...Object.values(voteCounts));
    const candidatesToEliminate = Object.entries(voteCounts)
      .filter(([, count]) => count === lowestVoteCount)
      .map(([candidate]) => candidate);

    // If all remaining candidates are tied, pick the first one alphabetically as winner
    if (candidatesToEliminate.length === remainingCandidates.length) {
      const winner = remainingCandidates.sort()[0];
      roundData.winner = winner;
      result.winner = winner;
      result.rounds.push(roundData);
      break;
    }

    // Eliminate candidate(s) with lowest votes
    // If there's a tie for last place, eliminate all tied candidates
    roundData.eliminated = candidatesToEliminate;
    result.rounds.push(roundData);

    // Remove eliminated candidates from remaining candidates
    remainingCandidates = remainingCandidates.filter(
      candidate => !candidatesToEliminate.includes(candidate)
    );

    round++;
  }

  // Count exhausted ballots
  result.exhaustedBallots = activeBallots.filter(ballot => ballot.exhausted).length;

  return result;
}

// Helper function to validate IRV votes
export function validateIRVVote(vote: string[], candidates: string[]): boolean {
  // Check that all preferences are valid candidates
  const validPreferences = vote.filter(pref => candidates.includes(pref));
  
  // Check for duplicates
  const uniquePreferences = new Set(validPreferences);
  
  return validPreferences.length === uniquePreferences.size;
}

// Helper function to format IRV results for display
export function formatIRVResults(result: IRVResult): string {
  if (!result.winner) {
    return "No winner could be determined.";
  }

  let output = `Winner: ${result.winner}\n`;
  output += `Total Votes: ${result.totalVotes}\n`;
  output += `Exhausted Ballots: ${result.exhaustedBallots}\n\n`;

  result.rounds.forEach(round => {
    output += `Round ${round.round}:\n`;
    
    const sortedVotes = Object.entries(round.votes)
      .sort(([, a], [, b]) => b - a);
    
    sortedVotes.forEach(([candidate, votes]) => {
      const percentage = round.votes && Object.values(round.votes).reduce((sum, count) => sum + count, 0) > 0
        ? ((votes / Object.values(round.votes).reduce((sum, count) => sum + count, 0)) * 100).toFixed(1)
        : '0.0';
      output += `  ${candidate}: ${votes} votes (${percentage}%)\n`;
    });

    if (round.eliminated.length > 0) {
      output += `  Eliminated: ${round.eliminated.join(', ')}\n`;
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
  let csv = 'Round,Candidate,Votes,Percentage,Status\n';
  
  result.rounds.forEach(round => {
    const totalVotes = Object.values(round.votes).reduce((sum, count) => sum + count, 0);
    
    Object.entries(round.votes)
      .sort(([, a], [, b]) => b - a)
      .forEach(([candidate, votes]) => {
        const percentage = totalVotes > 0 ? ((votes / totalVotes) * 100).toFixed(1) : '0.0';
        let status = 'Active';
        
        if (round.eliminated.includes(candidate)) {
          status = 'Eliminated';
        } else if (round.winner === candidate) {
          status = 'Winner';
        }
        
        csv += `${round.round},"${candidate}",${votes},${percentage}%,${status}\n`;
      });
  });
  
  return csv;
}