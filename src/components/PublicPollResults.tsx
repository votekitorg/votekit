'use client';
import { useState } from 'react';
import CondorcetResults from './CondorcetResults';
import type { publicPollResults } from '@/lib/public-polls';
type Results=ReturnType<typeof publicPollResults>;
const labels={confirmed:'Email-confirmed ballots',all:'All accepted ballots',members:'Email-confirmed, self-declared members'};
export default function PublicPollResults({results,options}:{results:Results;options:string[]}) {
  const [view,setView]=useState<keyof Results>('confirmed');const selected=results[view];
  return <section className="space-y-4"><h2 className="text-2xl font-bold">Poll results</h2>
    <p className="text-sm text-gray-600">This is a self-selected, non-binding public poll, not a representative survey or an official election. Email confirmation does not verify membership or one person, one vote. These groups overlap; do not add their totals.</p>
    <label className="block font-medium">Show results for<select className="input-field mt-2" value={view} onChange={e=>setView(e.target.value as keyof Results)}>{Object.entries(labels).map(([k,label])=><option key={k} value={k}>{label} ({results[k as keyof Results].count})</option>)}</select></label>
    <p><strong>{selected.count}</strong> accepted ballots in this group.</p>
    {selected.ranked?<><CondorcetResults title={labels[view]} results={selected.ranked} options={options}/><h3 className="font-semibold">First preferences</h3><ul className="divide-y">{selected.firstPreferences.map(x=><li key={x.candidate} className="flex justify-between gap-4 py-2"><span className="break-words">{x.candidate}</span><span>{x.count}</span></li>)}</ul></>:<p>No ballots in this group.</p>}
  </section>;
}
