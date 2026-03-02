// Instant Runoff Voting (IRV) Tabulation Algorithm

export interface IRVVote {
  preferences: string[]; // Array of candidate names in order of preference
}

export interface IRVTransfer {
  fromCandidate: string;
  transfers: { [toCandidate: string]: number };
  exhausted: number;
}

export interface IRVRound {
  round: number;
  candidates: string[];
  votes: { [candidate: string]: number };
  previousVotes?: { [candidate: string]: number }; // Votes from previous round
  eliminated: string[];
  winner?: string;
  transfers?: IRVTransfer; // Where eliminated candidate's votes went
  exhaustedThisRound?: number; // Ballots that became exhausted this round
  totalExhausted?: number; // Total exhausted so far
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
  
  // Track each ballot's state
  const activeBallots = votes.map(vote => ({
    preferences: vote.preferences.filter(pref => candidates.includes(pref)),
    exhausted: false,
    currentChoice: null as string | null
  }));

  let round = 1;
  let previousVotes: { [candidate: string]: number } = {};
  let totalExhaustedSoFar = 0;

  while (remainingCandidates.length > 1) {
    // Count first preferences for remaining candidates
    const voteCounts: { [candidate: string]: number } = {};
    remainingCandidates.forEach(candidate => {
      voteCounts[candidate] = 0;
    });

    let exhaustedThisRound = 0;

    // Count votes from active ballots
    activeBallots.forEach(ballot => {
      if (ballot.exhausted) return;
      
      // Find the first preference that's still in the race
      const firstChoice = ballot.preferences.find(pref => 
        remainingCandidates.includes(pref)
      );

      if (firstChoice) {
        voteCounts[firstChoice]++;
        ballot.currentChoice = firstChoice;
      } else {
        // Ballot is exhausted
        if (!ballot.exhausted) {
          ballot.exhausted = true;
          exhaustedThisRound++;
        }
      }
    });

    totalExhaustedSoFar += exhaustedThisRound;

    const totalActiveVotes = Object.values(voteCounts).reduce((sum, count) => sum + count, 0);
    const majority = Math.floor(totalActiveVotes / 2) + 1;

    const sortedCandidates = Object.entries(voteCounts)
      .sort(([, a], [, b]) => b - a);

    const roundData: IRVRound = {
      round,
      candidates: [...remainingCandidates],
      votes: { ...voteCounts },
      previousVotes: round > 1 ? { ...previousVotes } : undefined,
      eliminated: [],
      exhaustedThisRound: round > 1 ? exhaustedThisRound : 0,
      totalExhausted: totalExhaustedSoFar
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
        : sortedCandidates[0][1] < sortedCandidates[1][1]
          ? sortedCandidates[1][0]
          : sortedCandidates[0][0]; // Tie goes to first alphabetically
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

    // If all remaining candidates are tied, pick the first alphabetically
    if (candidatesToEliminate.length === remainingCandidates.length) {
      const winner = remainingCandidates.sort()[0];
      roundData.winner = winner;
      result.winner = winner;
      result.rounds.push(roundData);
      break;
    }

    // Track where eliminated candidate's votes transfer to
    const eliminatedCandidate = candidatesToEliminate[0];
    const transferData: IRVTransfer = {
      fromCandidate: eliminatedCandidate,
      transfers: {},
      exhausted: 0
    };

    const futureRemaining = remainingCandidates.filter(c => !candidatesToEliminate.includes(c));
    futureRemaining.forEach(c => {
      transferData.transfers[c] = 0;
    });

    // Count where each eliminated candidate's ballots go
    activeBallots.forEach(ballot => {
      if (ballot.exhausted) return;
      if (ballot.currentChoice !== eliminatedCandidate) return;
      
      const nextChoice = ballot.preferences.find(pref => futureRemaining.includes(pref));
      
      if (nextChoice) {
        transferData.transfers[nextChoice]++;
      } else {
        transferData.exhausted++;
      }
    });

    roundData.eliminated = candidatesToEliminate;
    roundData.transfers = transferData;
    result.rounds.push(roundData);

    previousVotes = { ...voteCounts };
    remainingCandidates = remainingCandidates.filter(
      candidate => !candidatesToEliminate.includes(candidate)
    );

    round++;
  }

  // Handle edge case: only one candidate left
  if (!result.winner && remainingCandidates.length === 1) {
    result.winner = remainingCandidates[0];
    if (result.rounds.length > 0) {
      result.rounds[result.rounds.length - 1].winner = remainingCandidates[0];
    }
  }

  result.exhaustedBallots = activeBallots.filter(ballot => ballot.exhausted).length;

  return result;
}

// Helper function to validate IRV votes
export function validateIRVVote(vote: string[], candidates: string[]): boolean {
  const validPreferences = vote.filter(pref => candidates.includes(pref));
  const uniquePreferences = new Set(validPreferences);
  return validPreferences.length === uniquePreferences.size;
}

// Helper function to format IRV results for display
export function formatIRVResults(result: IRVResult): string {
  if (!result.winner) {
    return "No winner could be determined.";
  }

  let output = "Winner: " + result.winner + "\n";
  output += "Total Votes: " + result.totalVotes + "\n";
  output += "Exhausted Ballots: " + result.exhaustedBallots + "\n\n";

  result.rounds.forEach(round => {
    output += "Round " + round.round + ":\n";
    
    const sortedVotes = Object.entries(round.votes)
      .sort(([, a], [, b]) => b - a);
    
    const totalVotes = Object.values(round.votes).reduce((sum, count) => sum + count, 0);
    
    sortedVotes.forEach(([candidate, votes]) => {
      const percentage = totalVotes > 0
        ? ((votes / totalVotes) * 100).toFixed(1)
        : '0.0';
      output += "  " + candidate + ": " + votes + " votes (" + percentage + "%)\n";
    });

    if (round.eliminated.length > 0) {
      output += "  Eliminated: " + round.eliminated.join(', ') + "\n";
    }

    if (round.winner) {
      output += "  Winner: " + round.winner + "\n";
    }

    output += "\n";
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
        
        csv += round.round + ',"' + candidate + '",' + votes + ',' + percentage + '%,' + status + '\n';
      });
  });
  
  return csv;
}
