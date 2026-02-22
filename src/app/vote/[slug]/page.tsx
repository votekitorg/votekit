'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import VoteForm from '@/components/VoteForm';

interface Plebiscite {
  id: number;
  slug: string;
  title: string;
  description: string;
  info_url?: string;
  open_date: string;
  close_date: string;
  status: string;
}

interface Question {
  id: number;
  title: string;
  description?: string;
  type: 'yes_no' | 'multiple_choice' | 'ranked_choice';
  options: string[];
}

interface VotingPageProps {
  params: { slug: string };
}

export default function VotingPage({ params }: VotingPageProps) {
  const [step, setStep] = useState<'info' | 'email' | 'verify' | 'vote' | 'complete'>('info');
  const [plebiscite, setPlebiscite] = useState<Plebiscite | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  
  // Email verification
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [canResend, setCanResend] = useState(true);
  const [resendCooldown, setResendCooldown] = useState(0);
  
  // Vote submission
  const [receiptCodes, setReceiptCodes] = useState<string[]>([]);
  
  const router = useRouter();

  // Fetch plebiscite data
  useEffect(() => {
    const fetchPlebiscite = async () => {
      try {
        const response = await fetch(`/api/results/${params.slug}`);
        const result = await response.json();
        
        if (response.ok) {
          // Check if plebiscite is open for voting
          const now = new Date();
          const openDate = new Date(result.plebiscite.open_date);
          const closeDate = new Date(result.plebiscite.close_date);
          
          if (result.plebiscite.status !== 'open' || now < openDate || now >= closeDate) {
            setError('Voting is not currently active for this plebiscite');
            return;
          }
          
          setPlebiscite(result.plebiscite);
          setQuestions(result.questions.map((q: any) => ({
            id: q.id,
            title: q.title,
            description: q.description,
            type: q.type,
            options: q.options
          })));
        } else if (response.status === 403) {
          // Plebiscite might be closed, redirect to results
          router.push(`/results/${params.slug}`);
          return;
        } else {
          setError('Plebiscite not found or not available');
        }
      } catch (error) {
        setError('Failed to load plebiscite information');
      } finally {
        setIsLoading(false);
      }
    };

    fetchPlebiscite();
  }, [params.slug, router]);

  // Cooldown timer for resend
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => {
        setResendCooldown(resendCooldown - 1);
      }, 1000);
      return () => clearTimeout(timer);
    } else {
      setCanResend(true);
    }
  }, [resendCooldown]);

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email.trim()) {
      setError('Email address is required');
      return;
    }

    setIsVerifying(true);
    setError('');

    try {
      const response = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: email.trim(),
          plebisciteSlug: params.slug
        }),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        setStep('verify');
        setCanResend(false);
        setResendCooldown(60); // 60 second cooldown
      } else {
        setError(result.error || 'Failed to send verification code');
      }
    } catch (error) {
      setError('An error occurred. Please try again.');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!code.trim() || code.trim().length !== 6) {
      setError('Please enter a valid 6-digit code');
      return;
    }

    setIsVerifying(true);
    setError('');

    try {
      const response = await fetch('/api/auth/confirm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: email.trim(),
          code: code.trim(),
          plebisciteSlug: params.slug
        }),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        setStep('vote');
      } else {
        setError(result.error || 'Invalid or expired verification code');
      }
    } catch (error) {
      setError('An error occurred. Please try again.');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleVoteSubmit = async (votes: { [questionId: number]: any }) => {
    try {
      const response = await fetch('/api/vote', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          plebisciteSlug: params.slug,
          votes
        }),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        setReceiptCodes(result.receiptCodes);
        setStep('complete');
      } else {
        throw new Error(result.error || 'Failed to submit vote');
      }
    } catch (error) {
      throw error; // Let VoteForm handle the error display
    }
  };

  const resendCode = async () => {
    if (!canResend) return;
    
    setIsVerifying(true);
    setError('');

    try {
      const response = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: email.trim(),
          plebisciteSlug: params.slug
        }),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        setCanResend(false);
        setResendCooldown(60);
        // Don't show success message, just reset cooldown
      } else {
        setError(result.error || 'Failed to resend code');
      }
    } catch (error) {
      setError('An error occurred. Please try again.');
    } finally {
      setIsVerifying(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-AU', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Australia/Brisbane'
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex justify-center items-center">
        <div className="spinner w-8 h-8"></div>
      </div>
    );
  }

  if (error && !plebiscite) {
    return (
      <div className="min-h-screen bg-gray-50 flex justify-center items-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-red-200 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Unable to Load Plebiscite</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={() => router.push('/')}
            className="btn-primary"
          >
            Return Home
          </button>
        </div>
      </div>
    );
  }

  if (!plebiscite) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center mr-3">
              <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/>
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-semibold text-gray-900">Member Plebiscite</h1>
              <p className="text-sm text-gray-600">Secure Online Voting</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Plebiscite Information */}
        {step === 'info' && (
          <div className="space-y-8">
            <div className="text-center">
              <h2 className="text-3xl font-bold text-gray-900 mb-4">
                {plebiscite.title}
              </h2>
              <div className="flex justify-center space-x-4 text-sm text-gray-600">
                <span>Opens: {formatDate(plebiscite.open_date)}</span>
                <span>•</span>
                <span>Closes: {formatDate(plebiscite.close_date)}</span>
              </div>
            </div>

            <div className="card max-w-3xl mx-auto">
              <div className="card-body">
                <div className="prose prose-gray max-w-none">
                  <div className="whitespace-pre-wrap text-gray-700 leading-relaxed">
                    {plebiscite.description}
                  </div>
                </div>

                {plebiscite.info_url && (
                  <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <p className="text-sm font-medium text-blue-900 mb-2">Additional Information:</p>
                    <a 
                      href={plebiscite.info_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-700 hover:text-blue-800 underline text-sm"
                    >
                      {plebiscite.info_url}
                    </a>
                  </div>
                )}

                <div className="mt-8 bg-green-50 border border-green-200 rounded-lg p-4">
                  <h4 className="text-sm font-medium text-green-900 mb-2">How Voting Works:</h4>
                  <ol className="text-sm text-green-800 space-y-1 list-decimal list-inside">
                    <li>Enter your registered email address</li>
                    <li>Check your email for a 6-digit verification code</li>
                    <li>Enter the code to access your ballot</li>
                    <li>Vote on all questions</li>
                    <li>Review and submit your votes</li>
                    <li>Save your receipt codes for verification</li>
                  </ol>
                </div>
              </div>
            </div>

            <div className="text-center">
              <button
                onClick={() => setStep('email')}
                className="btn-primary px-8"
              >
                Begin Voting
              </button>
            </div>
          </div>
        )}

        {/* Email Entry */}
        {step === 'email' && (
          <div className="max-w-md mx-auto">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Enter Your Email</h2>
              <p className="text-gray-600">
                We'll send a verification code to confirm your identity
              </p>
            </div>

            <div className="card">
              <div className="card-body">
                <form onSubmit={handleEmailSubmit} className="space-y-4">
                  <div>
                    <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                      Email Address
                    </label>
                    <input
                      type="email"
                      id="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="input-field"
                      placeholder="your.email@example.com"
                      disabled={isVerifying}
                      required
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Must be registered in the voter roll
                    </p>
                  </div>

                  {error && (
                    <div className="alert-error">
                      {error}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={isVerifying}
                    className="btn-primary w-full"
                  >
                    {isVerifying ? (
                      <>
                        <div className="spinner mr-2"></div>
                        Sending Code...
                      </>
                    ) : (
                      'Send Verification Code'
                    )}
                  </button>
                </form>
              </div>
            </div>

            <div className="text-center mt-4">
              <button
                onClick={() => setStep('info')}
                className="text-sm text-gray-600 hover:text-primary"
              >
                ← Back to Information
              </button>
            </div>
          </div>
        )}

        {/* Code Verification */}
        {step === 'verify' && (
          <div className="max-w-md mx-auto">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Enter Verification Code</h2>
              <p className="text-gray-600">
                Check your email for a 6-digit code sent to<br />
                <strong>{email}</strong>
              </p>
            </div>

            <div className="card">
              <div className="card-body">
                <form onSubmit={handleCodeSubmit} className="space-y-4">
                  <div>
                    <label htmlFor="code" className="block text-sm font-medium text-gray-700 mb-1">
                      Verification Code
                    </label>
                    <input
                      type="text"
                      id="code"
                      value={code}
                      onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      className="input-field text-center text-2xl tracking-widest font-mono"
                      placeholder="000000"
                      disabled={isVerifying}
                      maxLength={6}
                      required
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Code expires in 10 minutes
                    </p>
                  </div>

                  {error && (
                    <div className="alert-error">
                      {error}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={isVerifying || code.length !== 6}
                    className="btn-primary w-full"
                  >
                    {isVerifying ? (
                      <>
                        <div className="spinner mr-2"></div>
                        Verifying...
                      </>
                    ) : (
                      'Verify & Continue'
                    )}
                  </button>
                </form>

                <div className="text-center mt-4">
                  {canResend ? (
                    <button
                      onClick={resendCode}
                      disabled={isVerifying}
                      className="text-sm text-primary hover:text-primary-dark"
                    >
                      Resend Code
                    </button>
                  ) : (
                    <span className="text-sm text-gray-500">
                      Resend in {resendCooldown}s
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="text-center mt-4">
              <button
                onClick={() => setStep('email')}
                className="text-sm text-gray-600 hover:text-primary"
              >
                ← Change Email Address
              </button>
            </div>
          </div>
        )}

        {/* Voting */}
        {step === 'vote' && (
          <div className="space-y-8">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Cast Your Vote</h2>
              <p className="text-gray-600">
                Answer all questions below. You can review your choices before submitting.
              </p>
            </div>

            <VoteForm
              questions={questions}
              onSubmit={handleVoteSubmit}
            />
          </div>
        )}

        {/* Completion */}
        {step === 'complete' && (
          <div className="max-w-2xl mx-auto text-center">
            <div className="w-16 h-16 bg-green-200 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>

            <h2 className="text-3xl font-bold text-gray-900 mb-4">Vote Submitted Successfully!</h2>
            <p className="text-lg text-gray-600 mb-8">
              Thank you for participating in: <strong>{plebiscite.title}</strong>
            </p>

            <div className="card text-left mb-8">
              <div className="card-header">
                <h3 className="text-lg font-semibold text-gray-900">Receipt Codes</h3>
              </div>
              <div className="card-body">
                <p className="text-sm text-gray-600 mb-4">
                  Save these receipt codes. You can use them to verify your vote was counted without revealing how you voted.
                </p>
                <div className="bg-gray-50 rounded-lg p-4">
                  {receiptCodes.map((code, index) => (
                    <div key={index} className="flex justify-between items-center py-2">
                      <span className="text-sm font-medium text-gray-700">Question {index + 1}:</span>
                      <span className="font-mono text-sm bg-white px-2 py-1 rounded border">{code}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Results will be published after voting closes on {formatDate(plebiscite.close_date)}
              </p>
              
              <button
                onClick={() => router.push('/')}
                className="btn-primary"
              >
                Return to Home
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}