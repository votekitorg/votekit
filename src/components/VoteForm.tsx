'use client';

import { useState, useRef } from 'react';
import { sfcRuleDescription, type SfcRule } from '@/lib/sfc';
import RankedChoiceInput from './RankedChoiceInput';

interface Question {
  sfcRule?: SfcRule;
  id: number;
  title: string;
  description?: string;
  type: 'yes_no' | 'multiple_choice' | 'ranked_choice' | 'condorcet';
  options: string[];
  preferentialType?: 'compulsory' | 'optional';
}

interface VoteFormProps {
  questions: Question[];
  onSubmit: (votes: { [questionId: number]: any }) => Promise<void>;
  disabled?: boolean;
}

export default function VoteForm({ questions, onSubmit, disabled = false }: VoteFormProps) {
  const [submissionError, setSubmissionError] = useState('');
  const questionRefs = useRef<Record<number, HTMLDivElement | null>>({});
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
      } else if ((question.type === 'ranked_choice' || question.type === 'condorcet') && Array.isArray(vote)) {
        // For compulsory preferential, require all options to be ranked
        if (question.preferentialType === 'compulsory' && vote.length !== question.options.length) {
          newErrors[question.id] = 'Please rank all options';
          isValid = false;
        }
        // For optional preferential, require at least one option to be ranked
        else if (question.preferentialType === 'optional' && vote.length === 0) {
          newErrors[question.id] = 'Please rank at least one option';
          isValid = false;
        }
        // Default to compulsory behavior if preferentialType is not set
        else if (!question.preferentialType && vote.length !== question.options.length) {
          newErrors[question.id] = 'Please rank all options';
          isValid = false;
        }
      }
    });

    setErrors(newErrors);
    const firstMissing = questions.find(question => newErrors[question.id]);
    if (firstMissing) {
      requestAnimationFrame(() => {
        questionRefs.current[firstMissing.id]?.focus();
        questionRefs.current[firstMissing.id]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    }
    return isValid;
  };

  const handleSubmit = async () => {
    if (!validateVotes()) return;

    setSubmissionError('');
    setIsSubmitting(true);
    try {
      await onSubmit(votes);
    } catch (error) {
      setSubmissionError(error instanceof Error ? error.message : 'Your vote could not be submitted. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderQuestion = (question: Question, index: number) => {
    const vote = votes[question.id];
    const error = errors[question.id];

    return (
      <div key={question.id} ref={element => { questionRefs.current[question.id] = element; }} tabIndex={-1} aria-labelledby={`question-title-${question.id}`} aria-describedby={error ? `question-error-${question.id}` : undefined} className={`card scroll-mt-24 ${error ? 'border-2 border-red-600' : ''}`}>
        <div className="card-header">
          <p className="text-sm text-gray-600">Question {index + 1} of {questions.length} · Required</p>
          <h3 id={`question-title-${question.id}`} className="text-lg font-semibold text-gray-900">{question.title}</h3>
          {error && <p id={`question-error-${question.id}`} className="mt-2 text-red-700" role="alert">{error}</p>}
          {question.sfcRule && <p className="text-sm text-blue-900 mt-2">{sfcRuleDescription(question.sfcRule)}</p>}
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

          {(question.type === 'ranked_choice' || question.type === 'condorcet') && (
            <RankedChoiceInput
              options={question.options}
              value={Array.isArray(vote) ? vote : []}
              onChange={(rankings) => handleVoteChange(question.id, rankings)}
              disabled={disabled}
              preferentialType={question.preferentialType || 'compulsory'}
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

                  {(question.type === 'ranked_choice' || question.type === 'condorcet') && (
                    <div>
                      <div className="font-medium text-gray-900 mb-2">Your ranking:</div>
                      <ol className="space-y-2 text-gray-700">
                        {Array.isArray(vote) ? vote.map((option: string, index: number) => (
                          <li key={option} className="flex items-center rounded-lg border border-gray-200 bg-white p-3">
                            <span
                              className="mr-3 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-white"
                              aria-label={`Rank ${index + 1}`}
                            >
                              {index + 1}
                            </span>
                            <span className="font-medium text-gray-900">{option}</span>
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

        {submissionError && <div className="alert-error" role="alert">{submissionError}</div>}
        <div className="flex flex-col sm:flex-row justify-center gap-4">
          <button
            type="button"
            onClick={() => setShowReview(false)}
            disabled={disabled || isSubmitting}
            className="btn-secondary px-8"
          >
            Back to Edit
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={disabled || isSubmitting}
            className="btn-primary w-full sm:w-auto px-8"
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
      <div className="sticky top-0 z-10 bg-white border rounded-lg p-3" role="status">
        {questions.filter(question => {
          const value = votes[question.id];
          if (question.type === 'ranked_choice' || question.type === 'condorcet') return Array.isArray(value) && (question.preferentialType === 'optional' ? value.length > 0 : value.length === question.options.length);
          return Array.isArray(value) ? value.length > 0 : Boolean(value);
        }).length} of {questions.length} questions answered
      </div>
      {questions.map(renderQuestion)}
      {Object.keys(errors).length > 0 && <div className="alert-error" role="alert">
        Your ballot has not been submitted. Please complete Question {questions.findIndex(question => Boolean(errors[question.id])) + 1} before reviewing your votes.
      </div>}
      
      <div className="flex justify-center">
        <button
          type="button"
          onClick={() => {
            if (validateVotes()) {
              setShowReview(true);
            }
          }}
          disabled={disabled}
          className="btn-primary w-full sm:w-auto px-8"
        >
          Review Votes
        </button>
      </div>
    </div>
  );
}
