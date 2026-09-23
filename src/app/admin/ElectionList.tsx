'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { parseElectionCloseDate, votingClosedError } from '@/lib/election-window';
import DraftTakeoverButton from './DraftTakeoverButton';

export interface ElectionListEntry {
  key: string; kind: 'election' | 'setup'; id: number; title: string;
  updatedAt: string; archived: boolean; canManage: boolean;
  slug?: string; status?: 'draft' | 'open' | 'closed'; openDate?: string;
  closeDate?: string; closeState?: string;
  step?: number; proofToken?: string; creator?: string; ownDraft?: boolean;
}

type Stage = 'draft' | 'not-open' | 'open' | 'ended' | 'finalised';
const filters: Array<{ value: 'all' | Stage; label: string }> = [
  { value: 'all', label: 'All' }, { value: 'draft', label: 'Drafts' },
  { value: 'not-open', label: 'Not open' }, { value: 'open', label: 'Open' },
  { value: 'ended', label: 'Awaiting finalisation' }, { value: 'finalised', label: 'Finalised' },
];
const priority: Record<Stage, number> = { ended: 0, open: 1, draft: 2, 'not-open': 3, finalised: 4 };

function stageOf(entry: ElectionListEntry, now: number): Stage {
  if (entry.kind === 'setup') return 'draft';
  if (entry.status === 'closed') return 'finalised';
  if (entry.status === 'draft') return 'not-open';
  return votingClosedError({ close_date: entry.closeDate || '', close_state: entry.closeState }, new Date(now)) ? 'ended' : 'open';
}

function dateLabel(value?: string, utc = false) {
  if (!value) return 'Not set';
  const date = utc && /^\d{4}-\d{2}-\d{2} \d{2}:/.test(value)
    ? new Date(value.replace(' ', 'T') + 'Z') : parseElectionCloseDate(value);
  if (!Number.isFinite(date.getTime())) return 'Date needs review';
  return date.toLocaleString('en-AU', { day: 'numeric', month: 'short', year: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZone: 'Australia/Brisbane' });
}

