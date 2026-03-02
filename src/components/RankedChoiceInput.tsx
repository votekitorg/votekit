'use client';

import { useState, useRef, DragEvent } from 'react';

interface RankedChoiceInputProps {
  options: string[];
  value: string[];
  onChange: (rankings: string[]) => void;
  disabled?: boolean;
  preferentialType?: 'compulsory' | 'optional';
}

export default function RankedChoiceInput({
  options,
  value,
  onChange,
  disabled = false,
  preferentialType = 'compulsory'
}: RankedChoiceInputProps) {
  const [draggedItem, setDraggedItem] = useState<string | null>(null);
  const [dragSource, setDragSource] = useState<'ballot' | 'candidates' | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [dragOverBallot, setDragOverBallot] = useState(false);
  const dragCounter = useRef(0);
  const ballotDragCounter = useRef(0);

  // For compulsory: start with all options in ballot
  // For optional: start empty, user drags in
  const rankings = value.length > 0 ? value : (
    []
  );

  const availableOptions = options.filter(option => !rankings.includes(option));

  // --- Drag from candidates list ---
  const handleCandidateDragStart = (e: DragEvent<HTMLDivElement>, item: string) => {
    if (disabled) return;
    setDraggedItem(item);
    setDragSource('candidates');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', item);
  };

  // --- Drag within ballot ---
  const handleBallotDragStart = (e: DragEvent<HTMLDivElement>, item: string) => {
    if (disabled) return;
    setDraggedItem(item);
    setDragSource('ballot');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', item);
  };

  const handleDragEnd = () => {
    setDraggedItem(null);
    setDragSource(null);
    setDragOverIndex(null);
    setDragOverBallot(false);
    dragCounter.current = 0;
    ballotDragCounter.current = 0;
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    if (disabled) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  // Drop zone for the entire ballot area (for adding from candidates)
  const handleBallotDragEnter = (e: DragEvent<HTMLDivElement>) => {
    if (disabled) return;
    ballotDragCounter.current++;
    setDragOverBallot(true);
  };

  const handleBallotDragLeave = (e: DragEvent<HTMLDivElement>) => {
    if (disabled) return;
    ballotDragCounter.current--;
    if (ballotDragCounter.current === 0) {
      setDragOverBallot(false);
    }
  };

  const handleBallotDrop = (e: DragEvent<HTMLDivElement>) => {
    if (disabled) return;
    e.preventDefault();
    const item = draggedItem;
    if (!item) return;

    if (dragSource === 'candidates' && !rankings.includes(item)) {
      onChange([...rankings, item]);
    }
    handleDragEnd();
  };

  // Drop on a specific position within ballot (for reordering)
  const handlePositionDragEnter = (e: DragEvent<HTMLDivElement>, index: number) => {
    if (disabled) return;
    e.stopPropagation();
    dragCounter.current++;
    setDragOverIndex(index);
  };

  const handlePositionDragLeave = (e: DragEvent<HTMLDivElement>) => {
    if (disabled) return;
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setDragOverIndex(null);
    }
  };

  const handlePositionDrop = (e: DragEvent<HTMLDivElement>, dropIndex: number) => {
    if (disabled) return;
    e.preventDefault();
    e.stopPropagation();
    const item = draggedItem;
    if (!item) return;

    if (dragSource === 'candidates') {
      // Adding from candidates at a specific position
      if (!rankings.includes(item)) {
        const newRankings = [...rankings];
        newRankings.splice(dropIndex, 0, item);
        onChange(newRankings);
      }
    } else if (dragSource === 'ballot') {
      // Reordering within ballot
      const currentIndex = rankings.indexOf(item);
      if (currentIndex === -1) return;
      const newRankings = [...rankings];
      newRankings.splice(currentIndex, 1);
      newRankings.splice(dropIndex, 0, item);
      onChange(newRankings);
    }

    handleDragEnd();
  };

  // Drop back to candidates (remove from ballot)
  const handleCandidatesDrop = (e: DragEvent<HTMLDivElement>) => {
    if (disabled) return;
    e.preventDefault();
    const item = draggedItem;
    if (!item || dragSource !== 'ballot') return;
    onChange(rankings.filter(r => r !== item));
    handleDragEnd();
  };

  const moveItem = (fromIndex: number, direction: 'up' | 'down') => {
    if (disabled) return;
    const newIndex = direction === 'up' ? fromIndex - 1 : fromIndex + 1;
    if (newIndex < 0 || newIndex >= rankings.length) return;
    const newRankings = [...rankings];
    const [movedItem] = newRankings.splice(fromIndex, 1);
    newRankings.splice(newIndex, 0, movedItem);
    onChange(newRankings);
  };

  const addOption = (option: string) => {
    if (disabled || rankings.includes(option)) return;
    onChange([...rankings, option]);
  };

  const removeOption = (option: string) => {
    if (disabled) return;
    onChange(rankings.filter(item => item !== option));
  };

  return (
    <div className="space-y-3">
      <div className="text-sm font-medium text-gray-700">
        {preferentialType === 'optional'
          ? "Drag candidates into your ballot and rank them in order of preference (rank as few or many as you like):"
          : "Drag all candidates into your ballot and rank them in order of preference (you must rank every candidate):"}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Left: Ballot */}
        <div
          onDragOver={handleDragOver}
          onDragEnter={handleBallotDragEnter}
          onDragLeave={handleBallotDragLeave}
          onDrop={handleBallotDrop}
          className={`rounded-lg border-2 p-3 min-h-[200px] transition-colors ${
            dragOverBallot && dragSource === 'candidates'
              ? 'border-primary bg-green-50'
              : 'border-gray-300 bg-white'
          }`}
        >
          <h4 className="text-sm font-semibold text-gray-800 mb-3 uppercase tracking-wide">Your Ballot</h4>
          
          {rankings.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-gray-400 text-sm border-2 border-dashed border-gray-200 rounded-lg">
              {preferentialType === 'optional' 
                ? 'Drag candidates here to rank them'
                : 'No options available'}
            </div>
          ) : (
            <div className="space-y-2">
              {rankings.map((option, index) => (
                <div
                  key={option}
                  draggable={!disabled}
                  onDragStart={(e) => handleBallotDragStart(e, option)}
                  onDragEnd={handleDragEnd}
                  onDragOver={handleDragOver}
                  onDragEnter={(e) => handlePositionDragEnter(e, index)}
                  onDragLeave={handlePositionDragLeave}
                  onDrop={(e) => handlePositionDrop(e, index)}
                  className={`
                    flex items-center justify-between p-2.5 rounded-lg border-2 transition-all duration-150
                    ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-grab active:cursor-grabbing'}
                    ${draggedItem === option && dragSource === 'ballot' ? 'opacity-40 scale-95' : ''}
                    ${dragOverIndex === index ? 'border-primary bg-blue-50 shadow-md' : 'border-gray-200 bg-gray-50'}
                    ${!disabled ? 'hover:border-gray-400 hover:shadow-sm' : ''}
                  `}
                >
                  <div className="flex items-center flex-1 min-w-0">
                    <div className="mr-2 text-gray-300 flex-shrink-0">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
                      </svg>
                    </div>
                    <div className="w-7 h-7 bg-primary text-white rounded-full flex items-center justify-center text-xs font-bold mr-2.5 flex-shrink-0">
                      {index + 1}
                    </div>
                    <span className="text-gray-900 font-medium text-sm truncate">{option}</span>
                  </div>

                  {!disabled && (
                    <div className="flex items-center space-x-0.5 flex-shrink-0 ml-2">
                      <button
                        type="button"
                        onClick={() => moveItem(index, 'up')}
                        disabled={index === 0}
                        className="p-1 text-gray-400 hover:text-primary disabled:opacity-20 transition-colors"
                        title="Move up"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => moveItem(index, 'down')}
                        disabled={index === rankings.length - 1}
                        className="p-1 text-gray-400 hover:text-primary disabled:opacity-20 transition-colors"
                        title="Move down"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                      <button
                          type="button"
                          onClick={() => removeOption(option)}
                          className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                          title="Remove from ballot"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: Available Candidates */}
        <div
          onDragOver={handleDragOver}
          onDrop={handleCandidatesDrop}
          className={`rounded-lg border-2 p-3 min-h-[200px] transition-colors ${
            dragSource === 'ballot' ? 'border-orange-300 bg-orange-50' : 'border-gray-300 bg-gray-50'
          }`}
        >
          <h4 className="text-sm font-semibold text-gray-800 mb-3 uppercase tracking-wide">Candidates</h4>
          
          {availableOptions.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-gray-400 text-sm border-2 border-dashed border-gray-200 rounded-lg">
              All candidates ranked
            </div>
          ) : (
            <div className="space-y-2">
              {availableOptions.map((option) => (
                <div
                  key={option}
                  draggable={!disabled}
                  onDragStart={(e) => handleCandidateDragStart(e, option)}
                  onDragEnd={handleDragEnd}
                  onClick={() => addOption(option)}
                  className={`
                    flex items-center p-2.5 rounded-lg border-2 transition-all duration-150
                    ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-grab active:cursor-grabbing hover:border-primary hover:bg-white hover:shadow-sm'}
                    ${draggedItem === option && dragSource === 'candidates' ? 'opacity-40 scale-95' : ''}
                    border-gray-200 bg-white
                  `}
                >
                  <div className="w-7 h-7 bg-gray-300 text-gray-600 rounded-full flex items-center justify-center text-xs font-bold mr-2.5 flex-shrink-0">
                    +
                  </div>
                  <span className="text-gray-700 font-medium text-sm">{option}</span>
                </div>
              ))}
            </div>
          )}

          {dragSource === 'ballot' && (
            <p className="text-xs text-orange-600 mt-2 text-center">Drop here to remove from ballot</p>
          )}
        </div>
      </div>

      <p className="text-xs text-gray-500">
        {preferentialType === 'optional'
          ? "Rank as few or many candidates as you like. Position 1 is your most preferred."
          : "You must rank every candidate to submit your vote. Position 1 is your most preferred."}
      </p>
    </div>
  );
}
