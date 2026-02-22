// Condorcet Voting with Schulze Method Fallback

export interface CondorcetVote {
  preferences: string[]; // Ranked list of candidates
}

export interface PairwiseResult {
  candidateA: string;
  candidateB: string;
  winsA: number;
  winsB: number;
}

export interface CondorcetRound {
  round: number;
  description: string;
  pairwise?: PairwiseResult[];
  eliminated?: string[];
  winner?: string;
}

export interface CondorcetResult {
  winner: string | null;
  condorcetWinner: boolean; // true = pure Condorcet winner, false = Schulze resolution
  method: 'condorcet' | 'schulze';
  pairwiseMatrix: { [candidateA: string]: { [candidateB: string]: number } };
  rounds: CondorcetRound[];
  totalVotes: number;
  rankings: { candidate: string; wins: number; losses: number; ties: number }[];
}

/**
 * Build pairwise preference matrix.
 * matrix[A][B] = number of voters who prefer A over B
 */
function buildPairwiseMatrix(
  votes: CondorcetVote[],
  candidates: string[]
): { [a: string]: { [b: string]: number } } {
  const matrix: { [a: string]: { [b: string]: number } } = {};
  
  for (const a of candidates) {
    matrix[a] = {};
    for (const b of candidates) {
      matrix[a][b] = 0;
    }
  }

  for (const vote of votes) {
    const ranked = vote.preferences.filter(c => candidates.includes(c));
    // For each pair, the one appearing earlier is preferred
    for (let i = 0; i < ranked.length; i++) {
      for (let j = i + 1; j < ranked.length; j++) {
        matrix[ranked[i]][ranked[j]]++;
      }
      // Candidates not ranked at all are considered less preferred than any ranked candidate
      for (const c of candidates) {
        if (!ranked.includes(c)) {
          matrix[ranked[i]][c]++;
        }
      }
    }
  }

  return matrix;
}

/**
 * Find the Condorcet winner: a candidate who beats every other candidate head-to-head.
 */
function findCondorcetWinner(
  matrix: { [a: string]: { [b: string]: number } },
  candidates: string[]
): string | null {
  for (const a of candidates) {
    let winsAll = true;
    for (const b of candidates) {
      if (a === b) continue;
      if (matrix[a][b] <= matrix[b][a]) {
        winsAll = false;
        break;
      }
    }
    if (winsAll) return a;
  }
  return null;
}

/**
 * Schulze method: find the strongest paths between all pairs.
 * Used when no pure Condorcet winner exists (cyclical preferences).
 */
function schulze(
  matrix: { [a: string]: { [b: string]: number } },
  candidates: string[]
): string[] {
  const n = candidates.length;
  const idx: { [c: string]: number } = {};
  candidates.forEach((c, i) => { idx[c] = i; });

  // Build strength matrix: d[i][j] = margin of i over j
  const d: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i !== j) {
        d[i][j] = matrix[candidates[i]][candidates[j]];
      }
    }
  }

  // Strongest path matrix
  const p: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  
  // Initialise: p[i][j] = d[i][j] if d[i][j] > d[j][i], else 0
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i !== j) {
        p[i][j] = d[i][j] > d[j][i] ? d[i][j] : 0;
      }
    }
  }

  // Floyd-Warshall for strongest paths
  for (let k = 0; k < n; k++) {
    for (let i = 0; i < n; i++) {
      if (i === k) continue;
      for (let j = 0; j < n; j++) {
        if (j === i || j === k) continue;
        p[i][j] = Math.max(p[i][j], Math.min(p[i][k], p[k][j]));
      }
    }
  }

  // Rank candidates by how many other candidates they beat via strongest path
  const wins: { candidate: string; count: number }[] = candidates.map((c, i) => {
    let count = 0;
    for (let j = 0; j < n; j++) {
      if (i !== j && p[i][j] > p[j][i]) count++;
    }
    return { candidate: c, count };
  });

  wins.sort((a, b) => b.count - a.count);
  return wins.map(w => w.candidate);
}