export default function ElectionList({ entries, canCreate, canViewArchive, initialNow }: {
  entries: ElectionListEntry[]; canCreate: boolean; canViewArchive: boolean; initialNow: number;
}) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | Stage>('all');
  const [archive, setArchive] = useState(false);
  const [now, setNow] = useState(initialNow);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(timer); }, []);
  const scoped = entries.filter(entry => entry.archived === archive);
  const visible = scoped.filter(entry => (filter === 'all' || stageOf(entry, now) === filter)
    && entry.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
    .sort((a, b) => priority[stageOf(a, now)] - priority[stageOf(b, now)] || b.updatedAt.localeCompare(a.updatedAt));
  const reset = () => { setQuery(''); setFilter('all'); };
  const secondary = 'inline-flex min-h-11 items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-900 hover:border-primary hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary';

  return <div className="min-w-0 space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <h1 className="text-3xl font-bold tracking-tight text-gray-900">{archive ? 'Archived elections' : 'Elections'}</h1>
      {canCreate && <Link href="/admin/plebiscites/new" className="btn-primary inline-flex min-h-11 items-center">Create election</Link>}
    </div>
    <div className="flex flex-col gap-3 2xl:flex-row 2xl:items-center">
      <label className="relative block w-full 2xl:max-w-sm">
        <span className="sr-only">Find an election</span>
        <svg aria-hidden="true" className="pointer-events-none absolute left-3 top-3 h-5 w-5 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="10" cy="10" r="6" /><path d="m15 15 5 5" /></svg>
        <input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Find an election" className="input-field min-h-11 !pl-10" />
      </label>
      <div role="group" aria-label="Filter elections by status" className="flex flex-wrap gap-2">
        {filters.map(item => <button key={item.value} type="button" aria-pressed={filter === item.value}
          onClick={() => setFilter(item.value)} className={`min-h-11 rounded-lg border px-3 py-2 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${filter === item.value ? 'border-green-200 bg-green-50 text-primary-dark' : 'border-gray-200 bg-white text-gray-700 hover:border-primary'}`}>
          {item.label}
        </button>)}
      </div>
    </div>
    <div role="table" aria-label={archive ? 'Archived elections' : 'Elections'} className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <div role="rowgroup" className="sr-only xl:not-sr-only">
        <div role="row" className="grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] gap-5 border-b border-gray-200 px-6 py-4 text-xs font-semibold uppercase tracking-wide text-gray-500">
          {['Election', 'Status', 'Key date (Brisbane)', 'Action'].map(label => <div role="columnheader" key={label}>{label}</div>)}
        </div>
      </div>
      <div role="rowgroup" className="divide-y divide-gray-200">
        {visible.map(entry => {
          const stage = stageOf(entry, now);
          const failed = entry.closeState === 'failed';
          const closing = entry.closeState === 'closing';
          const status = stage === 'draft' ? 'Draft' : stage === 'not-open' ? 'Published · not open' : stage === 'open' ? 'Open' : stage === 'finalised' ? 'Finalised' : failed ? 'Finalisation needs review' : closing ? 'Finalising' : 'Voting ended';
          const managementUrl = `/admin/plebiscites/${entry.id}`;
          const primaryLabel = archive ? 'View or restore' : stage === 'finalised' ? 'View results' : !entry.canManage ? 'View election' : stage === 'ended' ? (failed || closing ? 'Review finalisation' : 'Finalise and count') : 'Manage election';
          const primaryUrl = !archive && stage === 'finalised' ? `/results/${entry.slug}` : managementUrl;
          return <div role="row" key={entry.key} className={`grid min-w-0 gap-3 px-4 py-5 sm:px-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] xl:items-center xl:gap-5 ${stage === 'ended' && !archive ? 'bg-green-50/50' : ''}`}>
            <div role="cell" className="min-w-0 break-words">
              <span className="font-semibold text-gray-900">{entry.title}</span>
              {entry.kind === 'setup' ? <p className="mt-1 text-sm text-gray-500">Step {entry.step} of 4 · {entry.creator}</p>
                : stage === 'ended' && !failed && !closing && <p className="mt-1 text-sm text-gray-500">Ready for finalisation</p>}
            </div>
            <div role="cell" className="flex items-center gap-2 text-sm text-gray-700">
              <span aria-hidden="true" className={`h-2.5 w-2.5 shrink-0 rounded-full ${failed ? 'bg-amber-500' : stage === 'open' || stage === 'finalised' ? 'bg-primary' : 'bg-gray-400'}`} />{status}
            </div>
            <div role="cell" className="text-sm text-gray-600">
              {entry.kind === 'setup' ? <>Saved {dateLabel(entry.updatedAt, true)}</> : <>{stage === 'open' ? 'Closes ' : 'Voting deadline '}{dateLabel(entry.closeDate)}</>}
              <span className="ml-1 xl:hidden">(Brisbane)</span>
            </div>
            <div role="cell" className="flex flex-wrap items-center gap-3 xl:items-start">
              {entry.kind === 'setup' ? <>
                {entry.ownDraft ? <Link href={`/admin/plebiscites/new?draft=${entry.id}`} className={secondary}>Continue setup</Link>
                  : <DraftTakeoverButton draftId={entry.id} title={entry.title} creator={entry.creator || 'its creator'} />}
                <Link href={`/proof/${entry.proofToken}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-sm font-medium text-primary hover:underline">View proof</Link>
              </> : <>
                <Link href={primaryUrl} className={stage === 'ended' && entry.canManage && !archive ? 'btn-primary inline-flex min-h-11 items-center text-sm' : secondary}>{primaryLabel}</Link>
                {stage === 'finalised' && !archive && <Link href={managementUrl} className="inline-flex min-h-11 items-center text-sm font-medium text-primary hover:underline">{entry.canManage ? 'Manage' : 'View election'}</Link>}
              </>}
            </div>
          </div>;
        })}
      </div>
      {visible.length === 0 && <div role="status" className="px-6 py-12 text-center text-gray-600">
        <p>{scoped.length === 0 ? (archive ? 'No archived elections.' : 'No elections to show yet.') : 'No elections match your search or filter.'}</p>
        {scoped.length > 0 && <button type="button" onClick={reset} className="mt-3 min-h-11 font-medium text-primary hover:underline">Clear search and filters</button>}
      </div>}
    </div>
    {canViewArchive && <button type="button" onClick={() => { setArchive(!archive); reset(); }} className="inline-flex min-h-11 items-center font-medium text-primary hover:underline">{archive ? '← Back to elections' : 'View archived elections →'}</button>}
  </div>;
}
