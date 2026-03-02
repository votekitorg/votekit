'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import VoteForm from '@/components/VoteForm';
import { setupRecaptcha, sendSMSVerification, verifySMSCode, clearRecaptcha } from '@/lib/firebase';

interface Plebiscite {
  id: number;
  slug: string;
  title: string;
  description: string;
  info_url?: string;
  open_date: string;
  close_date: string;
  status: string;
  sms_enabled?: boolean;
}

interface Question {
  id: number;
  title: string;
  description?: string;
  type: 'yes_no' | 'multiple_choice' | 'ranked_choice' | 'condorcet';
  options: string[];
  preferentialType?: 'compulsory' | 'optional';
}

interface VoterLookup {
  hasEmail: boolean;
  hasPhone: boolean;
  smsEnabled: boolean;
  availableMethods: ('email' | 'sms')[];
  maskedEmail?: string;
  maskedPhone?: string;
}

interface VotingPageProps {
  params: { slug: string };
}

type Step = 'info' | 'identify' | 'choose-method' | 'email' | 'verify-email' | 'sms' | 'verify-sms' | 'vote' | 'complete' | 'already-voted';

export default function VotingPage({ params }: VotingPageProps) {
  const [step, setStep] = useState<Step>('info');
  const [plebiscite, setPlebiscite] = useState<Plebiscite | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [tokenValidating, setTokenValidating] = useState(false);
  
  const [identifier, setIdentifier] = useState('');
  const [voterLookup, setVoterLookup] = useState<VoterLookup | null>(null);
  const [selectedMethod, setSelectedMethod] = useState<'email' | 'sms' | null>(null);
  
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [canResend, setCanResend] = useState(true);
  const [resendCooldown, setResendCooldown] = useState(0);
  
  const [phone, setPhone] = useState('');
  const [smsCode, setSmsCode] = useState('');
  const [recaptchaReady, setRecaptchaReady] = useState(false);
  
  const [receiptCodes, setReceiptCodes] = useState<string[]>([]);
  
  const router = useRouter();
  const searchParams = useSearchParams();

  // Handle token-based authentication
  useEffect(() => {
    const token = searchParams.get('token');
    if (token && plebiscite && !tokenValidating && step === 'info') {
      setTokenValidating(true);
      validateToken(token);
    }
  }, [searchParams, plebiscite, step]);

  const validateToken = async (token: string) => {
    try {
      const response = await fetch('/api/auth/validate-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          plebisciteSlug: params.slug
        }),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        // Token is valid, go directly to vote step
        setSelectedMethod('email');
        setEmail(result.email);
        setStep('vote');
      } else {
        // Handle various error cases
        if (result.alreadyVoted) {
          setStep('already-voted');
        } else if (result.redirectTo) {
          router.push(result.redirectTo);
        } else {
          setError(result.error || 'Invalid or expired token');
        }
      }
    } catch (err) {
      setError('Failed to validate token. Please try manual verification.');
    } finally {
      setTokenValidating(false);
    }
  };

  useEffect(() => {
    const fetchPlebiscite = async () => {
      try {
        const response = await fetch('/api/elections/' + params.slug);
        const result = await response.json();
        
        if (response.ok) {
          if (result.plebiscite.status === 'closed') {
            router.push('/results/' + params.slug);
            return;
          }
          
          if (result.plebiscite.status === 'draft') {
            setError('This election has not opened yet');
            return;
          }
          
          if (result.plebiscite.status !== 'open') {
            setError('Voting is not currently active for this election');
            return;
          }
          
          setPlebiscite(result.plebiscite);
          setQuestions(result.questions.map((q: any) => ({
            id: q.id,
            title: q.title,
            description: q.description,
            type: q.type,
            options: typeof q.options === 'string' ? JSON.parse(q.options) : q.options,
            preferentialType: q.preferentialType
          })));
        } else {
          setError('Election not found or not available');
        }
      } catch (err) {
        setError('Failed to load election information');
      } finally {
        setIsLoading(false);
      }
    };

    fetchPlebiscite();
  }, [params.slug, router]);

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

  useEffect(() => {
    if (step === 'sms' && !recaptchaReady) {
      const timer = setTimeout(() => {
        const verifier = setupRecaptcha('sms-send-button');
        if (verifier) {
          setRecaptchaReady(true);
        }
      }, 100);
      return () => clearTimeout(timer);
    }
    
    return () => {
      if (step !== 'sms' && step !== 'verify-sms') {
        clearRecaptcha();
        setRecaptchaReady(false);
      }
    };
  }, [step, recaptchaReady]);

  const looksLikePhone = (input: string): boolean => {
    const cleaned = input.replace(/[\s\-\(\)]/g, '');
    return /^(\+?\d{10,15}|0\d{9})$/.test(cleaned);
  };

  const handleIdentifierSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!identifier.trim()) {
      setError('Please enter your email or phone number');
      return;
    }

    setIsVerifying(true);
    setError('');

    try {
      const isPhone = looksLikePhone(identifier);
      
      const response = await fetch('/api/auth/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: isPhone ? undefined : identifier.trim().toLowerCase(),
          phone: isPhone ? identifier.trim() : undefined,
          plebisciteSlug: params.slug
        }),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        setVoterLookup(result);
        
        if (isPhone) {
          setPhone(identifier.trim());
        } else {
          setEmail(identifier.trim().toLowerCase());
        }
        
        if (result.availableMethods.length === 0) {
          setError('No verification methods available');
        } else if (result.availableMethods.length === 1) {
          const method = result.availableMethods[0];
          setSelectedMethod(method);
          if (method === 'email') {
            setStep('email');
          } else {
            setStep('sms');
          }
        } else {
          setStep('choose-method');
        }
      } else {
        setError(result.error || 'Not found in voter roll');
      }
    } catch (err) {
      setError('An error occurred. Please try again.');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleMethodSelect = (method: 'email' | 'sms') => {
    setSelectedMethod(method);
    setError('');
    if (method === 'email') {
      setStep('email');
    } else {
      setStep('sms');
    }
  };

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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          plebisciteSlug: params.slug
        }),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        setStep('verify-email');
        setCanResend(false);
        setResendCooldown(60);
      } else {
        setError(result.error || 'Failed to send verification code');
      }
    } catch (err) {
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
        headers: { 'Content-Type': 'application/json' },
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
    } catch (err) {
      setError('An error occurred. Please try again.');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleSMSSend = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!phone.trim()) {
      setError('Phone number is required');
      return;
    }

    setIsVerifying(true);
    setError('');

    try {
      let normalizedPhone = phone.trim();
      if (normalizedPhone.startsWith('0') && normalizedPhone.length === 10) {
        normalizedPhone = '+61' + normalizedPhone.substring(1);
      } else if (!normalizedPhone.startsWith('+')) {
        normalizedPhone = '+61' + normalizedPhone;
      }

      const result = await sendSMSVerification(normalizedPhone);

      if (result.success) {
        setStep('verify-sms');
        setCanResend(false);
        setResendCooldown(60);
      } else {
        setError(result.error || 'Failed to send SMS');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred. Please try again.');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleSMSCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!smsCode.trim() || smsCode.trim().length !== 6) {
      setError('Please enter a valid 6-digit code');
      return;
    }

    setIsVerifying(true);
    setError('');

    try {
      const firebaseResult = await verifySMSCode(smsCode.trim());
      
      if (!firebaseResult.success) {
        setError(firebaseResult.error || 'Invalid verification code');
        setIsVerifying(false);
        return;
      }

      const response = await fetch('/api/auth/verify-phone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idToken: firebaseResult.idToken,
          phone: phone.trim(),
          plebisciteSlug: params.slug
        }),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        setStep('vote');
      } else {
        setError(result.error || 'Verification failed');
      }
    } catch (err) {
      setError('An error occurred. Please try again.');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleVoteSubmit = async (votes: { [questionId: number]: any }) => {
    try {
      const response = await fetch('/api/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plebisciteSlug: params.slug,
          votes,
          verificationMethod: selectedMethod || 'email'
        }),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        setReceiptCodes(result.receiptCodes);
        setStep('complete');
      } else {
        throw new Error(result.error || 'Failed to submit vote');
      }
    } catch (err) {
      throw err;
    }
  };

  const resendEmailCode = async () => {
    if (!canResend) return;
    
    setIsVerifying(true);
    setError('');

    try {
      const response = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          plebisciteSlug: params.slug
        }),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        setCanResend(false);
        setResendCooldown(60);
      } else {
        setError(result.error || 'Failed to resend code');
      }
    } catch (err) {
      setError('An error occurred. Please try again.');
    } finally {
      setIsVerifying(false);
    }
  };

  const resendSMS = async () => {
    if (!canResend) return;
    setStep('sms');
    setRecaptchaReady(false);
    setSmsCode('');
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

  if (isLoading || tokenValidating) {
    return (
      <div className="min-h-screen bg-gray-50 flex justify-center items-center">
        <div className="text-center">
          <div className="spinner w-8 h-8 mx-auto mb-4"></div>
          {tokenValidating && <p className="text-gray-600">Validating your ballot link...</p>}
        </div>
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
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Unable to Load Election</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <button onClick={() => router.push('/')} className="btn-primary">
            Return Home
          </button>
        </div>
      </div>
    );
  }

  if (!plebiscite) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center mr-3">
              <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/>
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-semibold text-gray-900">VoteKit Election</h1>
              <p className="text-sm text-gray-600">Secure Online Voting</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {step === 'already-voted' && (
          <div className="max-w-md mx-auto text-center">
            <div className="w-16 h-16 bg-blue-200 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>

            <h2 className="text-2xl font-bold text-gray-900 mb-4">You've Already Voted</h2>
            <p className="text-gray-600 mb-8">
              You have already cast your vote in <strong>{plebiscite.title}</strong>.
              Each voter can only vote once.
            </p>

            <div className="card text-left mb-8">
              <div className="card-body">
                <p className="text-sm text-gray-600">
                  Results will be published after voting closes on {formatDate(plebiscite.close_date)}
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <button onClick={() => router.push('/')} className="btn-primary w-full">
                Return Home
              </button>
            </div>
          </div>
        )}

        {step === 'info' && (
          <div className="space-y-8">
            <div className="text-center">
              <h2 className="text-3xl font-bold text-gray-900 mb-4">{plebiscite.title}</h2>
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
                    <li>Enter your registered email or phone number</li>
                    <li>Verify your identity via email code or SMS</li>
                    <li>Access your ballot and vote on all questions</li>
                    <li>Review and submit your votes</li>
                    <li>Save your receipt codes for verification</li>
                  </ol>
                </div>
              </div>
            </div>

            <div className="text-center">
              <button onClick={() => setStep('identify')} className="btn-primary px-8">
                Begin Voting
              </button>
            </div>
          </div>
        )}

        {step === 'identify' && (
          <div className="max-w-md mx-auto">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Enter Your Details</h2>
              <p className="text-gray-600">Enter your registered email or phone number</p>
            </div>

            <div className="card">
              <div className="card-body">
                <form onSubmit={handleIdentifierSubmit} className="space-y-4">
                  <div>
                    <label htmlFor="identifier" className="block text-sm font-medium text-gray-700 mb-1">
                      Email or Phone Number
                    </label>
                    <input
                      type="text"
                      id="identifier"
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      className="input-field"
                      placeholder="your.email@example.com or 0412 345 678"
                      disabled={isVerifying}
                      required
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Must be registered in the voter roll
                    </p>
                  </div>

                  {error && <div className="alert-error">{error}</div>}

                  <button type="submit" disabled={isVerifying} className="btn-primary w-full">
                    {isVerifying ? 'Looking up...' : 'Continue'}
                  </button>
                </form>
              </div>
            </div>

            <div className="text-center mt-4">
              <button onClick={() => setStep('info')} className="text-sm text-gray-600 hover:text-primary">
                ← Back to Information
              </button>
            </div>
          </div>
        )}

        {step === 'choose-method' && voterLookup && (
          <div className="max-w-md mx-auto">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Choose Verification Method</h2>
              <p className="text-gray-600">How would you like to verify your identity?</p>
            </div>

            <div className="card">
              <div className="card-body space-y-4">
                {voterLookup.hasEmail && voterLookup.availableMethods.includes('email') && (
                  <button
                    onClick={() => handleMethodSelect('email')}
                    className="w-full p-4 border-2 border-gray-200 rounded-lg hover:border-primary hover:bg-blue-50 transition-colors text-left"
                  >
                    <div className="flex items-center">
                      <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center mr-4">
                        <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                      </div>
                      <div>
                        <div className="font-medium text-gray-900">Verify via Email</div>
                        <div className="text-sm text-gray-500">{voterLookup.maskedEmail}</div>
                      </div>
                    </div>
                  </button>
                )}

                {voterLookup.hasPhone && voterLookup.smsEnabled && voterLookup.availableMethods.includes('sms') && (
                  <button
                    onClick={() => handleMethodSelect('sms')}
                    className="w-full p-4 border-2 border-gray-200 rounded-lg hover:border-primary hover:bg-blue-50 transition-colors text-left"
                  >
                    <div className="flex items-center">
                      <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center mr-4">
                        <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                        </svg>
                      </div>
                      <div>
                        <div className="font-medium text-gray-900">Verify via SMS</div>
                        <div className="text-sm text-gray-500">{voterLookup.maskedPhone}</div>
                      </div>
                    </div>
                  </button>
                )}

                {error && <div className="alert-error">{error}</div>}
              </div>
            </div>

            <div className="text-center mt-4">
              <button onClick={() => { setStep('identify'); setVoterLookup(null); }} className="text-sm text-gray-600 hover:text-primary">
                ← Change identifier
              </button>
            </div>
          </div>
        )}

        {step === 'email' && (
          <div className="max-w-md mx-auto">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Verify via Email</h2>
              <p className="text-gray-600">We will send a verification code to your email</p>
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
                  </div>

                  {error && <div className="alert-error">{error}</div>}

                  <button type="submit" disabled={isVerifying} className="btn-primary w-full">
                    {isVerifying ? 'Sending Code...' : 'Send Verification Code'}
                  </button>
                </form>
              </div>
            </div>

            <div className="text-center mt-4">
              <button
                onClick={() => voterLookup ? setStep('choose-method') : setStep('identify')}
                className="text-sm text-gray-600 hover:text-primary"
              >
                ← Back
              </button>
            </div>
          </div>
        )}

        {step === 'verify-email' && (
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
                    <p className="text-xs text-gray-500 mt-1">Code expires in 10 minutes</p>
                  </div>

                  {error && <div className="alert-error">{error}</div>}

                  <button type="submit" disabled={isVerifying || code.length !== 6} className="btn-primary w-full">
                    {isVerifying ? 'Verifying...' : 'Verify & Continue'}
                  </button>
                </form>

                <div className="text-center mt-4">
                  {canResend ? (
                    <button onClick={resendEmailCode} disabled={isVerifying} className="text-sm text-primary hover:text-primary-dark">
                      Resend Code
                    </button>
                  ) : (
                    <span className="text-sm text-gray-500">Resend in {resendCooldown}s</span>
                  )}
                </div>
              </div>
            </div>

            <div className="text-center mt-4">
              <button onClick={() => setStep('email')} className="text-sm text-gray-600 hover:text-primary">
                ← Change Email Address
              </button>
            </div>
          </div>
        )}

        {step === 'sms' && (
          <div className="max-w-md mx-auto">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Verify via SMS</h2>
              <p className="text-gray-600">We will send a verification code to your phone</p>
            </div>

            <div className="card">
              <div className="card-body">
                <form onSubmit={handleSMSSend} className="space-y-4">
                  <div>
                    <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">
                      Phone Number
                    </label>
                    <input
                      type="tel"
                      id="phone"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="input-field"
                      placeholder="+61 412 345 678"
                      disabled={isVerifying}
                      required
                    />
                    <p className="text-xs text-gray-500 mt-1">Must match your registered phone number</p>
                  </div>

                  {error && <div className="alert-error">{error}</div>}

                  <button
                    type="submit"
                    id="sms-send-button"
                    disabled={isVerifying || !recaptchaReady}
                    className="btn-primary w-full"
                  >
                    {isVerifying ? 'Sending SMS...' : !recaptchaReady ? 'Initializing...' : 'Send Verification SMS'}
                  </button>
                </form>
              </div>
            </div>

            <div className="text-center mt-4">
              <button
                onClick={() => voterLookup ? setStep('choose-method') : setStep('identify')}
                className="text-sm text-gray-600 hover:text-primary"
              >
                ← Back
              </button>
            </div>
          </div>
        )}

        {step === 'verify-sms' && (
          <div className="max-w-md mx-auto">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Enter SMS Code</h2>
              <p className="text-gray-600">
                Check your phone for a 6-digit code sent to<br />
                <strong>{phone}</strong>
              </p>
            </div>

            <div className="card">
              <div className="card-body">
                <form onSubmit={handleSMSCodeSubmit} className="space-y-4">
                  <div>
                    <label htmlFor="smsCode" className="block text-sm font-medium text-gray-700 mb-1">
                      Verification Code
                    </label>
                    <input
                      type="text"
                      id="smsCode"
                      value={smsCode}
                      onChange={(e) => setSmsCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      className="input-field text-center text-2xl tracking-widest font-mono"
                      placeholder="000000"
                      disabled={isVerifying}
                      maxLength={6}
                      required
                    />
                    <p className="text-xs text-gray-500 mt-1">Code expires in 5 minutes</p>
                  </div>

                  {error && <div className="alert-error">{error}</div>}

                  <button type="submit" disabled={isVerifying || smsCode.length !== 6} className="btn-primary w-full">
                    {isVerifying ? 'Verifying...' : 'Verify & Continue'}
                  </button>
                </form>

                <div className="text-center mt-4">
                  {canResend ? (
                    <button onClick={resendSMS} disabled={isVerifying} className="text-sm text-primary hover:text-primary-dark">
                      Resend SMS
                    </button>
                  ) : (
                    <span className="text-sm text-gray-500">Resend in {resendCooldown}s</span>
                  )}
                </div>
              </div>
            </div>

            <div className="text-center mt-4">
              <button onClick={() => setStep('sms')} className="text-sm text-gray-600 hover:text-primary">
                ← Change Phone Number
              </button>
            </div>
          </div>
        )}

        {step === 'vote' && (
          <div className="space-y-8">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Cast Your Vote</h2>
              <p className="text-gray-600">Answer all questions below. You can review your choices before submitting.</p>
            </div>
            <VoteForm questions={questions} onSubmit={handleVoteSubmit} />
          </div>
        )}

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
                  {receiptCodes.map((receiptCode, index) => (
                    <div key={index} className="flex justify-between items-center py-2">
                      <span className="text-sm font-medium text-gray-700">Question {index + 1}:</span>
                      <span className="font-mono text-sm bg-white px-2 py-1 rounded border">{receiptCode}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Results will be published after voting closes on {formatDate(plebiscite.close_date)}
              </p>
              <button onClick={() => router.push('/')} className="btn-primary">
                Return to Home
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
