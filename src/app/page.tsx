import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center mr-3">
                <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/>
                </svg>
              </div>
              <h1 className="text-2xl font-bold text-gray-900">VoteKit</h1>
            </div>
            <nav className="flex items-center space-x-8">
              <Link 
                href="/about"
                className="text-sm font-medium text-gray-700 hover:text-primary transition-colors"
              >
                How It Works
              </Link>
              <Link 
                href="https://github.com/votekitorg/votekit"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium text-gray-700 hover:text-primary transition-colors"
              >
                GitHub
              </Link>
              <Link 
                href="/admin"
                className="inline-flex items-center px-4 py-2 border border-primary text-sm font-medium rounded-md text-primary bg-white hover:bg-primary hover:text-white transition-colors"
              >
                Admin Login
              </Link>
            </nav>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative bg-white pt-16 pb-20 px-4 sm:px-6 lg:pt-24 lg:pb-28 lg:px-8">
        <div className="relative max-w-7xl mx-auto">
          <div className="text-center">
            <h1 className="text-4xl tracking-tight font-extrabold text-gray-900 sm:text-5xl md:text-6xl">
              <span className="block xl:inline">Free, Open-Source</span>
              <span className="block text-primary xl:inline"> Elections for Everyone</span>
            </h1>
            <p className="mt-3 max-w-md mx-auto text-base text-gray-500 sm:text-lg md:mt-5 md:text-xl md:max-w-3xl">
              Secure, anonymous voting platform for unions, political parties, NGOs, and community organizations. Self-hosted, transparent, and completely free.
            </p>
            <div className="mt-5 max-w-md mx-auto sm:flex sm:justify-center md:mt-8">
              <div className="rounded-md shadow">
                <Link
                  href="https://github.com/votekitorg/votekit"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full flex items-center justify-center px-8 py-3 border border-transparent text-base font-medium rounded-md text-white bg-primary hover:bg-primary-dark md:py-4 md:text-lg md:px-10"
                >
                  Get Started
                </Link>
              </div>
              <div className="mt-3 rounded-md shadow sm:mt-0 sm:ml-3">
                <Link
                  href="/admin"
                  className="w-full flex items-center justify-center px-8 py-3 border border-transparent text-base font-medium rounded-md text-primary bg-white hover:bg-gray-50 border-primary md:py-4 md:text-lg md:px-10"
                >
                  Admin Login
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-16 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="lg:text-center">
            <h2 className="text-base text-primary font-semibold tracking-wide uppercase">Features</h2>
            <p className="mt-2 text-3xl leading-8 font-extrabold tracking-tight text-gray-900 sm:text-4xl">
              Everything you need for secure elections
            </p>
            <p className="mt-4 max-w-2xl text-xl text-gray-500 lg:mx-auto">
              Professional-grade election platform with multiple voting methods and robust security.
            </p>
          </div>

          <div className="mt-16">
            <dl className="space-y-10 md:space-y-0 md:grid md:grid-cols-2 lg:grid-cols-3 md:gap-x-8 md:gap-y-10">
              <div className="relative">
                <dt>
                  <div className="absolute flex items-center justify-center h-12 w-12 rounded-md bg-primary text-white">
                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                    </svg>
                  </div>
                  <p className="ml-16 text-lg leading-6 font-medium text-gray-900">Multiple Voting Methods</p>
                </dt>
                <dd className="mt-2 ml-16 text-base text-gray-500">
                  Yes/No questions, Multiple Choice, Ranked Choice (IRV), and Condorcet methods supported.
                </dd>
              </div>

              <div className="relative">
                <dt>
                  <div className="absolute flex items-center justify-center h-12 w-12 rounded-md bg-primary text-white">
                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <p className="ml-16 text-lg leading-6 font-medium text-gray-900">Verify by Email or SMS</p>
                </dt>
                <dd className="mt-2 ml-16 text-base text-gray-500">
                  Electors verify their identity via email verification codes or SMS through Firebase integration.
                </dd>
              </div>

              <div className="relative">
                <dt>
                  <div className="absolute flex items-center justify-center h-12 w-12 rounded-md bg-primary text-white">
                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.818-4.077a7.5 7.5 0 11-9.636 9.636l2.44-2.44M3 3l18 18" />
                    </svg>
                  </div>
                  <p className="ml-16 text-lg leading-6 font-medium text-gray-900">Anonymous & Verifiable</p>
                </dt>
                <dd className="mt-2 ml-16 text-base text-gray-500">
                  Votes are completely anonymous, but electors receive receipt codes to verify their vote was counted.
                </dd>
              </div>

              <div className="relative">
                <dt>
                  <div className="absolute flex items-center justify-center h-12 w-12 rounded-md bg-primary text-white">
                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2" />
                    </svg>
                  </div>
                  <p className="ml-16 text-lg leading-6 font-medium text-gray-900">Self-Hosted</p>
                </dt>
                <dd className="mt-2 ml-16 text-base text-gray-500">
                  Run it on your own server. Your election data stays completely under your control.
                </dd>
              </div>

              <div className="relative">
                <dt>
                  <div className="absolute flex items-center justify-center h-12 w-12 rounded-md bg-primary text-white">
                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                    </svg>
                  </div>
                  <p className="ml-16 text-lg leading-6 font-medium text-gray-900">Open Source</p>
                </dt>
                <dd className="mt-2 ml-16 text-base text-gray-500">
                  Fully transparent codebase. Anyone can audit the code to ensure security and integrity.
                </dd>
              </div>

              <div className="relative">
                <dt>
                  <div className="absolute flex items-center justify-center h-12 w-12 rounded-md bg-primary text-white">
                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
                    </svg>
                  </div>
                  <p className="ml-16 text-lg leading-6 font-medium text-gray-900">Free Forever</p>
                </dt>
                <dd className="mt-2 ml-16 text-base text-gray-500">
                  No per-election fees. No premium tiers. No hidden costs. Completely free to use.
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </section>

      {/* Use Cases Section */}
      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="lg:text-center">
            <h2 className="text-base text-primary font-semibold tracking-wide uppercase">Use Cases</h2>
            <p className="mt-2 text-3xl leading-8 font-extrabold tracking-tight text-gray-900 sm:text-4xl">
              Perfect for any democratic process
            </p>
          </div>

          <div className="mt-16 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
            <div className="pt-6">
              <div className="flow-root bg-gray-50 rounded-lg px-6 pb-8">
                <div className="-mt-6">
                  <div>
                    <span className="inline-flex items-center justify-center p-3 bg-primary rounded-md shadow-lg">
                      <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                      </svg>
                    </span>
                  </div>
                  <h3 className="mt-8 text-lg font-medium text-gray-900 tracking-tight">Union Elections</h3>
                  <p className="mt-5 text-base text-gray-500">
                    Executive elections, strike votes, and membership ballots for trade unions and labor organizations.
                  </p>
                </div>
              </div>
            </div>

            <div className="pt-6">
              <div className="flow-root bg-gray-50 rounded-lg px-6 pb-8">
                <div className="-mt-6">
                  <div>
                    <span className="inline-flex items-center justify-center p-3 bg-primary rounded-md shadow-lg">
                      <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                      </svg>
                    </span>
                  </div>
                  <h3 className="mt-8 text-lg font-medium text-gray-900 tracking-tight">Political Party Decisions</h3>
                  <p className="mt-5 text-base text-gray-500">
                    Leadership elections, policy plebiscites, and candidate selections for political parties.
                  </p>
                </div>
              </div>
            </div>

            <div className="pt-6">
              <div className="flow-root bg-gray-50 rounded-lg px-6 pb-8">
                <div className="-mt-6">
                  <div>
                    <span className="inline-flex items-center justify-center p-3 bg-primary rounded-md shadow-lg">
                      <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                      </svg>
                    </span>
                  </div>
                  <h3 className="mt-8 text-lg font-medium text-gray-900 tracking-tight">Board Governance</h3>
                  <p className="mt-5 text-base text-gray-500">
                    Board elections, AGM resolutions, and governance decisions for corporations and nonprofits.
                  </p>
                </div>
              </div>
            </div>

            <div className="pt-6">
              <div className="flow-root bg-gray-50 rounded-lg px-6 pb-8">
                <div className="-mt-6">
                  <div>
                    <span className="inline-flex items-center justify-center p-3 bg-primary rounded-md shadow-lg">
                      <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
                      </svg>
                    </span>
                  </div>
                  <h3 className="mt-8 text-lg font-medium text-gray-900 tracking-tight">Community Organizations</h3>
                  <p className="mt-5 text-base text-gray-500">
                    Resident committees, community groups, and local organization decision-making processes.
                  </p>
                </div>
              </div>
            </div>

            <div className="pt-6">
              <div className="flow-root bg-gray-50 rounded-lg px-6 pb-8">
                <div className="-mt-6">
                  <div>
                    <span className="inline-flex items-center justify-center p-3 bg-primary rounded-md shadow-lg">
                      <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </span>
                  </div>
                  <h3 className="mt-8 text-lg font-medium text-gray-900 tracking-tight">NGO & Nonprofits</h3>
                  <p className="mt-5 text-base text-gray-500">
                    Board elections, member surveys, and policy decisions for NGOs and nonprofit organizations.
                  </p>
                </div>
              </div>
            </div>

            <div className="pt-6">
              <div className="flow-root bg-gray-50 rounded-lg px-6 pb-8">
                <div className="-mt-6">
                  <div>
                    <span className="inline-flex items-center justify-center p-3 bg-primary rounded-md shadow-lg">
                      <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                    </span>
                  </div>
                  <h3 className="mt-8 text-lg font-medium text-gray-900 tracking-tight">Private Elections</h3>
                  <p className="mt-5 text-base text-gray-500">
                    Any group needing secure, anonymous voting without relying on external services or authorities.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="py-16 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="lg:text-center">
            <h2 className="text-base text-primary font-semibold tracking-wide uppercase">How It Works</h2>
            <p className="mt-2 text-3xl leading-8 font-extrabold tracking-tight text-gray-900 sm:text-4xl">
              Simple election process
            </p>
            <p className="mt-4 max-w-2xl text-xl text-gray-500 lg:mx-auto">
              Five easy steps from setup to results
            </p>
          </div>

          <div className="mt-16">
            <div className="space-y-8 lg:space-y-0 lg:grid lg:grid-cols-5 lg:gap-8">
              <div className="text-center">
                <div className="flex items-center justify-center w-16 h-16 mx-auto bg-primary rounded-full">
                  <span className="text-xl font-bold text-white">1</span>
                </div>
                <h3 className="mt-6 text-lg font-medium text-gray-900">Create Election</h3>
                <p className="mt-2 text-base text-gray-500">
                  Admin creates an election with questions and voting options
                </p>
              </div>

              <div className="text-center">
                <div className="flex items-center justify-center w-16 h-16 mx-auto bg-primary rounded-full">
                  <span className="text-xl font-bold text-white">2</span>
                </div>
                <h3 className="mt-6 text-lg font-medium text-gray-900">Upload Voter Roll</h3>
                <p className="mt-2 text-base text-gray-500">
                  Upload list of eligible voters with email addresses or phone numbers
                </p>
              </div>

              <div className="text-center">
                <div className="flex items-center justify-center w-16 h-16 mx-auto bg-primary rounded-full">
                  <span className="text-xl font-bold text-white">3</span>
                </div>
                <h3 className="mt-6 text-lg font-medium text-gray-900">Send Ballot Links</h3>
                <p className="mt-2 text-base text-gray-500">
                  System automatically sends unique ballot links to all electors
                </p>
              </div>

              <div className="text-center">
                <div className="flex items-center justify-center w-16 h-16 mx-auto bg-primary rounded-full">
                  <span className="text-xl font-bold text-white">4</span>
                </div>
                <h3 className="mt-6 text-lg font-medium text-gray-900">Verify & Vote</h3>
                <p className="mt-2 text-base text-gray-500">
                  Electors verify their identity and cast their votes securely
                </p>
              </div>

              <div className="text-center">
                <div className="flex items-center justify-center w-16 h-16 mx-auto bg-primary rounded-full">
                  <span className="text-xl font-bold text-white">5</span>
                </div>
                <h3 className="mt-6 text-lg font-medium text-gray-900">Results Published</h3>
                <p className="mt-2 text-base text-gray-500">
                  Results are automatically published when the election closes
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Self-Host Section */}
      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="lg:text-center">
            <h2 className="text-base text-primary font-semibold tracking-wide uppercase">Self-Hosted</h2>
            <p className="mt-2 text-3xl leading-8 font-extrabold tracking-tight text-gray-900 sm:text-4xl">
              Deploy in 5 minutes
            </p>
            <p className="mt-4 max-w-2xl text-xl text-gray-500 lg:mx-auto">
              Run VoteKit on your own server with Docker. Lightweight enough for any hardware.
            </p>
          </div>

          <div className="mt-16 max-w-3xl mx-auto">
            <div className="bg-gray-900 rounded-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex space-x-2">
                  <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                  <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                  <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                </div>
                <span className="text-gray-400 text-sm font-mono">terminal</span>
              </div>
              <div className="font-mono text-sm">
                <div className="text-green-400">$ git clone https://github.com/votekitorg/votekit.git</div>
                <div className="text-green-400">$ cd votekit</div>
                <div className="text-green-400">$ docker compose up -d</div>
                <div className="text-gray-400 mt-2">
                  Creating votekit_db_1 ... done<br/>
                  Creating votekit_web_1 ... done<br/>
                  <span className="text-white">VoteKit is now running at http://localhost:3000</span>
                </div>
              </div>
            </div>

            <div className="mt-8 text-center">
              <Link
                href="https://github.com/votekitorg/votekit"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-gray-900 hover:bg-gray-800"
              >
                <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 24 24">
                  <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd"/>
                </svg>
                View on GitHub
              </Link>
            </div>
          </div>
        </div>
      </section>


      {/* Privacy & Anonymous Use Section */}
      <section className="py-16 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="lg:text-center mb-12">
            <h2 className="text-base text-primary font-semibold tracking-wide uppercase">Privacy by Design</h2>
            <p className="mt-2 text-3xl leading-8 font-extrabold tracking-tight text-gray-900 sm:text-4xl">
              Run Elections Without a Trace
            </p>
            <p className="mt-4 max-w-3xl text-xl text-gray-500 lg:mx-auto">
              VoteKit is built for situations where privacy is not just preferred -- it is essential.
              Whether you are organising a union ballot under hostile management, running an internal party vote,
              or conducting any election where participants need protection, VoteKit gives you complete control.
            </p>
          </div>

          <div className="max-w-4xl mx-auto">
            {/* Run From Anywhere */}
            <div className="mb-12">
              <h3 className="text-xl font-bold text-gray-900 mb-4">Run It From Your Laptop</h3>
              <p className="text-gray-600 mb-4">
                VoteKit does not require a cloud server. You can run it from a personal laptop, a desktop computer,
                or even a Raspberry Pi. Start it up, conduct your election, and shut it down. No server rental,
                no account registration, no payment trail.
              </p>
              <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-3">
                <div className="flex items-start">
                  <svg className="flex-shrink-0 h-5 w-5 text-primary mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <p className="ml-3 text-gray-700">Run on your own machine -- laptop, desktop, or single-board computer</p>
                </div>
                <div className="flex items-start">
                  <svg className="flex-shrink-0 h-5 w-5 text-primary mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <p className="ml-3 text-gray-700">Share on a local network for in-person voting without internet access</p>
                </div>
                <div className="flex items-start">
                  <svg className="flex-shrink-0 h-5 w-5 text-primary mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <p className="ml-3 text-gray-700">Use a temporary tunnel (like ngrok or Cloudflare Tunnel) to make it accessible remotely without renting a server</p>
                </div>
                <div className="flex items-start">
                  <svg className="flex-shrink-0 h-5 w-5 text-primary mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <p className="ml-3 text-gray-700">Shut it down when the election is over. Delete the database. No residual data anywhere.</p>
                </div>
              </div>
            </div>

            {/* No Third-Party Dependencies */}
            <div className="mb-12">
              <h3 className="text-xl font-bold text-gray-900 mb-4">No Third-Party Dependencies Required</h3>
              <p className="text-gray-600 mb-4">
                VoteKit works entirely offline if needed. Email and SMS verification are optional features --
                you can run a fully functional election using only unique ballot links sent through
                any communication channel you trust: encrypted messaging apps, printed QR codes,
                or hand-delivered letters.
              </p>
              <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-3">
                <div className="flex items-start">
                  <svg className="flex-shrink-0 h-5 w-5 text-primary mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <p className="ml-3 text-gray-700">No Google, Amazon, or Microsoft accounts needed to operate</p>
                </div>
                <div className="flex items-start">
                  <svg className="flex-shrink-0 h-5 w-5 text-primary mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <p className="ml-3 text-gray-700">SQLite database stored locally -- no cloud database service required</p>
                </div>
                <div className="flex items-start">
                  <svg className="flex-shrink-0 h-5 w-5 text-primary mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <p className="ml-3 text-gray-700">Unique ballot links can be distributed through any channel -- Signal, WhatsApp, printed paper, or in person</p>
                </div>
                <div className="flex items-start">
                  <svg className="flex-shrink-0 h-5 w-5 text-primary mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <p className="ml-3 text-gray-700">Works behind a VPN, on Tor, or on a completely air-gapped network</p>
                </div>
              </div>
            </div>

            {/* What VoteKit Does NOT Collect */}
            <div className="mb-12">
              <h3 className="text-xl font-bold text-gray-900 mb-4">What VoteKit Does NOT Collect</h3>
              <p className="text-gray-600 mb-4">
                Commercial voting platforms store your data on their servers, often in jurisdictions
                you cannot control. VoteKit is different. When you self-host, you control every byte of data.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center mb-2">
                    <svg className="h-5 w-5 text-red-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    <span className="font-medium text-gray-900">No analytics or tracking</span>
                  </div>
                  <p className="text-sm text-gray-600">No Google Analytics, no cookies beyond session auth, no tracking pixels</p>
                </div>
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center mb-2">
                    <svg className="h-5 w-5 text-red-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    <span className="font-medium text-gray-900">No IP address logging</span>
                  </div>
                  <p className="text-sm text-gray-600">VoteKit does not log voter IP addresses or browser fingerprints</p>
                </div>
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center mb-2">
                    <svg className="h-5 w-5 text-red-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    <span className="font-medium text-gray-900">No vote-to-voter link</span>
                  </div>
                  <p className="text-sm text-gray-600">Ballots are cryptographically separated from voter identity. Even the admin cannot link a vote to a person.</p>
                </div>
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center mb-2">
                    <svg className="h-5 w-5 text-red-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    <span className="font-medium text-gray-900">No external data transmission</span>
                  </div>
                  <p className="text-sm text-gray-600">Unless you enable optional email/SMS, VoteKit sends zero data to external services</p>
                </div>
              </div>
            </div>

            {/* Use Cases for Anonymous Operation */}
            <div className="mb-12">
              <h3 className="text-xl font-bold text-gray-900 mb-4">Built For Those Who Need It Most</h3>
              <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-200">
                <div className="p-5">
                  <h4 className="font-medium text-gray-900">Union Organising</h4>
                  <p className="mt-1 text-gray-600">
                    Run strike ballots or leadership elections without employer surveillance.
                    Distribute ballot links via encrypted messaging. No paper trail linking organisers to the platform.
                  </p>
                </div>
                <div className="p-5">
                  <h4 className="font-medium text-gray-900">Whistleblower Votes</h4>
                  <p className="mt-1 text-gray-600">
                    Conduct anonymous votes on whether to escalate concerns, file complaints, or take collective action.
                    Participants cannot be identified through the voting platform.
                  </p>
                </div>
                <div className="p-5">
                  <h4 className="font-medium text-gray-900">Political Movements</h4>
                  <p className="mt-1 text-gray-600">
                    Run internal party plebiscites or policy votes in environments where political activity is monitored.
                    Self-host behind a VPN or Tor hidden service for maximum protection.
                  </p>
                </div>
                <div className="p-5">
                  <h4 className="font-medium text-gray-900">Sensitive Board Decisions</h4>
                  <p className="mt-1 text-gray-600">
                    Conduct anonymous votes on contentious matters -- leadership challenges, misconduct investigations,
                    or strategic decisions -- without revealing individual positions.
                  </p>
                </div>
              </div>
            </div>

            {/* Operational Security Tips */}
            <div>
              <h3 className="text-xl font-bold text-gray-900 mb-4">Operational Security Tips</h3>
              <p className="text-gray-600 mb-4">
                For maximum anonymity, consider these practices when running a VoteKit election:
              </p>
              <div className="bg-gray-900 text-gray-300 rounded-lg p-6 space-y-4 text-sm">
                <div>
                  <span className="text-white font-medium">1. Use a clean machine.</span>
                  <span className="ml-1">Run VoteKit from a fresh installation or a live USB operating system like Tails.</span>
                </div>
                <div>
                  <span className="text-white font-medium">2. Distribute links securely.</span>
                  <span className="ml-1">Send unique ballot links via Signal, Session, or another end-to-end encrypted messenger. Avoid email if surveillance is a concern.</span>
                </div>
                <div>
                  <span className="text-white font-medium">3. Use Tor or a VPN.</span>
                  <span className="ml-1">Run VoteKit as a Tor hidden service (.onion address) so neither the server nor the voters reveal their IP addresses.</span>
                </div>
                <div>
                  <span className="text-white font-medium">4. Skip email and SMS verification.</span>
                  <span className="ml-1">Use unique ballot links instead. This avoids any dependency on third-party services (Resend, Firebase) that could log activity.</span>
                </div>
                <div>
                  <span className="text-white font-medium">5. Delete after use.</span>
                  <span className="ml-1">Export results, then delete the database and shut down the server. VoteKit stores everything in a single SQLite file -- delete it and the data is gone.</span>
                </div>
                <div>
                  <span className="text-white font-medium">6. Verify the code.</span>
                  <span className="ml-1">VoteKit is open source. Before running it, review the code yourself or have someone you trust audit it. The entire codebase is public on GitHub.</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900">
        <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:py-16 lg:px-8">
          <div className="xl:grid xl:grid-cols-3 xl:gap-8">
            <div className="grid grid-cols-2 gap-8 xl:col-span-2">
              <div className="md:grid md:grid-cols-2 md:gap-8">
                <div>
                  <h3 className="text-sm font-semibold text-gray-400 tracking-wider uppercase">Platform</h3>
                  <ul className="mt-4 space-y-4">
                    <li>
                      <Link href="https://github.com/votekitorg/votekit" target="_blank" rel="noopener noreferrer" className="text-base text-gray-300 hover:text-white">
                        GitHub
                      </Link>
                    </li>
                    <li>
                      <Link href="/about" className="text-base text-gray-300 hover:text-white">
                        How It Works
                      </Link>
                    </li>
                    <li>
                      <Link href="/admin" className="text-base text-gray-300 hover:text-white">
                        Admin
                      </Link>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
            <div className="mt-8 xl:mt-0">
              <h3 className="text-sm font-semibold text-gray-400 tracking-wider uppercase">About</h3>
              <p className="mt-4 text-base text-gray-300">
                VoteKit is open source software. No tracking. No ads. No data collection.
              </p>
              <p className="mt-4 text-sm text-gray-400">
                © 2024 VoteKit Election Platform. Licensed under MIT.
              </p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
