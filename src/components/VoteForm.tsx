'use client';

import { useState } from 'react';
import RankedChoiceInput from './RankedChoiceInput';

interface Question {
  id: number;
  title: string;
  description?: string;
  type: 'yes_no' | 'multiple_choice' | 'ranked_choice';
  options: string[];
}

interface VoteFormProps {
  questions: Question[];
  onSubmit: (votes: { [questionId: number]: any }) => Promise<void>;
  disabled?: boolean;
}

export default function VoteForm({ questions, onSubmit, disabled = false }: VoteFormProps) {
  const [votes, setVotes] = useState<{ [questionId: number]: any }>({});
  const [showReview, setShowReview] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ [questionId: number]: string }>({});

  const handleVoteChange = (questionId: number, value: any) => {
    setVotes(prev => ({ ...prev, [questionId]: value }));
    // Clear error when user makes a selection
    if (errors[questionId]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[questionId];
        return newErrors;
      });
    }
  };

  const validateVotes = (): boolean => {
    const newErrors: { [questionId: number]: string } = {};
    let isValid = true;

    questions.forEach(question => {
      const vote = votes[question.id];
      
      if (!vote || (Array.isArray(vote) && vote.length === 0)) {
        newErrors[question.id] = 'This question is required';
        isValid = false;
      } else if (question.type === 'multiple_choice' && Array.isArray(vote) && vote.length === 0) {
        newErrors[question.id] = 'Please select at least one option';
        isValid = false;
      } else if (question.type === 'ranked_choice' && Array.isArray(vote) && vote.length !== question.options.length) {
        newErrors[question.id] = 'Please rank all options';
        isValid = false;
      }
    });

    setErrors(newErrors);
    return isValid;
  };

  const handleSubmit = async () => {
    if (!validateVotes()) return;

    setIsSubmitting(true);
    try {
      await onSubmit(votes);
    } catch (error) {
      console.error('Failed to submit votes:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderQuestion = (question: Question) => {
    const vote = votes[question.id];
    const error = errors[question.id];

    return (
      <div key={question.id} className="card">
        <div className="card-header">
          <h3 className="text-lg font-semibold text-gray-900">{question.title}</h3>
          {question.description && (
            <p className="text-sm text-gray-600 mt-1">{question.description}</p>
          )}
        </div>
        
        <div className="card-body">
          {question.type === 'yes_no' && (
            <div className="space-y-3">
              {question.options.map(option => (
                <label key={option} className="flex items-center cursor-pointer">
                  <input
                    type="radio"
                    name={`question-${question.id}`}
                    value={option}
                    checked={vote === option}
                    onChange={(e) => handleVoteChange(question.id, e.target.value)}
                    disabled={disabled}
                    className="w-4 h-4 text-primary border-gray-300 focus:ring-primary focus:ring-2 disabled:opacity-50"
                  />
                  <span className="ml-3 text-gray-900 font-medium">{option}</span>
                </label>
              ))}
            </div>
          )}

          {question.type === 'multiple_choice' && (
            <div className="space-y-3">
              {question.options.map(option => (
                <label key={option} className="flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    value={option}
                    checked={Array.isArray(vote) ? vote.includes(option) : false}
                    onChange={(e) => {
                      const currentVotes = Array.isArray(vote) ? vote : [];
                      if (e.target.checked) {
                        handleVoteChange(question.id, [...currentVotes, option]);
                      } else {
                        handleVoteChange(question.id, currentVotes.filter(v => v !== option));
                      }
                    }}
                    disabled={disabled}
                    className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary focus:ring-2 disabled:opacity-50"
                  />
                  <span className="ml-3 text-gray-900 font-medium">{option}</span>
                </label>
              ))}
            </div>
          )}

          {question.type === 'ranked_choice' && (
            <RankedChoiceInput
              options={question.options}
              value={Array.isArray(vote) ? vote : []}
              onChange={(rankings) => handleVoteChange(question.id, rankings)}
              disabled={disabled}
            />
          )}

          {error && (
            <p className="text-red-600 text-sm mt-2">{error}</p>
          )}
        </div>
      </div>
    );
  };

  if (showReview) {
    return (
      <div className="space-y-6">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Review Your Votes</h2>
          <p className="text-gray-600">
            Please review your selections carefully. Once submitted, votes cannot be changed.
          </p>
        </div>

        {questions.map(question => {
          const vote = votes[question.id];
          
          return (
            <div key={question.id} className="card">
              <div className="card-header">
                <h3 className="text-lg font-semibold text-gray-900">{question.title}</h3>
              </div>
              
              <div className="card-body">
                <div className="bg-gray-50 rounded-lg p-4">
                  {question.type === 'yes_no' && (
                    <div className="font-medium text-gray-900">
                      Your vote: <span className="text-primary">{vote}</span>
                    </div>
                  )}

                  {question.type === 'multiple_choice' && (
                    <div>
                      <div className="font-medium text-gray-900 mb-2">Your selections:</div>
                      <ul className="list-disc list-inside text-gray-700 space-y-1">
                        {Array.isArray(vote) ? vote.map((option: string) => (
                          <li key={option}>{option}</li>
                        )) : <li>No selection</li>}
                      </ul>
                    </div>
                  )}

                  {question.type === 'ranked_choice' && (
                    <div>
                      <div className="font-medium text-gray-900 mb-2">Your ranking:</div>
                      <ol className="list-decimal list-inside text-gray-700 space-y-1">
                        {Array.isArray(vote) ? vote.map((option: string, index: number) => (
                          <li key={option}>
                            <span className="font-medium">#{index + 1}:</span> {option}
                          </li>
                        )) : <li>No ranking provided</li>}
                      </ol>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        <div className="flex justify-center space-x-4">
          <button
            type="button"
            onClick={() => setShowReview(false)}
            disabled={isSubmitting}
            className="btn-secondary px-8"
          >
            Back to Edit
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="btn-primary px-8"
          >
            {isSubmitting ? (
              <>
                <div className="spinner mr-2"></div>
                Submitting...
              </>
            ) : (
              'Submit Votes'
            )}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {questions.map(renderQuestion)}
      
      <div className="flex justify-center">
        <button
          type="button"
          onClick={() => {
            if (validateVotes()) {
              setShowReview(true);
            }
          }}
          disabled={disabled || Object.keys(votes).length === 0}
          className="btn-primary px-8"
        >
          Review Votes
        </button>
      </div>
    </div>
  );
}