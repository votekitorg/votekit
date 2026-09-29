'use client';
import { useEffect,useState } from 'react';
import Link from 'next/link';
import { csrfFetch } from '@/lib/csrf-client';
export default function ConfirmBallot({id}:{id:string}) {
  const [token,setToken]=useState(''),[busy,setBusy]=useState(false),[done,setDone]=useState(false),[error,setError]=useState('');
  useEffect(()=>{const t=new URLSearchParams(window.location.hash.slice(1)).get('token');if(t)setToken(t);else setError('Open the complete confirmation link from your email.');window.history.replaceState(null,'',window.location.pathname);},[]);
  async function confirm() {setBusy(true);setError('');try {const r=await csrfFetch(`/api/public-polls/${id}/confirm`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token})});const d=await r.json();if(!r.ok)throw new Error(d.error);setDone(true);setToken('');}catch(e:any){setError(e.message||'Unable to confirm. Please try again.');}finally{setBusy(false);}}
  return <main className="mx-auto max-w-xl px-4 py-12 space-y-6"><Link href="/" className="text-2xl font-bold text-primary">VoteKit</Link><h1 className="text-2xl font-bold">{done?'Ballot confirmed':'Confirm your ballot'}</h1>{error&&<p role="alert" className="rounded bg-red-50 p-4">{error}</p>}{done?<p role="status">Your ballot is included in the email-confirmed result. Your email will not be published.</p>:<><p>Only confirm if you submitted this ballot yourself. This confirms access to your email, not your membership or identity. Only your first confirmed ballot counts.</p><button className="btn-primary" disabled={!token||busy} onClick={confirm}>{busy?'Confirming…':'Confirm ballot'}</button></>}<p><Link className="text-primary underline" href={`/poll/${id}`}>Return to poll</Link></p></main>;
}
