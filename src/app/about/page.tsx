import Link from 'next/link';

export const metadata = {
  title: 'How It Works - VoteKit Election Platform',
  description: 'Learn how the VoteKit Election Platform works, including voting methods, security, and the complete workflow.',
};

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <Link href="/" className="flex items-center">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center mr-3">
                <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z" />
                </svg>
              </div>
              <h1 className="text-xl font-bold text-gray-900">VoteKit Election Platform</h1>
            </Link>
            <Link href="/" className="text-sm text-gray-600 hover:text-primary transition-colors">
              Back to Home
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Hero */}
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold text-gray-900 mb-4">How It Works</h2>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            A simple, secure platform for electors to have their say on the issues that matter. 
            Here&apos;s everything you need to know.
          </p>
        </div>

        {/* Voting Workflow */}
        <section className="mb-16">
          <h3 className="text-2xl font-bold text-gray-900 mb-8 pb-3 border-b-2 border-primary">
            The Voting Process
          </h3>
          
          <div className="space-y-8">
            <div className="flex items-start">
              <div className="flex-shrink-0 w-10 h-10 bg-primary rounded-full flex items-center justify-center text-white font-bold text-lg">
                1
              </div>
              <div className="ml-5">
                <h4 className="text-lg font-semibold text-gray-900">An election is announced</h4>
                <p className="text-gray-600 mt-1">
                  When an issue is put to electors, an election is created with a clear question, 
                  background information, and a voting period. A single shareable link is generated 
                  that can be posted on social media, sent via email, shared in messaging groups, 
                  or even printed as a QR code on a flyer.
                </p>
              </div>
            </div>

            <div className="flex items-start">
              <div className="flex-shrink-0 w-10 h-10 bg-primary rounded-full flex items-center justify-center text-white font-bold text-lg">
                2
              </div>
              <div className="ml-5">
                <h4 className="text-lg font-semibold text-gray-900">You click the link</h4>
                <p className="text-gray-600 mt-1">
                  The link takes you to the election page where you can read the question, 
                  review any background material, and understand what you&apos;re voting on. 
                  No app to download, no account to create.
                </p>
              </div>
            </div>

            <div className="flex items-start">
              <div className="flex-shrink-0 w-10 h-10 bg-primary rounded-full flex items-center justify-center text-white font-bold text-lg">
                3
              </div>
              <div className="ml-5">
                <h4 className="text-lg font-semibold text-gray-900">Verify your identity</h4>
                <p className="text-gray-600 mt-1">
                  Enter the email or phone number you&apos;re registered with. You&apos;ll receive 
                  a 6-digit verification code to that address. This confirms you&apos;re an eligible 
                  elector and prevents anyone from voting on your behalf. The code expires after 
                  10 minutes for security.
                </p>
              </div>
            </div>

            <div className="flex items-start">
              <div className="flex-shrink-0 w-10 h-10 bg-primary rounded-full flex items-center justify-center text-white font-bold text-lg">
                4
              </div>
              <div className="ml-5">
                <h4 className="text-lg font-semibold text-gray-900">Cast your vote</h4>
                <p className="text-gray-600 mt-1">
                  Once verified, you&apos;ll see the ballot with all questions. Depending on the 
                  question type, you&apos;ll select your answer, choose from options, or rank your 
                  preferences by dragging them into order. You can review everything before submitting.
                </p>
              </div>
            </div>

            <div className="flex items-start">
              <div className="flex-shrink-0 w-10 h-10 bg-primary rounded-full flex items-center justify-center text-white font-bold text-lg">
                5
              </div>
              <div className="ml-5">
                <h4 className="text-lg font-semibold text-gray-900">Get your receipt</h4>
                <p className="text-gray-600 mt-1">
                  After submitting, you&apos;ll receive a unique receipt code. This lets you verify 
                  that your vote was recorded in the system without revealing how you voted. 
                  Save it for your records.
                </p>
              </div>
            </div>

            <div className="flex items-start">
              <div className="flex-shrink-0 w-10 h-10 bg-primary rounded-full flex items-center justify-center text-white font-bold text-lg">
                6
              </div>
              <div className="ml-5">
                <h4 className="text-lg font-semibold text-gray-900">Results after close</h4>
                <p className="text-gray-600 mt-1">
                  Results are only revealed after the voting period ends. No one -- not even 
                  administrators -- can see results while voting is still open. This prevents 
                  tactical voting and ensures everyone votes based on their own views.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Voting Methods */}
        <section className="mb-16">
          <h3 className="text-2xl font-bold text-gray-900 mb-8 pb-3 border-b-2 border-primary">
            Voting Methods
          </h3>
          <p className="text-gray-600 mb-8">
            Each election can include multiple questions, and each question can use the 
            voting method best suited to the decision being made.
          </p>

          <div className="space-y-8">
            {/* Yes/No */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="bg-primary px-6 py-4">
                <h4 className="text-lg font-semibold text-white">Yes / No</h4>
              </div>
              <div className="p-6">
                <p className="text-gray-600 mb-4">
                  The simplest form of voting. A clear question is asked and electors vote 
                  either <strong>Yes</strong> or <strong>No</strong>.
                </p>
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm font-medium text-gray-700 mb-2">Example:</p>
                  <p className="text-sm text-gray-600 italic">
                    &quot;Should the party support the proposed legislation on renewable energy targets?&quot;
                  </p>
                  <div className="mt-3 flex space-x-4">
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">Yes</span>
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-red-100 text-red-800">No</span>
                  </div>
                </div>
                <p className="text-sm text-gray-500 mt-4">
                  <strong>Best for:</strong> Binary decisions, motions, policy positions where 
                  there are two clear options.
                </p>
              </div>
            </div>

            {/* Multiple Choice */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="bg-primary px-6 py-4">
                <h4 className="text-lg font-semibold text-white">Multiple Choice</h4>
              </div>
              <div className="p-6">
                <p className="text-gray-600 mb-4">
                  Electors choose <strong>one option</strong> from a list of possibilities. 
                  The option with the most votes wins (simple plurality).
                </p>
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm font-medium text-gray-700 mb-2">Example:</p>
                  <p className="text-sm text-gray-600 italic">
                    &quot;Which issue should be the party&apos;s top priority for the next parliamentary session?&quot;
                  </p>
                  <div className="mt-3 space-y-2">
                    <span className="block text-sm text-gray-700">A. Housing affordability</span>
                    <span className="block text-sm text-gray-700">B. Climate action</span>
                    <span className="block text-sm text-gray-700">C. Healthcare funding</span>
                    <span className="block text-sm text-gray-700">D. Public transport</span>
                  </div>
                </div>
                <p className="text-sm text-gray-500 mt-4">
                  <strong>Best for:</strong> Choosing between several distinct options where 
                  a single preference is all that&apos;s needed.
                </p>
              </div>
            </div>

            {/* Ranked Choice / IRV */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="bg-primary px-6 py-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-lg font-semibold text-white">Ranked Choice (Preferential / IRV)</h4>
                  <span className="text-xs bg-white bg-opacity-20 text-white px-2 py-1 rounded-full">Recommended</span>
                </div>
              </div>
              <div className="p-6">
                <p className="text-gray-600 mb-4">
                  Members <strong>rank all options in order of preference</strong> (1st choice, 
                  2nd choice, 3rd choice, etc.) by dragging them into order. This uses 
                  <strong> Instant-Runoff Voting (IRV)</strong> -- the same method used in 
                  Australian federal elections.
                </p>
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm font-medium text-gray-700 mb-2">Example:</p>
                  <p className="text-sm text-gray-600 italic mb-3">
                    &quot;Rank the following candidates for the policy committee:&quot;
                  </p>
                  <div className="space-y-2">
                    <div className="flex items-center text-sm">
                      <span className="w-6 h-6 bg-primary text-white rounded flex items-center justify-center text-xs font-bold mr-2">1</span>
                      <span className="text-gray-700">Your most preferred option</span>
                    </div>
                    <div className="flex items-center text-sm">
                      <span className="w-6 h-6 bg-primary-light text-white rounded flex items-center justify-center text-xs font-bold mr-2">2</span>
                      <span className="text-gray-700">Your second choice</span>
                    </div>
                    <div className="flex items-center text-sm">
                      <span className="w-6 h-6 bg-gray-400 text-white rounded flex items-center justify-center text-xs font-bold mr-2">3</span>
                      <span className="text-gray-700">Your third choice</span>
                    </div>
                    <div className="flex items-center text-sm">
                      <span className="w-6 h-6 bg-gray-300 text-white rounded flex items-center justify-center text-xs font-bold mr-2">4</span>
                      <span className="text-gray-700">...and so on</span>
                    </div>
                  </div>
                </div>

                <div className="mt-6">
                  <h5 className="text-sm font-semibold text-gray-900 mb-3">How IRV counting works:</h5>
                  <div className="space-y-3">
                    <div className="flex items-start">
                      <div className="flex-shrink-0 w-6 h-6 bg-gray-100 rounded-full flex items-center justify-center text-xs font-bold text-gray-600 mt-0.5">1</div>
                      <p className="ml-3 text-sm text-gray-600">
                        <strong>Count first preferences.</strong> Every voter&apos;s #1 choice is tallied.
                      </p>
                    </div>
                    <div className="flex items-start">
                      <div className="flex-shrink-0 w-6 h-6 bg-gray-100 rounded-full flex items-center justify-center text-xs font-bold text-gray-600 mt-0.5">2</div>
                      <p className="ml-3 text-sm text-gray-600">
                        <strong>Check for a majority.</strong> If any option has more than 50% of votes, it wins.
                      </p>
                    </div>
                    <div className="flex items-start">
                      <div className="flex-shrink-0 w-6 h-6 bg-gray-100 rounded-full flex items-center justify-center text-xs font-bold text-gray-600 mt-0.5">3</div>
                      <p className="ml-3 text-sm text-gray-600">
                        <strong>Eliminate the lowest.</strong> The option with the fewest votes is eliminated.
                      </p>
                    </div>
                    <div className="flex items-start">
                      <div className="flex-shrink-0 w-6 h-6 bg-gray-100 rounded-full flex items-center justify-center text-xs font-bold text-gray-600 mt-0.5">4</div>
                      <p className="ml-3 text-sm text-gray-600">
                        <strong>Redistribute votes.</strong> Anyone who voted for the eliminated option 
                        has their vote transferred to their next preference.
                      </p>
                    </div>
                    <div className="flex items-start">
                      <div className="flex-shrink-0 w-6 h-6 bg-gray-100 rounded-full flex items-center justify-center text-xs font-bold text-gray-600 mt-0.5">5</div>
                      <p className="ml-3 text-sm text-gray-600">
                        <strong>Repeat</strong> until one option has a majority. The full round-by-round 
                        count is displayed in the results so you can see exactly how votes flowed.
                      </p>
                    </div>
                  </div>
                </div>

                <p className="text-sm text-gray-500 mt-6">
                  <strong>Best for:</strong> Elections with more than two options where you want to 
                  ensure the winner has broad support, not just the most first-preference votes. 
                  Prevents vote-splitting and &quot;wasted&quot; votes.
                </p>
              </div>
            </div>

            {/* Condorcet */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="bg-primary px-6 py-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-lg font-semibold text-white">Condorcet (Pairwise Comparison)</h4>
                  <span className="text-xs bg-white bg-opacity-20 text-white px-2 py-1 rounded-full">Advanced</span>
                </div>
              </div>
              <div className="p-6">
                <p className="text-gray-600 mb-4">
                  Members <strong>rank all options in order of preference</strong>, just like Ranked Choice. 
                  But instead of eliminating candidates round by round, every option is compared 
                  <strong> head-to-head against every other option</strong> using the rankings. If one option 
                  beats all others in direct comparison, it&apos;s the clear winner.
                </p>
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm font-medium text-gray-700 mb-2">Example:</p>
                  <p className="text-sm text-gray-600 italic mb-3">
                    &quot;Rank the following policy approaches for housing reform:&quot;
                  </p>
                  <div className="space-y-2 text-sm text-gray-700">
                    <div>A. Rent caps</div>
                    <div>B. Public housing investment</div>
                    <div>C. Zoning reform</div>
                    <div>D. Tax incentives for developers</div>
                  </div>
                  <div className="mt-3 text-sm text-gray-600">
                    The system checks: Does A beat B? Does A beat C? Does A beat D? Does B beat C? 
                    ...and so on for every possible pair.
                  </div>
                </div>

                <div className="mt-6">
                  <h5 className="text-sm font-semibold text-gray-900 mb-3">How Condorcet counting works:</h5>
                  <div className="space-y-3">
                    <div className="flex items-start">
                      <div className="flex-shrink-0 w-6 h-6 bg-gray-100 rounded-full flex items-center justify-center text-xs font-bold text-gray-600 mt-0.5">1</div>
                      <p className="ml-3 text-sm text-gray-600">
                        <strong>Pairwise comparison.</strong> Every option is matched against every other option. 
                        Using the rankings, the system counts how many voters prefer A over B, B over A, and so on 
                        for every possible pair.
                      </p>
                    </div>
                    <div className="flex items-start">
                      <div className="flex-shrink-0 w-6 h-6 bg-gray-100 rounded-full flex items-center justify-center text-xs font-bold text-gray-600 mt-0.5">2</div>
                      <p className="ml-3 text-sm text-gray-600">
                        <strong>Check for a Condorcet winner.</strong> If one option beats every other option 
                        in head-to-head matchups, it wins outright. This is the strongest possible mandate -- 
                        a majority prefers this option over every alternative.
                      </p>
                    </div>
                    <div className="flex items-start">
                      <div className="flex-shrink-0 w-6 h-6 bg-gray-100 rounded-full flex items-center justify-center text-xs font-bold text-gray-600 mt-0.5">3</div>
                      <p className="ml-3 text-sm text-gray-600">
                        <strong>Resolve cycles (if needed).</strong> Sometimes preferences are cyclical -- A beats B, 
                        B beats C, but C beats A. When this happens, the <strong>Schulze method</strong> is used 
                        to find the winner by calculating the &quot;strongest paths&quot; of preference through 
                        all candidates.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h5 className="text-sm font-semibold text-blue-900 mb-2">Condorcet vs Ranked Choice (IRV) -- what&apos;s the difference?</h5>
                  <div className="text-sm text-blue-800 space-y-2">
                    <p>
                      Both use ranked ballots, but they count differently. <strong>IRV</strong> eliminates the 
                      least popular option each round and redistributes votes -- like a series of runoff elections. 
                      <strong> Condorcet</strong> compares every option against every other option simultaneously.
                    </p>
                    <p>
                      Condorcet is generally considered more thorough because it always finds the option with the 
                      broadest support. IRV can occasionally eliminate a broadly popular &quot;compromise&quot; 
                      candidate early if they have fewer first-preference votes.
                    </p>
                    <p>
                      <strong>When to use which:</strong> Use Condorcet when finding the option with the widest 
                      consensus matters most. Use IRV when the process should mirror familiar Australian 
                      preferential voting.
                    </p>
                  </div>
                </div>

                <p className="text-sm text-gray-500 mt-4">
                  <strong>Best for:</strong> Finding the option with the broadest consensus. Particularly good 
                  for policy decisions where the &quot;least objectionable&quot; choice may be more important than 
                  the most passionately supported one.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Privacy & Security */}
        <section className="mb-16">
          <h3 className="text-2xl font-bold text-gray-900 mb-8 pb-3 border-b-2 border-primary">
            Privacy &amp; Security
          </h3>

          <div className="grid gap-6 md:grid-cols-2">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <h4 className="text-lg font-semibold text-gray-900 mb-2">Anonymous Voting</h4>
              <p className="text-gray-600 text-sm">
                Your vote is stored separately from your identity. The system records 
                <em> that</em> you voted (to prevent double-voting) but cannot link your 
                identity to <em>how</em> you voted. Not even administrators can see 
                individual votes.
              </p>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <h4 className="text-lg font-semibold text-gray-900 mb-2">One Elector, One Vote</h4>
              <p className="text-gray-600 text-sm">
                Only verified electors on the electoral roll can vote. Each elector can only 
                vote once per election, enforced at the database level. Email verification 
                codes expire after 10 minutes and are limited to 3 per hour.
              </p>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
              </div>
              <h4 className="text-lg font-semibold text-gray-900 mb-2">Verifiable Results</h4>
              <p className="text-gray-600 text-sm">
                After voting, you receive a unique receipt code. You can use this to confirm 
                your vote was counted in the final tally without revealing your choices to anyone.
              </p>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                </svg>
              </div>
              <h4 className="text-lg font-semibold text-gray-900 mb-2">Open Source</h4>
              <p className="text-gray-600 text-sm mb-3">
                The entire platform is open source. Any elector can inspect the code to 
                verify that it works correctly and that votes are handled securely. 
                Transparency builds trust.
              </p>
              <a 
                href="https://github.com/votekitorg/votekit" 
                target="_blank" 
                rel="noopener noreferrer"
                className="inline-flex items-center text-sm text-primary hover:text-primary-dark font-medium"
              >
                <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                </svg>
                View source code on GitHub
              </a>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="mb-16">
          <h3 className="text-2xl font-bold text-gray-900 mb-8 pb-3 border-b-2 border-primary">
            Frequently Asked Questions
          </h3>

          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h4 className="font-semibold text-gray-900 mb-2">Can anyone vote?</h4>
              <p className="text-gray-600 text-sm">
                No. Only electors whose email or phone number is on the verified electoral roll can vote. 
                Your identity is confirmed via email or SMS verification each time you vote.
              </p>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h4 className="font-semibold text-gray-900 mb-2">Can I change my vote after submitting?</h4>
              <p className="text-gray-600 text-sm">
                No. Once your vote is submitted, it cannot be changed or withdrawn. This is why 
                you&apos;re shown a review screen before final submission. Take your time to make sure 
                you&apos;re happy with your choices.
              </p>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h4 className="font-semibold text-gray-900 mb-2">Can administrators see how I voted?</h4>
              <p className="text-gray-600 text-sm">
                No. The system is designed so that your identity (that you voted) is stored 
                separately from your actual vote. There is no technical way for anyone -- including 
                administrators or developers -- to link a specific vote to a specific elector.
              </p>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h4 className="font-semibold text-gray-900 mb-2">When can I see the results?</h4>
              <p className="text-gray-600 text-sm">
                Results are only published after the voting period closes. This prevents any 
                influence from partial results on electors who haven&apos;t yet voted.
              </p>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h4 className="font-semibold text-gray-900 mb-2">What is my receipt code for?</h4>
              <p className="text-gray-600 text-sm">
                Your receipt code is proof that your vote was recorded. After results are published, 
                you can verify that a vote with your receipt code exists in the final count. It 
                doesn&apos;t reveal how you voted -- it just confirms your vote was included.
              </p>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h4 className="font-semibold text-gray-900 mb-2">Are these elections binding?</h4>
              <p className="text-gray-600 text-sm">
                That depends on the organisation running the election. Each election description 
                will state whether it is binding or advisory. The platform itself is simply a tool 
                for conducting secure, transparent votes.
              </p>
            </div>
          </div>
        </section>

        {/* CTA */}
        <div className="text-center bg-white rounded-xl shadow-sm border border-gray-200 p-8">
          <h3 className="text-2xl font-bold text-gray-900 mb-3">Ready to participate?</h3>
          <p className="text-gray-600 mb-6">
            Check the home page for any active elections, or wait for a voting link to be shared with you.
          </p>
          <Link
            href="/"
            className="inline-flex items-center px-6 py-3 bg-primary text-white font-medium rounded-lg hover:bg-primary-dark transition-colors"
          >
            View Active Plebiscites
          </Link>
        </div>
      </main>

      <footer className="bg-white border-t border-gray-200 py-8 mt-12">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-sm text-gray-600">&copy; {new Date().getFullYear()} VoteKit Election Platform. Secure, transparent, democratic.</p>
        </div>
      </footer>
    </div>
  );
}
