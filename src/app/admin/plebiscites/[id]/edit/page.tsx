'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import AdminLayout from '@/components/AdminLayout';

interface Question {
  title: string;
  description: string;
  type: 'yes_no' | 'multiple_choice' | 'ranked_choice' | 'condorcet';
  options: string[];
  preferentialType?: 'compulsory' | 'optional';
}

export default function EditPlebiscite() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const pad = (n: number) => n.toString().padStart(2, '0');
  const toLocalDatetime = (d: Date) =>
    d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());

  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    info_url: '',
    close_date: '',
    timezone: 'Australia/Brisbane'
  });
  const [questions, setQuestions] = useState<Question[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`/api/admin/plebiscites/${id}`)
      .then(res => res.json())
      .then(data => {
        if (data.error) { setError(data.error); setIsLoading(false); return; }
        const p = data.plebiscite;
        setFormData({
          title: p.title || '',
          description: p.description || '',
          info_url: p.info_url || '',
          close_date: p.close_date ? toLocalDatetime(new Date(p.close_date)) : '',
          timezone: p.timezone || 'Australia/Brisbane'
        });
        setQuestions((data.questions || []).map((q: any) => ({
          title: q.title,
          description: q.description || '',
          type: q.type,
          options: q.options,
          preferentialType: q.preferential_type || 'compulsory'
        })));
        setIsLoading(false);
      })
      .catch(() => { setError('Failed to load election'); setIsLoading(false); });
  }, [id]);

  const steps = [
    { id: 1, name: 'Basic Information', description: 'Title and description' },
    { id: 2, name: 'Questions', description: 'Edit questions and voting methods' },
    { id: 3, name: 'Review & Save', description: 'Set closing date and save' }
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
    if (field === 'type' && value === 'yes_no') {
      newQuestions[index].options = ['Yes', 'No'];
    } else if (field === 'type' && value !== 'yes_no' && newQuestions[index].options.length === 2 && newQuestions[index].options[0] === 'Yes') {
      newQuestions[index].options = ['Option 1', 'Option 2'];
    }
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
    if (!formData.title.trim()) { setError('Title is required'); return false; }
    if (!formData.description.trim()) { setError('Description is required'); return false; }
    return true;
  };

  const validateStep2 = (): boolean => {
    setError('');
    if (questions.length === 0) { setError('Please add at least one question'); return false; }
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q.title.trim()) { setError(`Question ${i + 1} must have a title`); return false; }
      if (q.options.length < 2) { setError(`Question ${i + 1} must have at least 2 options`); return false; }
      if (q.type === 'yes_no' && q.options.length !== 2) { setError(`Question ${i + 1} is Yes/No type and must have exactly 2 options`); return false; }
      if (q.options.some(opt => !opt.trim())) { setError(`Question ${i + 1} has empty options`); return false; }
    }
    return true;
  };

  const validateStep3 = (): boolean => {
    setError('');
    if (!formData.close_date) { setError('Closing date is required'); return false; }
    return true;
  };

  const nextStep = () => {
    let canProceed = false;
    if (currentStep === 1) canProceed = validateStep1();
    else if (currentStep === 2) canProceed = validateStep2();
    if (canProceed && currentStep < 3) {
      setCurrentStep(currentStep + 1);
    }
  };

  const prevStep = () => {
    if (currentStep > 1) { setCurrentStep(currentStep - 1); setError(''); }
  };

  const handleSubmit = async () => {
    if (!validateStep1() || !validateStep2() || !validateStep3()) return;

    setIsSubmitting(true);
    setError('');

    try {
      const response = await fetch('/api/admin/plebiscites', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: Number(id),
          title: formData.title,
          description: formData.description,
          info_url: formData.info_url,
          close_date: formData.close_date,
          timezone: formData.timezone,
          questions
        }),
      });

      const result = await response.json();
      if (response.ok && result.success) {
        router.push(`/admin/plebiscites/${id}`);
      } else {
        setError(result.error || 'Failed to update election');
      }
    } catch (error) {
      setError('An error occurred. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center py-20">
          <div className="spinner mr-3"></div>
          <span className="text-gray-600">Loading election...</span>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Edit Election</h1>
          <p className="text-gray-600">Update your draft election details, questions, and settings.</p>
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
                <p className="text-sm text-gray-600 mt-1">Update the core details of your election</p>
              </div>
              <div className="card-body space-y-6">
                <div>
                  <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-2">Election Title *</label>
                  <input type="text" id="title" name="title" value={formData.title} onChange={handleInputChange} className="input-field" placeholder="e.g., Board Election 2024" />
                </div>
                <div>
                  <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-2">Description *</label>
                  <textarea id="description" name="description" rows={5} value={formData.description} onChange={handleInputChange} className="textarea-field" placeholder="Explain the purpose of this election." />
                </div>
                <div>
                  <label htmlFor="info_url" className="block text-sm font-medium text-gray-700 mb-2">Additional Information URL (optional)</label>
                  <input type="url" id="info_url" name="info_url" value={formData.info_url} onChange={handleInputChange} className="input-field" placeholder="https://example.com/background-document" />
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
                    <p className="text-sm text-gray-600 mt-1">Edit the questions electors will vote on</p>
                  </div>
                  <button type="button" onClick={addQuestion} className="btn-primary">Add Question</button>
                </div>
              </div>
              <div className="card-body">
                {questions.length === 0 ? (
                  <div className="text-center py-12 bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg">
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No questions yet</h3>
                    <p className="text-gray-600 mb-4">Start by adding your first question</p>
                    <button type="button" onClick={addQuestion} className="btn-primary">Add Your First Question</button>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {questions.map((question, qIndex) => (
                      <div key={qIndex} className="border border-gray-200 rounded-lg p-6 bg-gray-50">
                        <div className="flex justify-between items-start mb-6">
                          <h3 className="text-lg font-semibold text-gray-900">Question {qIndex + 1}</h3>
                          <button type="button" onClick={() => removeQuestion(qIndex)} className="text-red-600 hover:text-red-800 font-medium">Remove Question</button>
                        </div>
                        <div className="space-y-6">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Question Text *</label>
                            <input type="text" value={question.title} onChange={(e) => updateQuestion(qIndex, 'title', e.target.value)} className="input-field" placeholder="Enter a clear, specific question..." />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Additional Instructions (optional)</label>
                            <textarea value={question.description} onChange={(e) => updateQuestion(qIndex, 'description', e.target.value)} className="textarea-field" rows={3} placeholder="Any additional context or instructions for voters..." />
                          </div>
                          <div className="bg-white border border-gray-200 rounded-lg p-4">
                            <label className="block text-sm font-medium text-gray-700 mb-3">Voting Method *</label>
                            <div className="space-y-2">
                              <label className="flex items-start space-x-3 cursor-pointer">
                                <input type="radio" checked={question.type === 'yes_no'} onChange={() => updateQuestion(qIndex, 'type', 'yes_no')} className="mt-1 w-4 h-4 text-primary" />
                                <div><div className="font-medium text-gray-900">Yes/No Vote</div><div className="text-sm text-gray-600">Simple binary choice.</div></div>
                              </label>
                              <label className="flex items-start space-x-3 cursor-pointer">
                                <input type="radio" checked={question.type === 'multiple_choice'} onChange={() => updateQuestion(qIndex, 'type', 'multiple_choice')} className="mt-1 w-4 h-4 text-primary" />
                                <div><div className="font-medium text-gray-900">Multiple Choice</div><div className="text-sm text-gray-600">Choose one option from several.</div></div>
                              </label>
                              <label className="flex items-start space-x-3 cursor-pointer">
                                <input type="radio" checked={question.type === 'ranked_choice'} onChange={() => updateQuestion(qIndex, 'type', 'ranked_choice')} className="mt-1 w-4 h-4 text-primary" />
                                <div><div className="font-medium text-gray-900">Ranked Choice (IRV)</div><div className="text-sm text-gray-600">Rank options by preference.</div></div>
                              </label>
                              <label className="flex items-start space-x-3 cursor-pointer">
                                <input type="radio" checked={question.type === 'condorcet'} onChange={() => updateQuestion(qIndex, 'type', 'condorcet')} className="mt-1 w-4 h-4 text-primary" />
                                <div><div className="font-medium text-gray-900">Condorcet (Pairwise)</div><div className="text-sm text-gray-600">Advanced ranked voting.</div></div>
                              </label>
                            </div>
                          </div>
                          {(question.type === 'ranked_choice' || question.type === 'condorcet') && (
                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                              <label className="block text-sm font-medium text-blue-800 mb-3">Preferential Voting Requirements *</label>
                              <div className="space-y-2">
                                <label className="flex items-start space-x-3 cursor-pointer">
                                  <input type="radio" checked={question.preferentialType === 'compulsory'} onChange={() => updateQuestion(qIndex, 'preferentialType', 'compulsory')} className="mt-1 w-4 h-4 text-blue-600" />
                                  <div><div className="font-medium text-blue-900">Compulsory Preferential</div><div className="text-sm text-blue-700">Voters must rank ALL candidates</div></div>
                                </label>
                                <label className="flex items-start space-x-3 cursor-pointer">
                                  <input type="radio" checked={question.preferentialType === 'optional'} onChange={() => updateQuestion(qIndex, 'preferentialType', 'optional')} className="mt-1 w-4 h-4 text-blue-600" />
                                  <div><div className="font-medium text-blue-900">Optional Preferential</div><div className="text-sm text-blue-700">Voters can rank as few or many as they wish</div></div>
                                </label>
                              </div>
                            </div>
                          )}
                          <div>
                            <div className="flex justify-between items-center mb-3">
                              <label className="block text-sm font-medium text-gray-700">Answer Options *</label>
                              {question.type !== 'yes_no' && (
                                <button type="button" onClick={() => addOption(qIndex)} className="text-sm text-primary hover:text-primary-dark font-medium">+ Add Option</button>
                              )}
                            </div>
                            <div className="space-y-3">
                              {question.options.map((option, oIndex) => (
                                <div key={oIndex} className="flex items-center space-x-3">
                                  <span className="flex-shrink-0 w-6 h-6 bg-gray-200 rounded-full flex items-center justify-center text-xs font-medium text-gray-600">{oIndex + 1}</span>
                                  <input type="text" value={option} onChange={(e) => updateOption(qIndex, oIndex, e.target.value)} className="input-field flex-1" placeholder={`Option ${oIndex + 1}`} disabled={question.type === 'yes_no'} />
                                  {question.type !== 'yes_no' && question.options.length > 2 && (
                                    <button type="button" onClick={() => removeOption(qIndex, oIndex)} className="text-red-600 hover:text-red-800 font-medium">Remove</button>
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

          {/* Step 3: Review & Save */}
          {currentStep === 3 && (
            <div className="space-y-6">
              <div className="card">
                <div className="card-header">
                  <h2 className="text-lg font-semibold text-gray-900">Review & Save</h2>
                  <p className="text-sm text-gray-600 mt-1">Review your changes before saving.</p>
                </div>
                <div className="card-body space-y-6">
                  <div>
                    <h3 className="text-lg font-medium text-gray-900 mb-4">Election Details</h3>
                    <dl className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2">
                      <div className="sm:col-span-2">
                        <dt className="text-sm font-medium text-gray-500">Title</dt>
                        <dd className="text-sm text-gray-900 font-medium">{formData.title}</dd>
                      </div>
                      <div className="sm:col-span-2">
                        <dt className="text-sm font-medium text-gray-500">Description</dt>
                        <dd className="text-sm text-gray-900 mt-1 whitespace-pre-wrap">{formData.description}</dd>
                      </div>
                      {formData.info_url && (
                        <div className="sm:col-span-2">
                          <dt className="text-sm font-medium text-gray-500">Information URL</dt>
                          <dd className="text-sm text-blue-600">{formData.info_url}</dd>
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
                          {question.description && <p className="text-sm text-gray-600 mb-3">{question.description}</p>}
                          <div className="text-sm">
                            <span className="font-medium text-gray-700">Options: </span>
                            <span className="text-gray-600">{question.options.join(', ')}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Closing Date */}
                  <div className="border-t pt-6">
                    <h3 className="text-lg font-medium text-gray-900 mb-4">Voting Deadline</h3>
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label htmlFor="close_date" className="block text-sm font-medium text-blue-800 mb-2">Closing Date & Time *</label>
                          <input type="datetime-local" id="close_date" name="close_date" value={formData.close_date} onChange={handleInputChange} className="input-field" />
                        </div>
                        <div>
                          <label htmlFor="timezone" className="block text-sm font-medium text-blue-800 mb-2">Timezone *</label>
                          <select id="timezone" name="timezone" value={formData.timezone} onChange={(e) => setFormData(prev => ({ ...prev, timezone: e.target.value }))} className="input-field">
                            {timezoneOptions.map(tz => (
                              <option key={tz.value} value={tz.value}>{tz.label}</option>
                            ))}
                          </select>
                        </div>
                      </div>
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
                <button type="button" onClick={prevStep} className="btn-secondary">Previous Step</button>
              )}
              <button type="button" onClick={() => router.push(`/admin/plebiscites/${id}`)} className="btn-secondary">Cancel</button>
            </div>
            <div className="flex items-center space-x-4">
              {error && <div className="alert-error max-w-md">{error}</div>}
              {currentStep < 3 ? (
                <button type="button" onClick={nextStep} className="btn-primary">Next Step</button>
              ) : (
                <button type="button" onClick={handleSubmit} disabled={isSubmitting} className="btn-primary px-8">
                  {isSubmitting ? (<><div className="spinner mr-2"></div>Saving...</>) : 'Save Changes'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
