'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import AdminLayout from '@/components/AdminLayout';

interface Question {
  title: string;
  description: string;
  type: 'yes_no' | 'multiple_choice' | 'ranked_choice' | 'condorcet';
  options: string[];
  preferentialType?: 'compulsory' | 'optional'; // Only applies to ranked_choice and condorcet
}

export default function CreatePlebiscite() {
  const now = new Date();
  const defaultOpenDate = now.toISOString().slice(0, 16);
  const defaultCloseDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16);

  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    info_url: '',
    open_date: defaultOpenDate,
    close_date: defaultCloseDate,
    timezone: 'Australia/Brisbane'
  });
  const [questions, setQuestions] = useState<Question[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  const router = useRouter();

  const steps = [
    { id: 1, name: 'Basic Information', description: 'Title, dates, and description' },
    { id: 2, name: 'Questions', description: 'Add questions and voting methods' },
    { id: 3, name: 'Review', description: 'Preview before publishing' }
  ];

  
  const timezoneOptions = [
    { value: 'Australia/Brisbane', label: 'Brisbane (AEST, UTC+10)' },
    { value: 'Australia/Sydney', label: 'Sydney (AEST/AEDT, UTC+10/+11)' },
    { value: 'Australia/Melbourne', label: 'Melbourne (AEST/AEDT, UTC+10/+11)' },
    { value: 'Australia/Adelaide', label: 'Adelaide (ACST/ACDT, UTC+9:30/+10:30)' },
    { value: 'Australia/Perth', label: 'Perth (AWST, UTC+8)' },
    { value: 'Australia/Darwin', label: 'Darwin (ACST, UTC+9:30)' },
    { value: 'Australia/Hobart', label: 'Hobart (AEST/AEDT, UTC+10/+11)' },
    { value: 'Pacific/Auckland', label: 'Auckland (NZST/NZDT, UTC+12/+13)' },
    { value: 'Asia/Singapore', label: 'Singapore (SGT, UTC+8)' },
    { value: 'Asia/Tokyo', label: 'Tokyo (JST, UTC+9)' },
    { value: 'Europe/London', label: 'London (GMT/BST, UTC+0/+1)' },
    { value: 'America/New_York', label: 'New York (EST/EDT, UTC-5/-4)' },
    { value: 'America/Los_Angeles', label: 'Los Angeles (PST/PDT, UTC-8/-7)' },
    { value: 'UTC', label: 'UTC' },
  ];

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const addQuestion = () => {
    setQuestions([...questions, {
      title: '',
      description: '',
      type: 'yes_no',
      options: ['Yes', 'No'],
      preferentialType: 'compulsory'
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
    
    // Set default preferential type for ranked voting
    if (field === 'type' && (value === 'ranked_choice' || value === 'condorcet')) {
      if (!newQuestions[index].preferentialType) {
        newQuestions[index].preferentialType = 'compulsory';
      }
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

  const validateStep1 = (): boolean => {
    setError('');
    
    if (!formData.title.trim()) {
      setError('Title is required');
      return false;
    }
    if (!formData.description.trim()) {
      setError('Description is required');
      return false;
    }
    if (!formData.open_date) {
      setError('Opening date is required');
      return false;
    }
    if (!formData.close_date) {
      setError('Closing date is required');
      return false;
    }
    if (new Date(formData.open_date) >= new Date(formData.close_date)) {
      setError('Closing date must be after opening date');
      return false;
    }
    if (new Date(formData.open_date) < new Date()) {
      setError('Opening date cannot be in the past');
      return false;
    }
    
    return true;
  };

  const validateStep2 = (): boolean => {
    setError('');
    
    if (questions.length === 0) {
      setError('Please add at least one question');
      return false;
    }

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q.title.trim()) {
        setError(`Question ${i + 1} must have a title`);
        return false;
      }
      if (q.options.length < 2) {
        setError(`Question ${i + 1} must have at least 2 options`);
        return false;
      }
      if (q.type === 'yes_no' && q.options.length !== 2) {
        setError(`Question ${i + 1} is Yes/No type and must have exactly 2 options`);
        return false;
      }
      if (q.options.some(opt => !opt.trim())) {
        setError(`Question ${i + 1} has empty options`);
        return false;
      }
    }
    
    return true;
  };

  const nextStep = () => {
    let canProceed = false;
    
    if (currentStep === 1) {
      canProceed = validateStep1();
    } else if (currentStep === 2) {
      canProceed = validateStep2();
    }
    
    if (canProceed && currentStep < 3) {
      setCurrentStep(currentStep + 1);
    }
  };

  const prevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
      setError('');
    }
  };

  const handleSubmit = async () => {
    if (!validateStep1() || !validateStep2()) {
      return;
    }

    setIsSubmitting(true);
    setError('');
    setSuccess('');

    try {
      const response = await fetch('/api/admin/plebiscites', {
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
        setError(result.error || 'Failed to create election');
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
          <h1 className="text-2xl font-bold text-gray-900">Create New Election</h1>
          <p className="text-gray-600">Follow these steps to set up your election</p>
        </div>

        {/* Progress Steps */}
        <div className="mb-8">
          <div className="flex items-center">
            {steps.map((step, index) => (
              <div key={step.id} className="flex items-center">
                <div className="flex items-center">
                  <div className={`flex items-center justify-center w-8 h-8 rounded-full border-2 ${
                    currentStep >= step.id 
                      ? 'bg-primary border-primary text-white' 
                      : 'border-gray-300 text-gray-500'
                  }`}>
                    {currentStep > step.id ? (
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    ) : (
                      <span className="text-sm font-medium">{step.id}</span>
                    )}
                  </div>
                  <div className="ml-3">
                    <div className={`text-sm font-medium ${
                      currentStep >= step.id ? 'text-primary' : 'text-gray-500'
                    }`}>
                      {step.name}
                    </div>
                    <div className="text-xs text-gray-500">{step.description}</div>
                  </div>
                </div>
                {index < steps.length - 1 && (
                  <div className={`flex-1 mx-4 h-0.5 ${
                    currentStep > step.id ? 'bg-primary' : 'bg-gray-300'
                  }`} />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Step Content */}
        <div className="space-y-6">
          {/* Step 1: Basic Information */}
          {currentStep === 1 && (
            <div className="card">
              <div className="card-header">
                <h2 className="text-lg font-semibold text-gray-900">Basic Information</h2>
                <p className="text-sm text-gray-600 mt-1">Enter the core details of your election</p>
              </div>
              <div className="card-body space-y-6">
                <div>
                  <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-2">
                    Election Title *
                  </label>
                  <input
                    type="text"
                    id="title"
                    name="title"
                    value={formData.title}
                    onChange={handleInputChange}
                    className="input-field"
                    placeholder="e.g., Member Policy Direction Survey 2024"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Choose a clear, descriptive title that members will recognize
                  </p>
                </div>

                <div>
                  <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-2">
                    Description *
                  </label>
                  <textarea
                    id="description"
                    name="description"
                    rows={5}
                    value={formData.description}
                    onChange={handleInputChange}
                    className="textarea-field"
                    placeholder="Explain the purpose, background, and importance of this election. This will be the first thing voters see."
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Provide context and explain why member input is needed. You can use line breaks for formatting.
                  </p>
                </div>

                <div>
                  <label htmlFor="info_url" className="block text-sm font-medium text-gray-700 mb-2">
                    Additional Information URL (optional)
                  </label>
                  <input
                    type="url"
                    id="info_url"
                    name="info_url"
                    value={formData.info_url}
                    onChange={handleInputChange}
                    className="input-field"
                    placeholder="https://example.com/background-document"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Link to detailed background documents, policy papers, or additional context
                  </p>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h3 className="text-sm font-medium text-blue-900 mb-2">Voting Schedule</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="open_date" className="block text-sm font-medium text-blue-800 mb-2">
                        Opening Date & Time *
                      </label>
                      <input
                        type="datetime-local"
                        id="open_date"
                        name="open_date"
                        value={formData.open_date}
                        onChange={handleInputChange}
                        className="input-field"
                      />
                      <p className="text-xs text-blue-700 mt-1">When voting begins</p>
                    </div>

                    <div>
                      <label htmlFor="close_date" className="block text-sm font-medium text-blue-800 mb-2">
                        Closing Date & Time *
                      </label>
                      <input
                        type="datetime-local"
                        id="close_date"
                        name="close_date"
                        value={formData.close_date}
                        onChange={handleInputChange}
                        className="input-field"
                      />
                      <p className="text-xs text-blue-700 mt-1">When voting ends</p>
                    </div>
                  </div>

                  <div className="mt-4">
                    <label htmlFor="timezone" className="block text-sm font-medium text-blue-800 mb-2">
                      Timezone *
                    </label>
                    <select
                      id="timezone"
                      name="timezone"
                      value={formData.timezone}
                      onChange={(e) => setFormData(prev => ({ ...prev, timezone: e.target.value }))}
                      className="input-field"
                    >
                      {timezoneOptions.map(tz => (
                        <option key={tz.value} value={tz.value}>{tz.label}</option>
                      ))}
                    </select>
                    <p className="text-xs text-blue-700 mt-1">
                      The opening and closing times above will be interpreted in this timezone
                    </p>
                  </div>
                  <p className="text-xs text-blue-700 mt-2">
                    💡 Allow adequate time for members to participate. Consider timezone differences for your membership.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Questions */}
          {currentStep === 2 && (
            <div className="card">
              <div className="card-header">
                <div className="flex justify-between items-start">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">Questions & Voting Methods</h2>
                    <p className="text-sm text-gray-600 mt-1">Add the questions you want members to vote on</p>
                  </div>
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
                  <div className="text-center py-12 bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg">
                    <svg className="w-12 h-12 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No questions yet</h3>
                    <p className="text-gray-600 mb-4">Start by adding your first question</p>
                    <button
                      type="button"
                      onClick={addQuestion}
                      className="btn-primary"
                    >
                      Add Your First Question
                    </button>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {questions.map((question, qIndex) => (
                      <div key={qIndex} className="border border-gray-200 rounded-lg p-6 bg-gray-50">
                        <div className="flex justify-between items-start mb-6">
                          <h3 className="text-lg font-semibold text-gray-900">Question {qIndex + 1}</h3>
                          <button
                            type="button"
                            onClick={() => removeQuestion(qIndex)}
                            className="text-red-600 hover:text-red-800 font-medium"
                          >
                            Remove Question
                          </button>
                        </div>

                        <div className="space-y-6">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              Question Text *
                            </label>
                            <input
                              type="text"
                              value={question.title}
                              onChange={(e) => updateQuestion(qIndex, 'title', e.target.value)}
                              className="input-field"
                              placeholder="Enter a clear, specific question..."
                            />
                            <p className="text-xs text-gray-500 mt-1">
                              Make it specific and unambiguous. Avoid leading questions.
                            </p>
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              Additional Instructions (optional)
                            </label>
                            <textarea
                              value={question.description}
                              onChange={(e) => updateQuestion(qIndex, 'description', e.target.value)}
                              className="textarea-field"
                              rows={3}
                              placeholder="Any additional context or instructions for voters..."
                            />
                          </div>

                          <div className="bg-white border border-gray-200 rounded-lg p-4">
                            <label className="block text-sm font-medium text-gray-700 mb-3">
                              Voting Method *
                            </label>
                            <div className="space-y-2">
                              <label className="flex items-start space-x-3 cursor-pointer">
                                <input
                                  type="radio"
                                  checked={question.type === 'yes_no'}
                                  onChange={() => updateQuestion(qIndex, 'type', 'yes_no')}
                                  className="mt-1 w-4 h-4 text-primary"
                                />
                                <div>
                                  <div className="font-medium text-gray-900">Yes/No Vote</div>
                                  <div className="text-sm text-gray-600">Simple binary choice. Winner determined by majority.</div>
                                </div>
                              </label>
                              <label className="flex items-start space-x-3 cursor-pointer">
                                <input
                                  type="radio"
                                  checked={question.type === 'multiple_choice'}
                                  onChange={() => updateQuestion(qIndex, 'type', 'multiple_choice')}
                                  className="mt-1 w-4 h-4 text-primary"
                                />
                                <div>
                                  <div className="font-medium text-gray-900">Multiple Choice</div>
                                  <div className="text-sm text-gray-600">Choose one option from several. Winner determined by plurality.</div>
                                </div>
                              </label>
                              <label className="flex items-start space-x-3 cursor-pointer">
                                <input
                                  type="radio"
                                  checked={question.type === 'ranked_choice'}
                                  onChange={() => updateQuestion(qIndex, 'type', 'ranked_choice')}
                                  className="mt-1 w-4 h-4 text-primary"
                                />
                                <div>
                                  <div className="font-medium text-gray-900">Ranked Choice (IRV)</div>
                                  <div className="text-sm text-gray-600">Rank options by preference. Winner determined by instant runoff voting.</div>
                                </div>
                              </label>
                              <label className="flex items-start space-x-3 cursor-pointer">
                                <input
                                  type="radio"
                                  checked={question.type === 'condorcet'}
                                  onChange={() => updateQuestion(qIndex, 'type', 'condorcet')}
                                  className="mt-1 w-4 h-4 text-primary"
                                />
                                <div>
                                  <div className="font-medium text-gray-900">Condorcet (Pairwise)</div>
                                  <div className="text-sm text-gray-600">Advanced ranked voting. Every option compared head-to-head.</div>
                                </div>
                              </label>
                            </div>
                          </div>

                          {(question.type === 'ranked_choice' || question.type === 'condorcet') && (
                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                              <label className="block text-sm font-medium text-blue-800 mb-3">
                                Preferential Voting Requirements *
                              </label>
                              <div className="space-y-2">
                                <label className="flex items-start space-x-3 cursor-pointer">
                                  <input
                                    type="radio"
                                    checked={question.preferentialType === 'compulsory'}
                                    onChange={() => updateQuestion(qIndex, 'preferentialType', 'compulsory')}
                                    className="mt-1 w-4 h-4 text-blue-600"
                                  />
                                  <div>
                                    <div className="font-medium text-blue-900">Compulsory Preferential</div>
                                    <div className="text-sm text-blue-700">Voters must rank ALL candidates to submit their vote</div>
                                  </div>
                                </label>
                                <label className="flex items-start space-x-3 cursor-pointer">
                                  <input
                                    type="radio"
                                    checked={question.preferentialType === 'optional'}
                                    onChange={() => updateQuestion(qIndex, 'preferentialType', 'optional')}
                                    className="mt-1 w-4 h-4 text-blue-600"
                                  />
                                  <div>
                                    <div className="font-medium text-blue-900">Optional Preferential</div>
                                    <div className="text-sm text-blue-700">Voters can rank as few or many candidates as they wish</div>
                                  </div>
                                </label>
                              </div>
                            </div>
                          )}

                          <div>
                            <div className="flex justify-between items-center mb-3">
                              <label className="block text-sm font-medium text-gray-700">
                                Answer Options *
                              </label>
                              {question.type !== 'yes_no' && (
                                <button
                                  type="button"
                                  onClick={() => addOption(qIndex)}
                                  className="text-sm text-primary hover:text-primary-dark font-medium"
                                >
                                  + Add Option
                                </button>
                              )}
                            </div>
                            
                            <div className="space-y-3">
                              {question.options.map((option, oIndex) => (
                                <div key={oIndex} className="flex items-center space-x-3">
                                  <span className="flex-shrink-0 w-6 h-6 bg-gray-200 rounded-full flex items-center justify-center text-xs font-medium text-gray-600">
                                    {oIndex + 1}
                                  </span>
                                  <input
                                    type="text"
                                    value={option}
                                    onChange={(e) => updateOption(qIndex, oIndex, e.target.value)}
                                    className="input-field flex-1"
                                    placeholder={`Option ${oIndex + 1}`}
                                    disabled={question.type === 'yes_no'}
                                  />
                                  {question.type !== 'yes_no' && question.options.length > 2 && (
                                    <button
                                      type="button"
                                      onClick={() => removeOption(qIndex, oIndex)}
                                      className="text-red-600 hover:text-red-800 font-medium"
                                    >
                                      Remove
                                    </button>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Step 3: Review */}
          {currentStep === 3 && (
            <div className="space-y-6">
              <div className="card">
                <div className="card-header">
                  <h2 className="text-lg font-semibold text-gray-900">Review & Create</h2>
                  <p className="text-sm text-gray-600 mt-1">Review your election before publishing</p>
                </div>
                <div className="card-body space-y-6">
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <div className="flex">
                      <svg className="flex-shrink-0 w-5 h-5 text-yellow-600" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                      <div className="ml-3">
                        <h3 className="text-sm font-medium text-yellow-800">Review carefully</h3>
                        <p className="text-sm text-yellow-700 mt-1">
                          Once created, you'll still be able to manage voter lists and open/close the election, but you cannot edit questions or basic information.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-lg font-medium text-gray-900 mb-4">Election Details</h3>
                    <dl className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2">
                      <div>
                        <dt className="text-sm font-medium text-gray-500">Title</dt>
                        <dd className="text-sm text-gray-900 font-medium">{formData.title}</dd>
                      </div>
                      <div>
                        <dt className="text-sm font-medium text-gray-500">Voting Period</dt>
                        <dd className="text-sm text-gray-900">
                          {new Date(formData.open_date).toLocaleDateString()} - {new Date(formData.close_date).toLocaleDateString()}
                          <span className="text-gray-500 ml-1">({formData.timezone})</span>
                        </dd>
                      </div>
                      <div className="sm:col-span-2">
                        <dt className="text-sm font-medium text-gray-500">Description</dt>
                        <dd className="text-sm text-gray-900 mt-1 whitespace-pre-wrap">{formData.description}</dd>
                      </div>
                      {formData.info_url && (
                        <div className="sm:col-span-2">
                          <dt className="text-sm font-medium text-gray-500">Information URL</dt>
                          <dd className="text-sm text-blue-600">
                            <a href={formData.info_url} target="_blank" rel="noopener noreferrer" className="hover:text-blue-800">
                              {formData.info_url}
                            </a>
                          </dd>
                        </div>
                      )}
                    </dl>
                  </div>

                  <div>
                    <h3 className="text-lg font-medium text-gray-900 mb-4">Questions ({questions.length})</h3>
                    <div className="space-y-4">
                      {questions.map((question, index) => (
                        <div key={index} className="border border-gray-200 rounded-lg p-4">
                          <div className="flex justify-between items-start mb-3">
                            <h4 className="font-medium text-gray-900">Question {index + 1}: {question.title}</h4>
                            <span className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded-full">
                              {question.type === 'yes_no' && 'Yes/No'}
                              {question.type === 'multiple_choice' && 'Multiple Choice'}
                              {question.type === 'ranked_choice' && `IRV${question.preferentialType === 'optional' ? ' (Optional)' : ''}`}
                              {question.type === 'condorcet' && `Condorcet${question.preferentialType === 'optional' ? ' (Optional)' : ''}`}
                            </span>
                          </div>
                          {question.description && (
                            <p className="text-sm text-gray-600 mb-3">{question.description}</p>
                          )}
                          <div className="text-sm">
                            <span className="font-medium text-gray-700">Options: </span>
                            <span className="text-gray-600">{question.options.join(', ')}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="flex justify-between items-center pt-6">
            <div className="flex space-x-4">
              {currentStep > 1 && (
                <button
                  type="button"
                  onClick={prevStep}
                  className="btn-secondary"
                >
                  ← Previous Step
                </button>
              )}
              <button
                type="button"
                onClick={() => router.back()}
                className="btn-secondary"
              >
                Cancel
              </button>
            </div>
            
            <div className="flex items-center space-x-4">
              {error && (
                <div className="alert-error max-w-md">{error}</div>
              )}
              
              {currentStep < 3 ? (
                <button
                  type="button"
                  onClick={nextStep}
                  className="btn-primary"
                >
                  Next Step →
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                  className="btn-primary px-8"
                >
                  {isSubmitting ? (
                    <>
                      <div className="spinner mr-2"></div>
                      Creating Election...
                    </>
                  ) : (
                    'Create Election'
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}