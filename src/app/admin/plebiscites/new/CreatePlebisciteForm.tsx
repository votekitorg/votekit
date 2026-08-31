'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import AdminLayout from '@/components/AdminLayout';
import LinkifiedText from '@/components/LinkifiedText';
import { csrfFetch } from '@/lib/csrf-client';
import { parseElectionCloseDate } from '@/lib/election-window';
import { SerialTaskQueue } from '@/lib/serial-task-queue';

interface Question {
  title: string;
  description: string;
  type: 'yes_no' | 'multiple_choice' | 'ranked_choice' | 'condorcet';
  options: string[];
  preferentialType?: 'compulsory' | 'optional'; // Only applies to ranked_choice and condorcet
  continueAfterMajority?: boolean; // Ranked-choice reporting only
}

interface SetupDraft {
  id: number;
  payload: { formData?: Record<string, unknown>; questions?: Question[] };
  currentStep: number;
  proofToken: string;
  revision: number;
}

interface DraftSaveResult {
  ok: boolean;
  draftId: number | null;
}

export default function CreatePlebisciteForm({ currentUser, initialDraft }: {
  currentUser: { email: string; name: string | null; role: 'owner' | 'returning_officer' | 'admin' | 'observer' };
  initialDraft: SetupDraft | null;
}) {
  const now = new Date();
  const toBrisbaneInput = (date: Date) => new Date(date.getTime() + 10 * 60 * 60 * 1000).toISOString().slice(0, 16);
  const defaultOpenDate = toBrisbaneInput(new Date(now.getTime() + 60 * 60 * 1000));
  const savedForm = initialDraft?.payload?.formData || {};

  const [currentStep, setCurrentStep] = useState(initialDraft?.currentStep || 1);
  const [formData, setFormData] = useState({
    title: typeof savedForm.title === 'string' ? savedForm.title : '',
    description: typeof savedForm.description === 'string' ? savedForm.description : '',
    info_url: typeof savedForm.info_url === 'string' ? savedForm.info_url : '',
    access_mode: (savedForm.access_mode === 'anonymous_codes' ? 'anonymous_codes' : 'voter_roll') as 'voter_roll' | 'anonymous_codes',
    results_visibility: (savedForm.results_visibility === 'public' ? 'public' : 'eligible') as 'eligible' | 'public',
    sms_enabled: savedForm.sms_enabled === true,
    opening_mode: (savedForm.opening_mode === 'scheduled' ? 'scheduled' : 'immediate') as 'immediate' | 'scheduled',
    open_date: typeof savedForm.open_date === 'string' ? savedForm.open_date : defaultOpenDate,
    close_date: typeof savedForm.close_date === 'string' ? savedForm.close_date : ''
  });
  const [questions, setQuestions] = useState<Question[]>(Array.isArray(initialDraft?.payload?.questions) ? initialDraft.payload.questions : []);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [draftId, setDraftId] = useState<number | null>(initialDraft?.id || null);
  const [proofToken, setProofToken] = useState(initialDraft?.proofToken || '');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>(initialDraft ? 'saved' : 'idle');
  const [isExiting, setIsExiting] = useState(false);
  const draftIdRef = useRef<number | null>(initialDraft?.id || null);
  const revisionRef = useRef(initialDraft?.revision || 1);
  const saveQueue = useRef(new SerialTaskQueue());
  const newestSave = useRef(0);
  
  const router = useRouter();

  const steps = [
    { id: 1, name: 'Basic Information', description: 'Purpose and voter access' },
    { id: 2, name: 'Questions', description: 'Add questions and voting methods' },
    { id: 3, name: 'Voting Timing', description: 'Open and close settings' },
    { id: 4, name: 'Review', description: 'Confirm and create' }
  ];

  const persistDraft = useCallback(async (step = currentStep): Promise<DraftSaveResult> => {
    const payload = { formData, questions };
    const hasContent = Boolean(formData.title.trim() || formData.description.trim() || formData.close_date || questions.length);
    if (!draftIdRef.current && !hasContent) return { ok: true, draftId: null };
    const saveNumber = ++newestSave.current;
    setSaveStatus('saving');
    const save = saveQueue.current.enqueue(async (): Promise<number> => {
      const targetDraftId = draftIdRef.current;
      if (targetDraftId) {
        const response = await csrfFetch('/api/admin/election-drafts', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: targetDraftId, payload, currentStep: step, revision: revisionRef.current })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Could not save draft');
        revisionRef.current = result.revision;
        return targetDraftId;
      } else {
        const response = await csrfFetch('/api/admin/election-drafts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ payload, currentStep: step })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Could not save draft');
        draftIdRef.current = result.draft.id;
        revisionRef.current = result.draft.revision;
        setDraftId(result.draft.id);
        setProofToken(result.draft.proofToken);
        router.replace(`/admin/plebiscites/new?draft=${result.draft.id}`);
        return result.draft.id;
      }
    });
    try {
      const savedId = await save;
      if (saveNumber === newestSave.current) setSaveStatus('saved');
      return { ok: true, draftId: savedId };
    } catch (saveError) {
      if (saveNumber === newestSave.current) setSaveStatus('error');
      return { ok: false, draftId: draftIdRef.current };
    }
  }, [currentStep, formData, questions, router]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void persistDraft(); }, 700);
    return () => window.clearTimeout(timer);
  }, [persistDraft]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: e.target instanceof HTMLInputElement && e.target.type === 'checkbox' ? e.target.checked : value }));
  };

  const addQuestion = () => {
    setQuestions([...questions, {
      title: '',
      description: '',
      type: 'yes_no',
      options: ['Yes', 'No'],
      preferentialType: 'compulsory',
      continueAfterMajority: false
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
    if (field === 'type' && value !== 'ranked_choice') {
      newQuestions[index].continueAfterMajority = false;
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

  const validateStep3 = (): boolean => {
    setError('');
    const now = new Date();
    const closeDate = parseElectionCloseDate(formData.close_date);
    if (!formData.close_date || Number.isNaN(closeDate.getTime())) {
      setError('A valid closing date is required');
      return false;
    }
    if (closeDate <= now) {
      setError('Closing date must be in the future');
      return false;
    }
    if (formData.opening_mode === 'scheduled') {
      const openDate = parseElectionCloseDate(formData.open_date);
      if (!formData.open_date || Number.isNaN(openDate.getTime())) {
        setError('A valid scheduled opening date is required');
        return false;
      }
      if (openDate <= now) {
        setError('Scheduled opening must be in the future');
        return false;
      }
      if (openDate >= closeDate) {
        setError('Closing date must be after the scheduled opening');
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
    } else if (currentStep === 3) {
      canProceed = validateStep3();
    }
    
    if (canProceed && currentStep < 4) {
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
    if (!validateStep1() || !validateStep2() || !validateStep3()) {
      return;
    }

    setIsSubmitting(true);
    setError('');
    setSuccess('');

    try {
      const savedDraft = await persistDraft(4);
      if (!savedDraft.ok) {
        setError('Your latest changes could not be saved. Reload the draft before publishing.');
        return;
      }
      const response = await csrfFetch('/api/admin/plebiscites', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...formData,
          questions,
          setup_draft_id: savedDraft.draftId
        }),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        router.push(`/admin/plebiscites/${result.plebiscite.id}`);
      } else {
        setError(result.error || 'Failed to publish election');
      }
    } catch (error) {
      setError('An error occurred. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const saveAndExit = async () => {
    setIsExiting(true);
    setError('');
    const savedDraft = await persistDraft();
    if (savedDraft.ok) {
      router.push('/admin');
      return;
    }
    setError('Your latest changes could not be saved. You are still on this page so nothing is lost.');
    setIsExiting(false);
  };

  const copyProofLink = async () => {
    if (!proofToken) return;
    await navigator.clipboard.writeText(`${window.location.origin}/proof/${proofToken}`);
    setSuccess('Proofing link copied');
    window.setTimeout(() => setSuccess(''), 2500);
  };

  return (
    <AdminLayout currentUser={currentUser}>
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{draftId ? 'Edit Election Draft' : 'Create New Election'}</h1>
              <p className="text-gray-600">Your setup is saved as a draft until you deliberately publish it.</p>
            </div>
            <div className="text-right text-sm">
              <div className={saveStatus === 'error' ? 'font-medium text-red-700' : 'text-gray-500'}>
                {saveStatus === 'saving' && 'Saving draft…'}
                {saveStatus === 'saved' && 'Draft autosaved'}
                {saveStatus === 'error' && 'Draft could not be saved'}
              </div>
              {proofToken && (
                <button type="button" onClick={copyProofLink} className="mt-1 font-medium text-primary hover:underline">
                  Copy proofing link
                </button>
              )}
            </div>
          </div>
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
                  <label htmlFor="access_mode" className="block text-sm font-medium text-gray-700 mb-2">Voter access *</label>
                  <select id="access_mode" name="access_mode" value={formData.access_mode} onChange={handleInputChange} className="input-field">
                    <option value="voter_roll">Registered voters (email, phone or personal link)</option>
                    <option value="anonymous_codes">Anonymous single-use codes and links</option>
                  </select>
                  <p className="mt-2 text-sm text-gray-500">
                    {formData.access_mode === 'anonymous_codes'
                      ? 'Generate a fixed pool such as 500 codes. No names, email addresses or phone numbers are required.'
                      : 'Add eligible voters, then let them verify by email, phone or a personal VoteKit link.'}
                  </p>
                </div>
                {formData.access_mode === 'voter_roll' && (
                  <label className="flex items-start gap-3 rounded-lg border border-gray-200 p-4">
                    <input type="checkbox" name="sms_enabled" checked={formData.sms_enabled} onChange={handleInputChange} className="mt-1" />
                    <span><strong className="block text-sm text-gray-900">Allow text-message verification</strong><span className="text-sm text-gray-600">Phone-only voters can verify through Firebase SMS instead of email.</span></span>
                  </label>
                )}
                <fieldset>
                  <legend className="text-sm font-medium text-gray-700">Who can view the final results? *</legend>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <label className={`cursor-pointer rounded-xl border-2 p-4 ${formData.results_visibility === 'public' ? 'border-primary bg-green-50' : 'border-gray-200 bg-white'}`}>
                      <input type="radio" name="results_visibility" value="public" checked={formData.results_visibility === 'public'} onChange={handleInputChange} className="mr-2" />
                      <strong className="text-gray-900">Anyone with the results link</strong>
                      <span className="mt-1 block text-sm text-gray-600">Simplest for broad member polls. Voters will not need to save or re-enter a voting code to see the results.</span>
                    </label>
                    <label className={`cursor-pointer rounded-xl border-2 p-4 ${formData.results_visibility === 'eligible' ? 'border-primary bg-green-50' : 'border-gray-200 bg-white'}`}>
                      <input type="radio" name="results_visibility" value="eligible" checked={formData.results_visibility === 'eligible'} onChange={handleInputChange} className="mr-2" />
                      <strong className="text-gray-900">Eligible voters only</strong>
                      <span className="mt-1 block text-sm text-gray-600">Viewers must verify eligibility again after voting closes.</span>
                    </label>
                  </div>
                </fieldset>
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
                    Provide context and explain why member input is needed. You can use line breaks and include multiple http:// or https:// links, which will be clickable for voters.
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

                          {question.type === 'ranked_choice' && (
                            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                              <label className="flex cursor-pointer items-start space-x-3">
                                <input
                                  type="checkbox"
                                  checked={question.continueAfterMajority === true}
                                  onChange={(event) => updateQuestion(qIndex, 'continueAfterMajority', event.target.checked)}
                                  className="mt-1 h-4 w-4 text-primary"
                                />
                                <div>
                                  <div className="font-medium text-emerald-950">Continue to a final-two preference distribution</div>
                                  <div className="mt-1 text-sm text-emerald-800">
                                    After the official winner reaches a majority, continue excluding lower options to publish preference flows for reporting only. This never changes the declared winner.
                                  </div>
                                </div>
                              </label>
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

          {/* Step 3: Voting timing */}
          {currentStep === 3 && (
            <div className="card">
              <div className="card-header">
                <h2 className="text-lg font-semibold text-gray-900">Voting Timing</h2>
                <p className="text-sm text-gray-600 mt-1">Choose when voting becomes available. All times are Australia/Brisbane.</p>
              </div>
              <div className="card-body space-y-6">
                <fieldset>
                  <legend className="text-sm font-medium text-gray-700">Opening *</legend>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <label className={`cursor-pointer rounded-xl border-2 p-4 ${formData.opening_mode === 'immediate' ? 'border-primary bg-green-50' : 'border-gray-200 bg-white'}`}>
                      <input type="radio" name="opening_mode" value="immediate" checked={formData.opening_mode === 'immediate'} onChange={handleInputChange} className="mr-2" />
                      <strong className="text-gray-900">Open immediately when ready</strong>
                      <span className="mt-1 block text-sm text-gray-600">Default. After creation, add voters or generate codes on the management page, then click Open Voting Now.</span>
                    </label>
                    <label className={`cursor-pointer rounded-xl border-2 p-4 ${formData.opening_mode === 'scheduled' ? 'border-primary bg-green-50' : 'border-gray-200 bg-white'}`}>
                      <input type="radio" name="opening_mode" value="scheduled" checked={formData.opening_mode === 'scheduled'} onChange={handleInputChange} className="mr-2" />
                      <strong className="text-gray-900">Schedule opening for later</strong>
                      <span className="mt-1 block text-sm text-gray-600">Voting opens automatically at the chosen time when setup is complete. You can still open it early.</span>
                    </label>
                  </div>
                </fieldset>

                {formData.opening_mode === 'scheduled' && (
                  <div>
                    <label htmlFor="open_date" className="block text-sm font-medium text-gray-700 mb-2">Scheduled opening date and time *</label>
                    <input type="datetime-local" id="open_date" name="open_date" value={formData.open_date} onChange={handleInputChange} className="input-field" />
                  </div>
                )}

                <div>
                  <label htmlFor="close_date" className="block text-sm font-medium text-gray-700 mb-2">Closing date and time *</label>
                  <input type="datetime-local" id="close_date" name="close_date" value={formData.close_date} onChange={handleInputChange} className="input-field" />
                  <p className="mt-2 text-sm text-gray-500">Choose this deliberately. Voting stops at this fixed Brisbane time unless you close it earlier.</p>
                </div>

                <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
                  Voters and anonymous codes are added after creation on the election management page. VoteKit will never open an election without questions and at least one valid voting credential.
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Review */}
          {currentStep === 4 && (
            <div className="space-y-6">
              <div className="card">
                <div className="card-header">
                  <h2 className="text-lg font-semibold text-gray-900">Review & Publish</h2>
                  <p className="text-sm text-gray-600 mt-1">Proof the complete ballot before creating the election</p>
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
                          Publishing creates the election and locks its questions and core wording for election integrity. You can keep this as an editable draft, share the private proofing link, and return later.
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
                        <dt className="text-sm font-medium text-gray-500">Opening</dt>
                        <dd className="text-sm text-gray-900">
                          {formData.opening_mode === 'immediate'
                            ? 'Open immediately when setup is complete'
                            : parseElectionCloseDate(formData.open_date).toLocaleString('en-AU', { timeZone: 'Australia/Brisbane' })}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-sm font-medium text-gray-500">Closing</dt>
                        <dd className="text-sm text-gray-900">{parseElectionCloseDate(formData.close_date).toLocaleString('en-AU', { timeZone: 'Australia/Brisbane' })}</dd>
                      </div>
                      <div>
                        <dt className="text-sm font-medium text-gray-500">Final results access</dt>
                        <dd className="text-sm text-gray-900">{formData.results_visibility === 'public' ? 'Anyone with the results link' : 'Eligible voters only (verification required)'}</dd>
                      </div>
                      <div className="sm:col-span-2">
                        <dt className="text-sm font-medium text-gray-500">Description</dt>
                        <dd className="text-sm text-gray-900 mt-1 whitespace-pre-wrap">
                          <LinkifiedText text={formData.description} />
                        </dd>
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
                          {question.type === 'ranked_choice' && question.continueAfterMajority && (
                            <div className="mt-2 text-sm font-medium text-emerald-800">
                              Reporting: continue to a final-two preference distribution after the winner is declared
                            </div>
                          )}
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
                onClick={saveAndExit}
                disabled={isExiting}
                className="btn-secondary"
              >
                {isExiting ? 'Saving…' : 'Save & Exit'}
              </button>
            </div>
            
            <div className="flex items-center space-x-4">
              {error && (
                <div className="alert-error max-w-md">{error}</div>
              )}
              {success && (
                <div className="text-sm font-medium text-green-700">{success}</div>
              )}
              
              {currentStep < 4 ? (
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
                      Publishing Election...
                    </>
                  ) : (
                    'Publish Election'
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
