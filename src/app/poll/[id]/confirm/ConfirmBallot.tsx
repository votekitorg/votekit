'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { csrfFetch } from '@/lib/csrf-client';

export default function ConfirmBallot({id}:{id:string}) {
  const started=useRef(false),token=useRef(''),requestNumber=useRef(0);
  const [busy,setBusy]=useState(true),[done,setDone]=useState(false),[error,setError]=useState('');
  const confirm=useCallback(async(value:string)=>{
    const current=++requestNumber.current;
    setBusy(true);setDone(false);setError('');
    try {
      const response=await csrfFetch(`/api/public-polls/${id}/confirm`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:value})});
      const data=await response.json();
      if(!response.ok||data.success!==true)throw new Error(data.error||'Unable to confirm. Please try again.');
      if(current===requestNumber.current){setDone(true);token.current='';}
    }catch(e:any){if(current===requestNumber.current)setError(e.message||'Unable to confirm. Please try again.');}
    finally{if(current===requestNumber.current)setBusy(false);}
  },[id]);
  useEffect(()=>{
    const openLink=()=>{
      const value=new URLSearchParams(window.location.hash.slice(1)).get('token')||'';
      if(!value&&started.current)return;
      started.current=true;token.current=value;
      window.history.replaceState(null,'',window.location.pathname);
      if(value){void confirm(value);}
      else{setError('Open the complete confirmation link from your email.');setBusy(false);}
    };
    // Email links can reopen this same tab with a new fragment. Guard effect replay,
    // but process a genuine new link; the server handles repeated tokens idempotently.
    window.addEventListener('hashchange',openLink);
    if(!started.current)openLink();
    return ()=>window.removeEventListener('hashchange',openLink);
  },[confirm]);
  return <main className="mx-auto max-w-xl px-4 py-12 space-y-6">
    <Link href="/" className="text-2xl font-bold text-primary">VoteKit</Link>
    <h1 className="text-2xl font-bold">{done?'Ballot confirmed':busy?'Confirming your ballot…':'Unable to confirm your ballot'}</h1>
    {busy&&<p role="status">Please wait while we validate your ballot. No further button press is needed.</p>}
    {error&&<p role="alert" className="rounded bg-red-50 p-4">{error}</p>}
    {done&&<p role="status">You’re done. Your ballot is included in the email-confirmed result. Your email will not be published.</p>}
    {error&&token.current&&!busy&&<button className="btn-primary" onClick={()=>void confirm(token.current)}>Try again</button>}
    <noscript><p>JavaScript is needed to confirm your ballot. Enable it and reopen the link from your email.</p></noscript>
    <p><Link className="text-primary underline" href={`/poll/${id}`}>Return to poll</Link></p>
  </main>;
}
