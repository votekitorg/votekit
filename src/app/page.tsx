import Link from 'next/link';

function BrandMark({ className = 'h-9 w-9' }: { className?: string }) {
  return (
    <span className={`${className} inline-flex items-center justify-center rounded-xl bg-[#078348] text-white shadow-sm`}>
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M7.5 4.75h9a1.75 1.75 0 0 1 1.75 1.75v11a1.75 1.75 0 0 1-1.75 1.75h-9a1.75 1.75 0 0 1-1.75-1.75v-11A1.75 1.75 0 0 1 7.5 4.75Z" stroke="currentColor" strokeWidth="1.7" />
        <path d="m8.75 11.6 2.05 2.05 4.55-4.7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

function CheckIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="m6.75 12.25 3.35 3.35 7.15-7.2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const capabilities = [
  {
    title: 'Ballot privacy',
    description: 'Voter identities and ballot choices are kept separate, protecting the secrecy of every vote.',
    icon: (
      <path d="M8.25 10V7.75a3.75 3.75 0 0 1 7.5 0V10m-9 0h10.5a1.5 1.5 0 0 1 1.5 1.5v7a1.5 1.5 0 0 1-1.5 1.5H6.75a1.5 1.5 0 0 1-1.5-1.5v-7a1.5 1.5 0 0 1 1.5-1.5Z" />
    ),
  },
  {
    title: 'Controlled participation',
    description: 'Only eligible members can vote, with secure invitations and safeguards against duplicate ballots.',
    icon: (
      <path d="M8.5 11a3.25 3.25 0 1 0 0-6.5 3.25 3.25 0 0 0 0 6.5Zm7.25-.75a2.5 2.5 0 1 0 0-5m-13 14.25v-1.25A4.25 4.25 0 0 1 7 14h3a4.25 4.25 0 0 1 4.25 4.25v1.25m2-5.25a4.25 4.25 0 0 1 5 4.18v1.07" />
    ),
  },
  {
    title: 'Verifiable outcomes',
    description: 'Receipt codes and clear audit records build confidence without revealing how anyone voted.',
    icon: (
      <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-3.75-8.8 2.4 2.4 5.1-5.2" />
    ),
  },
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[#f7f8f6] text-[#15231c]">
      <header className="border-b border-[#dfe5e0] bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-5 sm:px-8 lg:px-10">
          <Link href="/" className="flex items-center gap-3" aria-label="VoteKit home">
            <BrandMark />
            <span className="text-xl font-bold tracking-[-0.025em] text-[#142019]">VoteKit</span>
          </Link>

          <nav className="flex items-center gap-3 sm:gap-8" aria-label="Main navigation">
            <Link href="/about" className="hidden text-sm font-medium text-[#536159] transition-colors hover:text-[#078348] sm:block">
              How it works
            </Link>
            <Link href="/admin" className="rounded-lg border border-[#cfd8d1] bg-white px-4 py-2.5 text-sm font-semibold text-[#223229] shadow-sm transition hover:border-[#078348] hover:text-[#078348]">
              Secure sign in
            </Link>
          </nav>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden border-b border-[#dfe5e0] bg-[#f7f8f6]">
          <div className="absolute -right-32 -top-48 h-[560px] w-[560px] rounded-full bg-[#dff2e7] blur-3xl" aria-hidden="true" />
          <div className="absolute -bottom-64 left-[28%] h-[480px] w-[480px] rounded-full bg-white blur-3xl" aria-hidden="true" />

          <div className="relative mx-auto grid max-w-7xl items-center gap-16 px-5 py-20 sm:px-8 sm:py-24 lg:grid-cols-[1.08fr_0.92fr] lg:px-10 lg:py-28">
            <div>
              <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-[#bad9c7] bg-[#edf8f1] px-3.5 py-1.5 text-sm font-semibold text-[#086a3d]">
                <span className="h-2 w-2 rounded-full bg-[#078348]" />
                Secure elections for member organisations
              </div>
              <h1 className="max-w-3xl text-5xl font-bold leading-[1.04] tracking-[-0.045em] text-[#102019] sm:text-6xl lg:text-[4.6rem]">
                Decisions your members can trust.
              </h1>
              <p className="mt-7 max-w-2xl text-lg leading-8 text-[#536159] sm:text-xl">
                VoteKit gives associations, unions and member-based organisations a clear, private and accountable way to run elections online.
              </p>

              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <Link href="/about" className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#078348] px-6 py-3.5 text-base font-semibold text-white shadow-[0_8px_24px_rgba(7,131,72,0.22)] transition hover:bg-[#066d3d]">
                  See how VoteKit works
                  <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                    <path d="m7.5 4.5 5.5 5.5-5.5 5.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </Link>
                <Link href="/admin" className="inline-flex items-center justify-center rounded-xl border border-[#cfd8d1] bg-white px-6 py-3.5 text-base font-semibold text-[#26372e] shadow-sm transition hover:border-[#9db7a7] hover:bg-[#fbfcfb]">
                  Manage an election
                </Link>
              </div>

              <div className="mt-9 flex flex-wrap gap-x-6 gap-y-3 text-sm font-medium text-[#526158]">
                {['Anonymous ballots', 'Auditable records', 'Controlled access'].map(item => (
                  <span key={item} className="flex items-center gap-2">
                    <span className="text-[#078348]"><CheckIcon /></span>
                    {item}
                  </span>
                ))}
              </div>
            </div>

            <div className="relative mx-auto w-full max-w-lg lg:mx-0 lg:justify-self-end">
              <div className="absolute -inset-5 rounded-[2.25rem] border border-[#c9e5d3] bg-[#eaf6ee] rotate-2" aria-hidden="true" />
              <div className="relative overflow-hidden rounded-[1.75rem] border border-[#d6ded8] bg-white shadow-[0_30px_70px_rgba(21,50,34,0.16)]">
                <div className="flex items-center justify-between border-b border-[#e3e8e4] px-6 py-5">
                  <div className="flex items-center gap-3">
                    <BrandMark className="h-8 w-8" />
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#78847d]">Voting portal</p>
                      <p className="mt-0.5 font-semibold text-[#1c2b23]">Your ballot is ready</p>
                    </div>
                  </div>
                  <span className="rounded-full bg-[#e7f6ed] px-3 py-1 text-xs font-bold text-[#087344]">SECURE</span>
                </div>

                <div className="p-6 sm:p-8">
                  <div className="mb-7 flex items-center gap-3 rounded-xl border border-[#d8e7dd] bg-[#f4faf6] p-4">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#dff2e6] text-[#078348]">
                      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path d="M8 10V7.75a4 4 0 0 1 8 0V10m-9.25 0h10.5a1.5 1.5 0 0 1 1.5 1.5v7a1.5 1.5 0 0 1-1.5 1.5H6.75a1.5 1.5 0 0 1-1.5-1.5v-7a1.5 1.5 0 0 1 1.5-1.5Z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                      </svg>
                    </span>
                    <p className="text-sm leading-5 text-[#4c5e54]">Your identity is verified separately from your ballot choices.</p>
                  </div>

                  <p className="text-sm font-semibold text-[#223229]">Select your preferred candidate</p>
                  <div className="mt-4 space-y-3">
                    {['Candidate A', 'Candidate B', 'Candidate C'].map((candidate, index) => (
                      <div key={candidate} className={`flex items-center gap-3 rounded-xl border p-4 ${index === 1 ? 'border-[#078348] bg-[#f0f9f4]' : 'border-[#dfe5e0]'}`}>
                        <span className={`h-5 w-5 rounded-full border-2 ${index === 1 ? 'border-[#078348] bg-[#078348] shadow-[inset_0_0_0_4px_white]' : 'border-[#aeb9b1]'}`} />
                        <span className="text-sm font-medium text-[#35443b]">{candidate}</span>
                      </div>
                    ))}
                  </div>

                  <div className="mt-6 flex items-center justify-between border-t border-[#e7ebe8] pt-5">
                    <span className="text-xs font-medium text-[#78847d]">1 of 3 questions</span>
                    <span className="rounded-lg bg-[#078348] px-5 py-2.5 text-sm font-semibold text-white">Continue</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="bg-white py-20 sm:py-24">
          <div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-10">
            <div className="max-w-2xl">
              <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#078348]">Confidence at every step</p>
              <h2 className="mt-4 text-3xl font-bold tracking-[-0.035em] text-[#142019] sm:text-4xl">Built for elections that matter</h2>
              <p className="mt-5 text-lg leading-8 text-[#5a675f]">From voter eligibility to the final result, VoteKit keeps the process understandable, controlled and defensible.</p>
            </div>

            <div className="mt-12 grid gap-5 md:grid-cols-3">
              {capabilities.map(capability => (
                <article key={capability.title} className="rounded-2xl border border-[#dfe5e0] bg-[#fbfcfb] p-7 transition hover:-translate-y-0.5 hover:border-[#bfd5c7] hover:shadow-lg">
                  <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#e7f5ec] text-[#078348]">
                    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      {capability.icon}
                    </svg>
                  </span>
                  <h3 className="mt-6 text-xl font-bold tracking-[-0.02em] text-[#17261e]">{capability.title}</h3>
                  <p className="mt-3 leading-7 text-[#5b685f]">{capability.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="border-y border-[#dfe5e0] bg-[#10261b] py-20 text-white sm:py-24">
          <div className="mx-auto grid max-w-7xl gap-12 px-5 sm:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:px-10">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#63d397]">Simple for voters</p>
              <h2 className="mt-4 text-3xl font-bold tracking-[-0.035em] sm:text-4xl">No public election directory. No searching around.</h2>
              <p className="mt-5 max-w-xl text-lg leading-8 text-[#b9c8bf]">Eligible voters receive a private, election-specific link from their organisation. That link takes them directly to identity verification and their ballot.</p>
            </div>

            <ol className="grid gap-4 sm:grid-cols-3">
              {[
                ['01', 'Receive', 'Open the secure link sent by your organisation.'],
                ['02', 'Verify', 'Confirm your identity without connecting it to your choices.'],
                ['03', 'Vote', 'Submit your ballot and keep your verification receipt.'],
              ].map(([number, title, description]) => (
                <li key={number} className="rounded-2xl border border-white/10 bg-white/[0.06] p-6">
                  <span className="text-sm font-bold text-[#63d397]">{number}</span>
                  <h3 className="mt-5 text-lg font-bold">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-[#b9c8bf]">{description}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="bg-white py-20 sm:py-24">
          <div className="mx-auto max-w-4xl px-5 text-center sm:px-8">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#e7f5ec] text-[#078348]">
              <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 3.5 19 6v5.25c0 4.25-2.72 7.72-7 9.25-4.28-1.53-7-5-7-9.25V6l7-2.5Zm-3 8.75 2 2 4-4.25" />
              </svg>
            </span>
            <h2 className="mt-6 text-3xl font-bold tracking-[-0.035em] text-[#142019] sm:text-4xl">Governance deserves better than a generic survey tool.</h2>
            <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-[#5b685f]">VoteKit is purpose-built for formal member decisions, with the privacy, access control and accountability those decisions require.</p>
            <Link href="/about" className="mt-8 inline-flex items-center justify-center rounded-xl bg-[#078348] px-6 py-3.5 font-semibold text-white transition hover:bg-[#066d3d]">
              Explore the platform
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
