'use client';
import Link from 'next/link';
import { useEffect,useState } from 'react';
import RankedChoiceInput from '@/components/RankedChoiceInput';
import PublicPollResults from '@/components/PublicPollResults';
import { csrfFetch } from '@/lib/csrf-client';
import type { pollView,publicPollResults } from '@/lib/public-polls';
type Poll=ReturnType<typeof pollView>;
export default function PublicPollBallot({id}:{id:string}) {
  const [poll,setPoll]=useState<Poll|null>(null),[results,setResults]=useState<ReturnType<typeof publicPollResults>|null>(null);
  const [options,setOptions]=useState<string[]>([]),[rankings,setRankings]=useState<string[]>([]),[membership,setMembership]=useState(''),[email,setEmail]=useState(''),[consent,setConsent]=useState(false);
  const [error,setError]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  useEffect(()=>{fetch(`/api/public-polls/${id}`,{cache:'no-store'}).then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error);setPoll(d.poll);setResults(d.results);const shuffled=[...d.poll.options];for(let i=shuffled.length-1;i>0;i--){const n=new Uint32Array(1);crypto.getRandomValues(n);const j=n[0]%(i+1);[shuffled[i],shuffled[j]]=[shuffled[j],shuffled[i]];}setOptions(shuffled);}).catch(e=>setError(e.message));},[id]);
  async function submit(e:React.FormEvent) {e.preventDefault();setError('');if(!rankings.length){setError('Rank at least one option.');return;}setBusy(true);
    try {const r=await csrfFetch(`/api/public-polls/${id}/submit`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({rankings,membership,email,consent})});const d=await r.json();if(!r.ok)throw new Error(d.error);setMessage(d.message);setEmail('');}
    catch(e:any){setError(e.message||'Submission failed. Your choices have been retained.');}finally{setBusy(false);}
  }
  const active=poll&&poll.status==='open'&&Date.now()>=poll.opens_at&&Date.now()<poll.closes_at;
  return <main className="mx-auto max-w-3xl px-4 py-8 space-y-6"><Link href="/" className="text-primary text-2xl font-bold">VoteKit</Link><p className="text-sm font-semibold uppercase text-gray-600">Public poll</p>
    {error&&<p role="alert" className="rounded border border-red-300 bg-red-50 p-4">{error}</p>}
    {!poll&&!error&&<p>Loading poll…</p>}
    {poll&&<><h1 className="text-3xl font-bold break-words">{poll.title}</h1><p className="whitespace-pre-wrap break-words">{poll.description}</p>
      <p className="text-sm text-gray-600">Submissions close {new Date(poll.closes_at).toLocaleString()}. Email confirmations close {new Date(poll.confirms_until).toLocaleString()}. Times shown in your local timezone.</p>
      {results?<PublicPollResults results={results} options={poll.options}/>:message?<section className="rounded border border-green-300 bg-green-50 p-5 space-y-4"><h2 className="text-xl font-bold">Check your email</h2><p role="status">{message}</p><button className="btn-secondary" onClick={()=>setMessage('')}>Return to ballot</button></section>:active?<form onSubmit={submit} className="space-y-6">
        <section><h2 className="text-xl font-bold mb-3">{poll.question}</h2><p className="mb-3">Rank at least one option, in order of preference. You can leave options unranked. The starting order is random.</p><RankedChoiceInput options={options} value={rankings} onChange={setRankings} disabled={busy} preferentialType="optional"/></section>
        <fieldset disabled={busy} className="space-y-2"><legend className="font-semibold mb-2">Are you currently a Greens member?</legend>{[['yes','Yes'],['no','No'],['prefer_not','Prefer not to say']].map(([v,l])=><label key={v} className="flex items-center gap-3 py-2"><input required type="radio" name="membership" value={v} checked={membership===v} onChange={()=>setMembership(v)}/>{l}</label>)}</fieldset>
        <label className="block font-semibold">Email address<input required type="email" autoComplete="email" maxLength={254} disabled={busy} value={email} onChange={e=>setEmail(e.target.value)} className="input-field mt-2"/></label>
        <p className="text-sm text-gray-600">We will email a link to confirm this ballot. Unconfirmed ballots are included only in the all-ballots result. Only one ballot per email is counted; the first ballot you confirm takes priority. Confirmation links last up to 48 hours, but never beyond the confirmation deadline.</p>
        <details className="rounded border p-4"><summary className="cursor-pointer font-semibold">Privacy and counting</summary><div className="mt-3 space-y-3 text-sm"><p>This poll is confidential while confirmation is open, not anonymous to the system operator. Email addresses, IP addresses and submission/confirmation times are held in encrypted verification records, separately from rankings, to confirm ballots and limit abuse. Shared IP addresses are not automatically treated as duplicate people.</p><p>At finalisation, verification links are removed, their separate encryption key is deleted and ballot order is shuffled. Results contain aggregate counts only. Email addresses are not used for marketing. Membership is self-declared, not independently verified.</p><p>Rankings are counted using Condorcet pairwise comparisons, with the Schulze method if no candidate beats every other candidate. Ranked options are preferred to all unranked options; unranked options are tied with one another. Genuine unresolved ties are reported.</p></div></details>
        <label className="flex items-start gap-3"><input required type="checkbox" className="mt-1" checked={consent} disabled={busy} onChange={e=>setConsent(e.target.checked)}/><span>I agree to my ballot, membership answer, email and security information being handled as described above. I am submitting my own preferences.</span></label>
        <button disabled={busy} className="btn-primary">{busy?'Submitting…':'Submit ballot and email confirmation link'}</button>
      </form>:<p className="rounded border bg-gray-50 p-4">{Date.now()<poll.opens_at?'This poll has not opened yet.':'Voting has closed. Previously issued email links can be confirmed until the confirmation deadline. Results will appear here once published.'}</p>}
    </>}
  </main>;
}
