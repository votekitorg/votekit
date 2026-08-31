import { notFound } from 'next/navigation';
import LinkifiedText from '@/components/LinkifiedText';
import db from '@/lib/db';
import { parseElectionCloseDate } from '@/lib/election-window';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Election proof | VoteKit', robots: { index: false, follow: false } };

function formatDate(value: unknown): string {
  if (typeof value !== 'string' || !value) return 'Not set';
  const date = parseElectionCloseDate(value);
  if (Number.isNaN(date.getTime())) return 'Not set';
  return date.toLocaleString('en-AU', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Australia/Brisbane' });
}

function methodLabel(question: any): string {
  if (question.type === 'yes_no') return 'Yes / No';
  if (question.type === 'multiple_choice') return 'Choose one';
  if (question.type === 'ranked_choice') return 'Ranked choice (IRV)';
  if (question.type === 'condorcet') return 'Ranked choice (Condorcet)';
  return 'Voting question';
}

export default async function ElectionProofPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{32}$/.test(token)) notFound();
  const row = db.prepare(`
    SELECT title, payload_json, updated_at
    FROM election_setup_drafts
    WHERE proof_token = ?
  `).get(token) as any;
  if (!row) notFound();

  let payload: any;
  try {
    payload = JSON.parse(row.payload_json);
  } catch {
    notFound();
  }
  const formData = payload?.formData || {};
  const questions = Array.isArray(payload?.questions) ? payload.questions : [];

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-10">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-blue-950">
          <div className="font-semibold">Private proofing copy</div>
          <p className="mt-1 text-sm">This read-only page is an unpublished setup draft. Voting is disabled. Anyone with this link can review it.</p>
        </div>

        <section className="card">
          <div className="card-body space-y-4">
            <div>
              <div className="text-sm font-medium uppercase tracking-wide text-gray-500">Election proof</div>
              <h1 className="mt-1 text-3xl font-bold text-gray-900">{formData.title?.trim() || 'Untitled election'}</h1>
            </div>
            <div className="whitespace-pre-wrap text-gray-700">
              {formData.description?.trim()
                ? <LinkifiedText text={formData.description} />
                : <span className="italic text-gray-500">No description added yet.</span>}
            </div>
            {formData.info_url && (
              <a href={formData.info_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                Additional information
              </a>
            )}
            <dl className="grid gap-3 border-t border-gray-200 pt-4 text-sm sm:grid-cols-2">
              <div><dt className="font-medium text-gray-500">Voter access</dt><dd className="text-gray-900">{formData.access_mode === 'anonymous_codes' ? 'Anonymous codes and links' : 'Registered voters'}</dd></div>
              <div><dt className="font-medium text-gray-500">Final results</dt><dd className="text-gray-900">{formData.results_visibility === 'public' ? 'Anyone with the results link' : 'Eligible voters only (verification required)'}</dd></div>
              <div><dt className="font-medium text-gray-500">Opening</dt><dd className="text-gray-900">{formData.opening_mode === 'scheduled' ? formatDate(formData.open_date) : 'Manually, when setup is complete'}</dd></div>
              <div><dt className="font-medium text-gray-500">Closing</dt><dd className="text-gray-900">{formatDate(formData.close_date)}</dd></div>
              <div><dt className="font-medium text-gray-500">Questions</dt><dd className="text-gray-900">{questions.length}</dd></div>
            </dl>
          </div>
        </section>

        {questions.length === 0 ? (
          <section className="card"><div className="card-body text-center text-gray-500">No questions added yet.</div></section>
        ) : questions.map((question: any, index: number) => (
          <section className="card" key={index}>
            <div className="card-header">
              <div className="text-xs font-semibold uppercase tracking-wide text-primary">{methodLabel(question)}</div>
              <h2 className="mt-1 text-xl font-semibold text-gray-900">{index + 1}. {question.title || 'Untitled question'}</h2>
              {question.description && <p className="mt-2 text-sm text-gray-600">{question.description}</p>}
            </div>
            <div className="card-body space-y-3">
              {question.type === 'ranked_choice' && question.continueAfterMajority === true && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                  After the official winner is declared, preferences continue to a final-two distribution for reporting only.
                </div>
              )}
              {(Array.isArray(question.options) ? question.options : []).map((option: string, optionIndex: number) => (
                <div key={optionIndex} className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full border border-gray-400 text-xs text-gray-500">
                    {question.type === 'ranked_choice' || question.type === 'condorcet' ? optionIndex + 1 : ''}
                  </span>
                  <span className="text-gray-900">{option || `Option ${optionIndex + 1}`}</span>
                </div>
              ))}
            </div>
          </section>
        ))}

        <p className="text-center text-xs text-gray-500">Last autosaved {new Date(`${row.updated_at.replace(' ', 'T')}Z`).toLocaleString('en-AU', { timeZone: 'Australia/Brisbane' })}</p>
      </div>
    </main>
  );
}
