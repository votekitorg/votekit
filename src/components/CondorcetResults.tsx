'use client';

interface PairwiseResult {
  candidateA: string;
  candidateB: string;
  winsA: number;
  winsB: number;
}

interface CondorcetRound {
  round: number;
  description: string;
  pairwise?: PairwiseResult[];
  winner?: string;
}

interface Ranking {
  candidate: string;
  wins: number;
  losses: number;
  ties: number;
}

interface CondorcetResultsProps {
  title: string;
  results: {
    winner: string | null;
    condorcetWinner: boolean;
    method: string;
    pairwiseMatrix: { [a: string]: { [b: string]: number } };
    rounds: CondorcetRound[];
    totalVotes: number;
    rankings: Ranking[];
  };
  options: string[];
}

export default function CondorcetResults({ title, results, options }: CondorcetResultsProps) {
  if (results.totalVotes === 0) {
    return (
      <div className="card">
        <div className="card-header">
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        </div>
        <div className="card-body text-center py-8 text-gray-500">No votes recorded</div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-header">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          <span className="text-sm text-gray-600">{results.totalVotes} vote{results.totalVotes !== 1 ? 's' : ''}</span>
        </div>
      </div>

      <div className="card-body space-y-8">
        {/* Winner */}
        {results.winner && (
          <div className="text-center bg-green-50 border border-green-200 rounded-lg p-6">
            <div className="text-sm text-green-600 font-medium mb-1">
              {results.condorcetWinner ? 'Condorcet Winner' : 'Winner (Schulze Method)'}
            </div>
            <div className="text-2xl font-bold text-green-800">{results.winner}</div>
            <div className="text-sm text-green-600 mt-1">
              {results.condorcetWinner 
                ? 'Beats every other option in head-to-head comparison' 
                : 'No option beats all others; resolved via strongest paths'}
            </div>
          </div>
        )}

        {/* Rankings Table */}
        <div>
          <h4 className="text-md font-semibold text-gray-900 mb-3">Overall Rankings</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 px-3 font-medium text-gray-700">Rank</th>
                  <th className="text-left py-2 px-3 font-medium text-gray-700">Option</th>
                  <th className="text-center py-2 px-3 font-medium text-gray-700">Wins</th>
                  <th className="text-center py-2 px-3 font-medium text-gray-700">Losses</th>
                  <th className="text-center py-2 px-3 font-medium text-gray-700">Ties</th>
                </tr>
              </thead>
              <tbody>
                {results.rankings.map((r, i) => (
                  <tr key={r.candidate} className={`border-b border-gray-100 ${r.candidate === results.winner ? 'bg-green-50' : ''}`}>
                    <td className="py-2 px-3 font-medium text-gray-900">{i + 1}</td>
                    <td className="py-2 px-3 text-gray-900">
                      {r.candidate}
                      {r.candidate === results.winner && (
                        <span className="ml-2 text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full">Winner</span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-center text-green-700 font-medium">{r.wins}</td>
                    <td className="py-2 px-3 text-center text-red-600 font-medium">{r.losses}</td>
                    <td className="py-2 px-3 text-center text-gray-500">{r.ties}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pairwise Matrix */}
        <div>
          <h4 className="text-md font-semibold text-gray-900 mb-3">Head-to-Head Matchups</h4>
          <p className="text-sm text-gray-500 mb-3">
            Each cell shows how many voters prefer the row option over the column option.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 px-2 font-medium text-gray-700">vs.</th>
                  {options.map(opt => (
                    <th key={opt} className="text-center py-2 px-2 font-medium text-gray-700 min-w-[80px]">
                      {opt.length > 15 ? opt.slice(0, 15) + '...' : opt}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {options.map(rowOpt => (
                  <tr key={rowOpt} className="border-b border-gray-100">
                    <td className="py-2 px-2 font-medium text-gray-900">
                      {rowOpt.length > 20 ? rowOpt.slice(0, 20) + '...' : rowOpt}
                    </td>
                    {options.map(colOpt => {
                      if (rowOpt === colOpt) {
                        return <td key={colOpt} className="py-2 px-2 text-center bg-gray-100 text-gray-400">-</td>;
                      }
                      const val = results.pairwiseMatrix?.[rowOpt]?.[colOpt] ?? 0;
                      const opp = results.pairwiseMatrix?.[colOpt]?.[rowOpt] ?? 0;
                      const isWin = val > opp;
                      const isTie = val === opp;
                      return (
                        <td key={colOpt} className={`py-2 px-2 text-center font-medium ${isWin ? 'text-green-700 bg-green-50' : isTie ? 'text-gray-500' : 'text-red-600 bg-red-50'}`}>
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

        {/* Rounds / Process */}
        <div>
          <h4 className="text-md font-semibold text-gray-900 mb-3">Counting Process</h4>
          <div className="space-y-3">
            {results.rounds.map((round) => (
              <div key={round.round} className={`p-4 rounded-lg border ${round.winner ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-gray-50'}`}>
                <div className="text-sm font-medium text-gray-700 mb-1">Step {round.round}</div>
                <p className="text-sm text-gray-800">{round.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
