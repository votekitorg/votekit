'use client';

import { useState, useRef, DragEvent } from 'react';

interface RankedChoiceInputProps {
  options: string[];
  value: string[];
  onChange: (rankings: string[]) => void;
  disabled?: boolean;
}

export default function RankedChoiceInput({
  options,
  value,
  onChange,
  disabled = false
}: RankedChoiceInputProps) {
  const [draggedItem, setDraggedItem] = useState<string | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const dragCounter = useRef(0);

  // Initialize rankings if empty
  const rankings = value.length > 0 ? value : [...options];

  const handleDragStart = (e: DragEvent<HTMLDivElement>, item: string) => {
    if (disabled) return;
    setDraggedItem(item);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', item);
  };

  const handleDragEnd = () => {
    setDraggedItem(null);
    setDragOverIndex(null);
    dragCounter.current = 0;
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    if (disabled) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDragEnter = (e: DragEvent<HTMLDivElement>, index: number) => {
    if (disabled) return;
    dragCounter.current++;
    setDragOverIndex(index);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    if (disabled) return;
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setDragOverIndex(null);
    }
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>, dropIndex: number) => {
    if (disabled) return;
    e.preventDefault();
    
    const draggedOption = draggedItem;
    if (!draggedOption) return;

    const currentIndex = rankings.indexOf(draggedOption);
    if (currentIndex === -1) return;

    // Create new array with item moved
    const newRankings = [...rankings];
    newRankings.splice(currentIndex, 1);
    newRankings.splice(dropIndex, 0, draggedOption);

    onChange(newRankings);
    setDraggedItem(null);
    setDragOverIndex(null);
    dragCounter.current = 0;
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

  return (
    <div className="space-y-3">
      <div className="text-sm font-medium text-gray-700 mb-2">
        Drag to reorder your preferences (1 = most preferred):
      </div>
      
      <div className="space-y-2">
        {rankings.map((option, index) => (
          <div
            key={option}
            draggable={!disabled}
            onDragStart={(e) => handleDragStart(e, option)}
            onDragEnd={handleDragEnd}
            onDragOver={handleDragOver}
            onDragEnter={(e) => handleDragEnter(e, index)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, index)}
            className={`
              flex items-center justify-between p-3 rounded-lg border-2 transition-all duration-200
              ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-move'}
              ${draggedItem === option ? 'opacity-50 rotate-1' : ''}
              ${dragOverIndex === index ? 'border-primary bg-primary-light bg-opacity-10' : 'border-gray-300 bg-white'}
              ${!disabled ? 'hover:border-primary-light hover:shadow-md' : ''}
            `}
          >
            <div className="flex items-center flex-1">
              {/* Drag handle */}
              <div className="mr-3 text-gray-400">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
                </svg>
              </div>
              
              {/* Rank number */}
              <div className="w-8 h-8 bg-primary text-white rounded-full flex items-center justify-center text-sm font-bold mr-3">
                {index + 1}
              </div>
              
              {/* Option text */}
              <span className="text-gray-900 font-medium">{option}</span>
            </div>

            {/* Move buttons */}
            {!disabled && (
              <div className="flex space-x-1">
                <button
                  type="button"
                  onClick={() => moveItem(index, 'up')}
                  disabled={index === 0}
                  className="p-1 text-gray-400 hover:text-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  title="Move up"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => moveItem(index, 'down')}
                  disabled={index === rankings.length - 1}
                  className="p-1 text-gray-400 hover:text-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  title="Move down"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="text-xs text-gray-500 mt-3">
        <strong>Instructions:</strong> Drag items to reorder them, or use the arrow buttons. 
        Your first choice should be at the top (position 1).
      </div>
    </div>
  );
}