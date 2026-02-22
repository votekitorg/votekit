'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import AdminLayout from '@/components/AdminLayout';

interface Question {
  title: string;
  description: string;
  type: 'yes_no' | 'multiple_choice' | 'ranked_choice' | 'condorcet';
  options: string[];
}

export default function CreatePlebiscite() {
  const now = new Date();
  const defaultOpenDate = now.toISOString().slice(0, 16);
  const defaultCloseDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16);

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    info_url: '',
    open_date: defaultOpenDate,
    close_date: defaultCloseDate
  });
  const [questions, setQuestions] = useState<Question[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  const router = useRouter();

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const addQuestion = () => {
    setQuestions([...questions, {
      title: '',
      description: '',
      type: 'yes_no',
      options: ['Yes', 'No']
    }]);
  };

  const updateQuestion = (index: number, field: keyof Question, value: any) => {
    const newQuestions = [...questions];
    newQuestions[index] = { ...newQuestions[index], [field]: value };
    
    // Auto-set options for Yes/No questions
    if (field === 'type' && value === 'yes_no') {
      newQuestions[index].options = ['Yes', 'No'];
    } else if (field === 'type' && value !== 'yes_no' && newQuestions[index].options.length === 2) {
      newQuestions[index].options = ['Option 1', 'Option 2'];
    }
    
    setQuestions(newQuestions);
  };

  const removeQuestion = (index: number) => {
    setQuestions(questions.filter((_, i) => i !== index));
  };

  const addOption = (questionIndex: number) => {
    const newQuestions = [...questions];
    newQuestions[questionIndex].options.push(`Option ${newQuestions[questionIndex].options.length + 1}`);
    setQuestions(newQuestions);
  };

  const updateOption = (questionIndex: number, optionIndex: number, value: string) => {
    const newQuestions = [...questions];
    newQuestions[questionIndex].options[optionIndex] = value;
    setQuestions(newQuestions);
  };

  const removeOption = (questionIndex: number, optionIndex: number) => {
    const newQuestions = [...questions];
    if (newQuestions[questionIndex].options.length > 2) {
      newQuestions[questionIndex].options = newQuestions[questionIndex].options.filter((_, i) => i !== optionIndex);
      setQuestions(newQuestions);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validation
    if (!formData.title || !formData.description || !formData.open_date || !formData.close_date) {
      setError('Please fill in all required fields');
      return;
    }

    if (new Date(formData.open_date) >= new Date(formData.close_date)) {
      setError('Close date must be after open date');
      return;
    }

    if (questions.length === 0) {
      setError('Please add at least one question');
      return;
    }

    // Validate questions
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q.title) {
        setError(`Question ${i + 1} must have a title`);
        return;
      }
      if (q.options.length < 2) {
        setError(`Question ${i + 1} must have at least 2 options`);
        return;
      }
      if (q.type === 'yes_no' && q.options.length !== 2) {
        setError(`Question ${i + 1} is Yes/No type and must have exactly 2 options`);
        return;
      }
    }

    setIsSubmitting(true);
    setError('');
    setSuccess('');

    try {
      const response = await fetch('/plebiscite/api/admin/plebiscites', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...formData,
          questions
        }),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        router.push(`/admin/plebiscites/${result.plebiscite.id}`);
      } else {
        setError(result.error || 'Failed to create plebiscite');
      }
    } catch (error) {
      setError('An error occurred. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AdminLayout>
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Create New Plebiscite</h1>
          <p className="text-gray-600">Set up a new plebiscite with questions and voting options</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Basic Information */}
          <div className="card">
            <div className="card-header">
              <h2 className="text-lg font-semibold text-gray-900">Basic Information</h2>
            </div>
            <div className="card-body space-y-4">
              <div>
                <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-1">
                  Title *
                </label>
                <input
                  type="text"
                  id="title"
                  name="title"
                  value={formData.title}
                  onChange={handleInputChange}
                  className="input-field"
                  placeholder="e.g., Policy Direction Survey 2024"
                  required
                />
              </div>

              <div>
                <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
                  Description *
                </label>
                <textarea
                  id="description"
                  name="description"
                  rows={4}
                  value={formData.description}
                  onChange={handleInputChange}
                  className="textarea-field"
                  placeholder="Describe the purpose and context of this plebiscite..."
                  required
                />
                <p className="text-sm text-gray-500 mt-1">
                  This will be shown to voters. You can use basic markdown formatting.
                </p>
              </div>

              <div>
                <label htmlFor="info_url" className="block text-sm font-medium text-gray-700 mb-1">
                  Background Information URL
                </label>
                <input
                  type="url"
                  id="info_url"
                  name="info_url"
                  value={formData.info_url}
                  onChange={handleInputChange}
                  className="input-field"
                  placeholder="https://example.com/background-info"
                />
                <p className="text-sm text-gray-500 mt-1">
                  Optional link to additional information for voters
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="open_date" className="block text-sm font-medium text-gray-700 mb-1">
                    Opening Date & Time *
                  </label>
                  <input
                    type="datetime-local"
                    id="open_date"
                    name="open_date"
                    value={formData.open_date}
                    onChange={handleInputChange}
                    className="input-field"
                    required
                  />
                </div>

                <div>
                  <label htmlFor="close_date" className="block text-sm font-medium text-gray-700 mb-1">
                    Closing Date & Time *
                  </label>
                  <input
                    type="datetime-local"
                    id="close_date"
                    name="close_date"
                    value={formData.close_date}
                    onChange={handleInputChange}
                    className="input-field"
                    required
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Questions */}
          <div className="card">
            <div className="card-header">
              <div className="flex justify-between items-center">
                <h2 className="text-lg font-semibold text-gray-900">Questions</h2>
                <button
                  type="button"
                  onClick={addQuestion}
                  className="btn-primary"
                >
                  Add Question
                </button>
              </div>
            </div>
            <div className="card-body">
              {questions.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  No questions added yet. Click "Add Question" to get started.
                </div>
              ) : (
                <div className="space-y-6">
                  {questions.map((question, qIndex) => (
                    <div key={qIndex} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex justify-between items-start mb-4">
                        <h3 className="text-md font-medium text-gray-900">Question {qIndex + 1}</h3>
                        <button
                          type="button"
                          onClick={() => removeQuestion(qIndex)}
                          className="text-red-600 hover:text-red-800"
                        >
                          Remove
                        </button>
                      </div>

                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Question Title *
                          </label>
                          <input
                            type="text"
                            value={question.title}
                            onChange={(e) => updateQuestion(qIndex, 'title', e.target.value)}
                            className="input-field"
                            placeholder="Enter your question..."
                            required
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Description (optional)
                          </label>
                          <textarea
                            value={question.description}
                            onChange={(e) => updateQuestion(qIndex, 'description', e.target.value)}
                            className="textarea-field"
                            rows={2}
                            placeholder="Additional context or instructions..."
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Question Type *
                          </label>
                          <select
                            value={question.type}
                            onChange={(e) => updateQuestion(qIndex, 'type', e.target.value as Question['type'])}
                            className="select-field"
                          >
                            <option value="yes_no">Yes/No</option>
                            <option value="multiple_choice">Multiple Choice</option>
                            <option value="ranked_choice">Ranked Choice (Preferential / IRV)</option>
                            <option value="condorcet">Condorcet (Pairwise / Schulze)</option>
                          </select>
                        </div>

                        <div>
                          <div className="flex justify-between items-center mb-2">
                            <label className="block text-sm font-medium text-gray-700">
                              Options *
                            </label>
                            {question.type !== 'yes_no' && (
                              <button
                                type="button"
                                onClick={() => addOption(qIndex)}
                                className="text-sm text-primary hover:text-primary-dark"
                              >
                                Add Option
                              </button>
                            )}
                          </div>
                          
                          <div className="space-y-2">
                            {question.options.map((option, oIndex) => (
                              <div key={oIndex} className="flex items-center space-x-2">
                                <input
                                  type="text"
                                  value={option}
                                  onChange={(e) => updateOption(qIndex, oIndex, e.target.value)}
                                  className="input-field"
                                  placeholder={`Option ${oIndex + 1}`}
                                  disabled={question.type === 'yes_no'}
                                  required
                                />
                                {question.type !== 'yes_no' && question.options.length > 2 && (
                                  <button
                                    type="button"
                                    onClick={() => removeOption(qIndex, oIndex)}
                                    className="text-red-600 hover:text-red-800"
                                  >
                                    Remove
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                          
                          {question.type === 'ranked_choice' && (
                            <p className="text-sm text-gray-500 mt-2">
                              Voters will rank these options in order of preference. IRV (Instant Runoff Voting) will be used to determine the winner.
                            </p>
                          )}
                          {question.type === 'condorcet' && (
                            <p className="text-sm text-gray-500 mt-2">
                              Voters will rank these options. Every option is compared head-to-head against every other. If one beats all others, it wins outright. Otherwise, the Schulze method resolves cycles.
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Submit */}
          <div className="flex justify-between items-center">
            <button
              type="button"
              onClick={() => router.back()}
              className="btn-secondary"
            >
              Cancel
            </button>
            
            <div className="space-x-4">
              {error && <div className="alert-error inline-block">{error}</div>}
              {success && <div className="alert-success inline-block">{success}</div>}
              
              <button
                type="submit"
                disabled={isSubmitting}
                className="btn-primary"
              >
                {isSubmitting ? (
                  <>
                    <div className="spinner mr-2"></div>
                    Creating...
                  </>
                ) : (
                  'Create Plebiscite'
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </AdminLayout>
  );
}