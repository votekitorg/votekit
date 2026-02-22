'use client';

interface ResultsChartProps {
  data: { [key: string]: number };
  type: 'yes_no' | 'multiple_choice' | 'ranked_choice' | 'condorcet';
  title: string;
  totalVotes?: number;
}

export default function ResultsChart({ data, type, title, totalVotes }: ResultsChartProps) {
  const total = totalVotes || Object.values(data).reduce((sum, count) => sum + count, 0);
  const maxValue = Math.max(...Object.values(data));

  // Sort by vote count (descending)
  const sortedEntries = Object.entries(data).sort(([, a], [, b]) => b - a);

  const getColor = (index: number, isYesNo: boolean = false) => {
    if (isYesNo) {
      return index === 0 ? '#00843D' : '#ef4444'; // Green for yes/first, red for no/second
    }
    
    const colors = [
      '#00843D', // Primary green
      '#4CAF50', // Light green
      '#1B5E20', // Dark green
      '#81C784', // Very light green
      '#2E7D32', // Medium green
      '#A5D6A7', // Pale green
      '#388E3C', // Another medium green
      '#C8E6C9', // Very pale green
    ];
    return colors[index % colors.length];
  };

  if (total === 0) {
    return (
      <div className="card">
        <div className="card-header">
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        </div>
        <div className="card-body">
          <div className="text-center py-8 text-gray-500">
            No votes recorded
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-header">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          <span className="text-sm text-gray-600">
            {total} vote{total !== 1 ? 's' : ''}
          </span>
        </div>
      </div>
      
      <div className="card-body">
        <div className="space-y-4">
          {sortedEntries.map(([option, count], index) => {
            const percentage = total > 0 ? (count / total) * 100 : 0;
            const barWidth = maxValue > 0 ? (count / maxValue) * 100 : 0;
            
            return (
              <div key={option} className="space-y-2">
                <div className="flex justify-between items-center">
                  <div className="flex items-center space-x-2">
                    <div
                      className="w-4 h-4 rounded-full"
                      style={{ backgroundColor: getColor(index, type === 'yes_no') }}
                    ></div>
                    <span className="font-medium text-gray-900">{option}</span>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-gray-900">{count}</div>
                    <div className="text-sm text-gray-600">{percentage.toFixed(1)}%</div>
                  </div>
                </div>
                
                <div className="progress-bar">
                  <div
                    className="h-full rounded-full transition-all duration-500 ease-out"
                    style={{
                      width: `${barWidth}%`,
                      backgroundColor: getColor(index, type === 'yes_no')
                    }}
                  ></div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Summary for Yes/No questions */}
        {type === 'yes_no' && sortedEntries.length === 2 && (
          <div className="mt-6 pt-4 border-t border-gray-200">
            <div className="text-center">
              {sortedEntries[0][1] > sortedEntries[1][1] ? (
                <div className="text-green-700 font-semibold">
                  <svg className="w-5 h-5 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {sortedEntries[0][0]} wins by {sortedEntries[0][1] - sortedEntries[1][1]} vote{sortedEntries[0][1] - sortedEntries[1][1] !== 1 ? 's' : ''}
                </div>
              ) : sortedEntries[0][1] < sortedEntries[1][1] ? (
                <div className="text-red-700 font-semibold">
                  <svg className="w-5 h-5 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {sortedEntries[1][0]} wins by {sortedEntries[1][1] - sortedEntries[0][1]} vote{sortedEntries[1][1] - sortedEntries[0][1] !== 1 ? 's' : ''}
                </div>
              ) : (
                <div className="text-gray-700 font-semibold">
                  <svg className="w-5 h-5 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Tied result
                </div>
              )}
            </div>
          </div>
        )}

        {/* Winner for multiple choice */}
        {type === 'multiple_choice' && sortedEntries.length > 1 && sortedEntries[0][1] > sortedEntries[1][1] && (
          <div className="mt-6 pt-4 border-t border-gray-200">
            <div className="text-center text-primary font-semibold">
              <svg className="w-5 h-5 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Winner: {sortedEntries[0][0]}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}