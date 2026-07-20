'use client';

import { use, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import VoteForm from '@/components/VoteForm';
import { csrfFetch } from '@/lib/csrf-client';
import { parseElectionCloseDate } from '@/lib/election-window';
import { encryptBallot } from '@/lib/browser-ballot-crypto';
import type { EncryptedBallotPackage, EncryptedElectionManifest } from '@/lib/encrypted-ballots';
import { confirmSmsCode, sendSmsCode } from '@/lib/firebase';

interface Plebiscite {
  id: number;
  slug: string;
  title: string;
  description: string;
  info_url?: string;
  open_date: string;
  close_date: string;
  status: string;
  voting_available: boolean;
  privacy_mode: 'legacy' | 'encrypted';
  access_mode: 'voter_roll' | 'anonymous_codes';
  sms_enabled: boolean;
  encrypted_ballot?: {
    manifest: EncryptedElectionManifest;
    manifestHash: string;
    publicKeyJwk: JsonWebKey;
  } | null;
}

interface Question {
  id: number;
  publicId: string;
  title: string;
  description?: string;
  type: 'yes_no' | 'multiple_choice' | 'ranked_choice' | 'condorcet';
  options: string[];
  preferentialType?: 'compulsory' | 'optional';
}

interface VotingPageProps {
  params: Promise<{ slug: string }>;
}

export default function VotingPage({ params }: VotingPageProps) {
  const { slug } = use(params);
  const [step, setStep] = useState<'info' | 'email' | 'phone' | 'accessCode' | 'verify' | 'vote' | 'complete'>('info');
  const [plebiscite, setPlebiscite] = useState<Plebiscite | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  
  // Email verification
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [accessCode, setAccessCode] = useState('');
  const [resultAccessCode, setResultAccessCode] = useState('');
  const [phone, setPhone] = useState('');
  const [smsCode, setSmsCode] = useState('');
  const [smsSent, setSmsSent] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [canResend, setCanResend] = useState(true);
  const [resendCooldown, setResendCooldown] = useState(0);
  
  // Vote submission
  const [receiptCodes, setReceiptCodes] = useState<string[]>([]);
  const [pendingEncryptedSubmission, setPendingEncryptedSubmission] = useState<null | {
    submissionId: string;
    encryptedPackage: EncryptedBallotPackage;
    commitment: string;
    receipt: string;
  }>(null);
  
  const router = useRouter();

  // Fetch plebiscite data
  useEffect(() => {
    const fetchPlebiscite = async () => {
      try {
        const response = await fetch(`/api/elections/${slug}`);
        const result = await response.json();
        
        if (response.ok) {
          // Check election status
          if (result.plebiscite.status === 'closed') {
            // Preserve private credential fragments so the original ballot link
            // can also authenticate an elector to the closed results page.
            router.push(`/results/${slug}${window.location.hash}`);
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

          if (!result.plebiscite.voting_available) {
            setError('Voting has closed for this election. Results will be published after the election is formally closed.');
            return;
          }
          
          setPlebiscite(result.plebiscite);
          setQuestions(result.questions.map((q: any) => ({
            id: q.id,
            publicId: q.publicId,
            title: q.title,
            description: q.description,
            type: q.type,
            options: typeof q.options === 'string' ? JSON.parse(q.options) : q.options,
            preferentialType: q.preferentialType
          })));
        } else {
          setError('Election not found or not available');
        }
      } catch (error) {
        setError('Failed to load election information');
      } finally {
        setIsLoading(false);
      }
    };

    fetchPlebiscite();
  }, [slug, router]);

  useEffect(() => {
    if (!plebiscite) return;
    const codeMatch = window.location.hash.match(/^#code=(.+)$/u);
    if (plebiscite.access_mode === 'anonymous_codes' && codeMatch) {
      setAccessCode(decodeURIComponent(codeMatch[1]));
      setStep('accessCode');
      return;
    }
    const voterMatch = window.location.hash.match(/^#voter=(.+)$/u);
    if (plebiscite.access_mode === 'voter_roll' && voterMatch) {
      setIsVerifying(true);
      void csrfFetch('/api/auth/voter-link', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: decodeURIComponent(voterMatch[1]), plebisciteSlug: slug })
      }).then(async response => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Invalid ballot link');
        history.replaceState(null, '', window.location.pathname);
        setStep('vote');
      }).catch(cause => setError(cause instanceof Error ? cause.message : 'Invalid ballot link'))
        .finally(() => setIsVerifying(false));
    }
  }, [plebiscite, slug]);

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
      const response = await csrfFetch('/api/auth/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: email.trim(),
          plebisciteSlug: slug
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
      const response = await csrfFetch('/api/auth/confirm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: email.trim(),
          code: code.trim(),
          plebisciteSlug: slug
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

  const handleAccessCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsVerifying(true); setError('');
    try {
      const response = await csrfFetch('/api/auth/access-code', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: accessCode, plebisciteSlug: slug })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Invalid or already used voting code');
      setResultAccessCode(accessCode);
      history.replaceState(null, '', window.location.pathname);
      setAccessCode('');
      setStep('vote');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Invalid or already used voting code');
    } finally { setIsVerifying(false); }
  };

  const handlePhoneSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setIsVerifying(true); setError('');
    try {
      if (!smsSent) {
        let normalized = phone.replace(/[^\d+]/g, '');
        if (normalized.startsWith('0') && normalized.length === 10) normalized = `+61${normalized.slice(1)}`;
        else if (normalized.startsWith('61')) normalized = `+${normalized}`;
        await sendSmsCode(normalized, 'send-sms-code');
        setPhone(normalized); setSmsSent(true);
      } else {
        const idToken = await confirmSmsCode(smsCode);
        const response = await csrfFetch('/api/auth/verify-phone', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken, plebisciteSlug: slug })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Phone verification failed');
        setStep('vote');
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Phone verification failed');
    } finally { setIsVerifying(false); }
  };

  const handleVoteSubmit = async (votes: { [questionId: number]: any }) => {
    try {
      let requestBody: Record<string, unknown> = { plebisciteSlug: slug, votes };
      let encryptedSubmission = pendingEncryptedSubmission;
      if (plebiscite?.privacy_mode === 'encrypted') {
        const encryption = plebiscite.encrypted_ballot;
        if (!encryption) throw new Error('The encrypted ballot box is not configured');
        if (!encryptedSubmission) {
          const answers = Object.fromEntries(questions.map(question => [question.publicId, votes[question.id]]));
          const encrypted = await encryptBallot(
            encryption.manifest,
            encryption.manifestHash,
            encryption.publicKeyJwk,
            answers
          );
          encryptedSubmission = {
            submissionId: crypto.randomUUID(),
            encryptedPackage: encrypted.encryptedPackage,
            commitment: encrypted.commitment,
            receipt: encrypted.receipt
          };
          setPendingEncryptedSubmission(encryptedSubmission);
        }
        requestBody = {
          plebisciteSlug: slug,
          submissionId: encryptedSubmission.submissionId,
          encryptedPackage: encryptedSubmission.encryptedPackage,
          commitment: encryptedSubmission.commitment,
          manifestHash: encryption.manifestHash
        };
      }
      const response = await csrfFetch('/api/vote', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        setReceiptCodes(encryptedSubmission ? [encryptedSubmission.receipt] : result.receiptCodes);
        setStep('complete');
      } else {
        throw new Error(result.error || 'Failed to submit vote');
      }
    } catch (error) {
      throw error; // Let VoteForm handle the error display
    }
  };

  const downloadReceipt = () => {
    if (!receiptCodes.length) return;
    const blob = new Blob([
      `VoteKit private ballot receipt\nElection: ${plebiscite?.title || ''}\nReceipt: ${receiptCodes[0]}\n\nKeep this private unless you choose to disclose your vote. VoteKit cannot recover it.\n`
    ], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${slug}-private-receipt.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const resendCode = async () => {
    if (!canResend) return;
    
    setIsVerifying(true);
    setError('');

    try {
      const response = await csrfFetch('/api/auth/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: email.trim(),
          plebisciteSlug: slug
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
    return parseElectionCloseDate(dateString).toLocaleDateString('en-AU', {
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
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Unable to Load Election</h2>
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
              <h1 className="text-lg font-semibold text-gray-900">VoteKit Election</h1>
              <p className="text-sm text-gray-600">Secure election voting</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Election Information */}
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
                    <p className="text-sm font-medium text-blue-900 mb-2">Additional information:</p>
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
                  <h4 className="text-sm font-medium text-green-900 mb-2">How voting works:</h4>
                  <ol className="text-sm text-green-800 space-y-1 list-decimal list-inside">
                    {plebiscite.access_mode === 'anonymous_codes' ? <>
                      <li>Open your unique voting link or enter your voting code</li>
                      <li>Your code unlocks one anonymous ballot</li>
                    </> : <>
                      <li>Enter your registered email address</li>
                      <li>Check your email for a 6-digit verification code</li>
                      <li>Enter the code to access your ballot</li>
                    </>}
                    <li>Vote on all questions</li>
                    <li>Review and submit your votes</li>
                    <li>Save your receipt codes for verification</li>
                  </ol>
                </div>
              </div>
            </div>

            <div className="text-center">
              <button
                onClick={() => setStep(plebiscite.access_mode === 'anonymous_codes' ? 'accessCode' : 'email')}
                className="btn-primary px-8"
              >
                Begin
              </button>
            </div>
          </div>
        )}

        {step === 'accessCode' && (
          <div className="max-w-md mx-auto">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Enter your voting code</h2>
              <p className="text-gray-600">Each code unlocks one anonymous ballot.</p>
            </div>
            <div className="card"><div className="card-body">
              <form onSubmit={handleAccessCodeSubmit} className="space-y-4">
                <input aria-label="Voting code" value={accessCode} onChange={event => setAccessCode(event.target.value.toUpperCase())}
                  className="input-field text-center font-mono tracking-wider" placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX" autoComplete="one-time-code" required />
                {error && <div className="alert-error">{error}</div>}
                <button className="btn-primary w-full" disabled={isVerifying}>{isVerifying ? 'Checking code…' : 'Continue to ballot'}</button>
              </form>
            </div></div>
            <div className="text-center mt-4"><button onClick={() => setStep('info')} className="text-sm text-gray-600 hover:text-primary">← Back to Information</button></div>
          </div>
        )}

        {/* Email Entry */}
        {step === 'email' && (
          <div className="max-w-md mx-auto">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Enter Your Email</h2>
              <p className="text-gray-600">
                We'll send a verification code to confirm your eligibility
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
                      Use the email address on the voter roll
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
              {plebiscite.sms_enabled && <button onClick={() => { setError(''); setStep('phone'); }} className="block mx-auto mb-3 text-sm font-medium text-primary hover:text-primary-dark">Use a registered phone number instead</button>}
              <button
                onClick={() => setStep('info')}
                className="text-sm text-gray-600 hover:text-primary"
              >
                ← Back to Information
              </button>
            </div>
          </div>
        )}

        {step === 'phone' && (
          <div className="max-w-md mx-auto">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Verify by text message</h2>
              <p className="text-gray-600">{smsSent ? `Enter the code sent to ${phone}` : 'Use the phone number registered for this election.'}</p>
            </div>
            <div className="card"><div className="card-body">
              <form onSubmit={handlePhoneSubmit} className="space-y-4">
                {!smsSent ? <input type="tel" value={phone} onChange={event => setPhone(event.target.value)} className="input-field" placeholder="04xx xxx xxx" required />
                  : <input value={smsCode} onChange={event => setSmsCode(event.target.value.replace(/\D/g, '').slice(0, 6))} className="input-field text-center text-2xl tracking-widest font-mono" placeholder="000000" required />}
                {error && <div className="alert-error">{error}</div>}
                <button id="send-sms-code" className="btn-primary w-full" disabled={isVerifying}>{isVerifying ? 'Please wait…' : smsSent ? 'Verify and continue' : 'Send text message'}</button>
              </form>
            </div></div>
            <div className="text-center mt-4"><button onClick={() => { setError(''); setStep('email'); }} className="text-sm text-gray-600 hover:text-primary">Use email instead</button></div>
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
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Cast your vote</h2>
              <p className="text-gray-600">
                Answer all questions below. You can review your choices before submitting.
              </p>
            </div>

            <div className="mx-auto max-w-3xl rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
              <div className="font-semibold">How you will view the final results</div>
              <p className="mt-1">
                {plebiscite.access_mode === 'anonymous_codes'
                  ? 'Keep your voting code. After the election closes, return to this election link and enter the same code to view the results.'
                  : `After the election closes, return to this election link and verify again using your registered ${plebiscite.sms_enabled ? 'email address or phone number' : 'email address'}.`}
              </p>
              <p className="mt-1">This proves that you are an eligible elector. It is never connected to the contents of your ballot.</p>
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

            <h2 className="text-3xl font-bold text-gray-900 mb-4">Vote Submitted</h2>
            <p className="text-lg text-gray-600 mb-8">
              Your ballot has been recorded for: <strong>{plebiscite.title}</strong>
            </p>

            <div className="card text-left mb-8">
              <div className="card-header">
                <h3 className="text-lg font-semibold text-gray-900">
                  {plebiscite.privacy_mode === 'encrypted' ? 'Private Ballot Receipt' : 'Receipt Codes'}
                </h3>
              </div>
              <div className="card-body">
                <p className="text-sm text-gray-600 mb-4">
                  {plebiscite.privacy_mode === 'encrypted'
                    ? 'Save this private receipt. After closure it verifies your complete shuffled ballot. VoteKit cannot recover it.'
                    : 'Save these receipt codes. They can be used to verify that your ballot was included without revealing your choices.'}
                </p>
                <div className="bg-gray-50 rounded-lg p-4">
                  {receiptCodes.map((code, index) => (
                    <div key={index} className="flex justify-between items-center py-2">
                      <span className="text-sm font-medium text-gray-700">
                        {plebiscite.privacy_mode === 'encrypted' ? 'Complete ballot:' : `Question ${index + 1}:`}
                      </span>
                      <span className="font-mono text-sm bg-white px-2 py-1 rounded border">{code}</span>
                    </div>
                  ))}
                </div>
                {plebiscite.privacy_mode === 'encrypted' && (
                  <button type="button" onClick={downloadReceipt} className="btn-secondary w-full mt-4">
                    Download Private Receipt
                  </button>
                )}
              </div>
            </div>

            <div className="card mb-8 text-left">
              <div className="card-header"><h3 className="text-lg font-semibold text-gray-900">Viewing the final results</h3></div>
              <div className="card-body text-sm text-gray-700">
                {plebiscite.access_mode === 'anonymous_codes' ? (
                  <>
                    <p>Keep the voting code below. When the election closes, return to this election link and enter the same code to view the final results.</p>
                    {resultAccessCode && <div className="mt-4 rounded-lg bg-gray-50 p-4 text-center font-mono font-semibold tracking-wider">{resultAccessCode}</div>}
                  </>
                ) : (
                  <p>When the election closes, return to this election link and verify using your registered {plebiscite.sms_enabled ? 'email address or phone number' : 'email address'} to view the final results.</p>
                )}
                <p className="mt-3 text-xs text-gray-500">Eligibility verification is separate from your anonymous ballot and cannot reveal how you voted.</p>
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