export function tabulateCondorcet(votes: CondorcetVote[], candidates: string[]): CondorcetResult {
  if (votes.length === 0) {
    return {
      winner: null,
      condorcetWinner: false,
      method: 'condorcet',
      pairwiseMatrix: {},
      rounds: [],
      totalVotes: 0,
      rankings: []
    };
  }

  const matrix = buildPairwiseMatrix(votes, candidates);
  const rounds: CondorcetRound[] = [];

  // Build pairwise results for display
  const pairwiseResults: PairwiseResult[] = [];
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      pairwiseResults.push({
        candidateA: candidates[i],
        candidateB: candidates[j],
        winsA: matrix[candidates[i]][candidates[j]],
        winsB: matrix[candidates[j]][candidates[i]]
      });
    }
  }

  rounds.push({
    round: 1,
    description: 'Pairwise comparison: each candidate is compared head-to-head against every other candidate.',
    pairwise: pairwiseResults
  });

  // Try to find a pure Condorcet winner
  const condorcetWinner = findCondorcetWinner(matrix, candidates);

  // Build rankings
  const rankings = candidates.map(c => {
    let wins = 0, losses = 0, ties = 0;
    for (const other of candidates) {
      if (c === other) continue;
      if (matrix[c][other] > matrix[other][c]) wins++;
      else if (matrix[c][other] < matrix[other][c]) losses++;
      else ties++;
    }
    return { candidate: c, wins, losses, ties };
  }).sort((a, b) => b.wins - a.wins || a.losses - b.losses);

  if (condorcetWinner) {
    rounds.push({
      round: 2,
      description: `${condorcetWinner} is the Condorcet winner -- they beat every other candidate in head-to-head comparison.`,
      winner: condorcetWinner
    });

    return {
      winner: condorcetWinner,
      condorcetWinner: true,
      method: 'condorcet',
      pairwiseMatrix: matrix,
      rounds,
      totalVotes: votes.length,
      rankings
    };
  }

  // No Condorcet winner -- use Schulze method
  rounds.push({
    round: 2,
    description: 'No candidate beats all others head-to-head (cyclical preferences detected). Resolving via the Schulze method, which finds the strongest paths of preference through all candidates.'
  });

  const schulzeRanking = schulze(matrix, candidates);
  const winner = schulzeRanking[0];

  rounds.push({
    round: 3,
    description: `${winner} wins via the Schulze method (strongest path resolution).`,
    winner
  });

  return {
    winner,
    condorcetWinner: false,
    method: 'schulze',
    pairwiseMatrix: matrix,
    rounds,
    totalVotes: votes.length,
    rankings
  };
}

export function validateCondorcetVote(vote: string[], candidates: string[]): boolean {
  const validPreferences = vote.filter(pref => candidates.includes(pref));
  const uniquePreferences = new Set(validPreferences);
  return validPreferences.length === uniquePreferences.size && validPreferences.length >= 1;
}

export function exportCondorcetResultsCSV(result: CondorcetResult): string {
  let csv = 'Candidate A,Candidate B,Votes for A,Votes for B,Head-to-Head Winner\n';
  
  if (result.rounds[0]?.pairwise) {
    for (const pair of result.rounds[0].pairwise) {
      const winner = pair.winsA > pair.winsB ? pair.candidateA 
        : pair.winsB > pair.winsA ? pair.candidateB 
        : 'Tie';
      csv += `"${pair.candidateA}","${pair.candidateB}",${pair.winsA},${pair.winsB},"${winner}"\n`;
    }
  }

  csv += '\nRanking,Candidate,Head-to-Head Wins,Losses,Ties\n';
  result.rankings.forEach((r, i) => {
    csv += `${i + 1},"${r.candidate}",${r.wins},${r.losses},${r.ties}\n`;
  });

  csv += `\nMethod,Winner\n"${result.method}","${result.winner}"\n`;
  return csv;
}
