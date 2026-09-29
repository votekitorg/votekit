import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import db from './db';
import { canManageElections, recordAdminAuditLog, type AdminSession } from './auth';
import { tabulateCondorcet } from './condorcet';

export interface PublicPoll {
  id:string; title:string; description:string; question:string; options_json:string;
  created_by:number; status:'draft'|'open'|'sealing'|'finalised'|'published';
  opens_at:number; closes_at:number; confirms_until:number; created_at:number;
}
interface Claim { ballot:string; email:string; ip:string; submitted:number; expires:number; confirmedAt?:number; }
interface ClaimRow { token_hash:string; poll_id:string; email_key:string; sealed:string; confirmed:number; }
interface Ballot { id:string; rankings_json:string; membership:string; confirmed:number; accepted:number; }
export class PollError extends Error { constructor(message:string, public status=400) { super(message); } }
export function getPoll(id:string) { return db.prepare('SELECT * FROM public_polls WHERE id=?').get(id) as PublicPoll|undefined; }
export function pollView(p:PublicPoll) {
  return {id:p.id,title:p.title,description:p.description,question:p.question,options:JSON.parse(p.options_json) as string[],status:p.status,opens_at:p.opens_at,closes_at:p.closes_at,confirms_until:p.confirms_until};
}
export function managesPoll(actor:AdminSession,p:PublicPoll) { return canManageElections(actor.role) && (actor.role==='owner' || p.created_by===actor.adminUserId); }
function requirePoll(id:string) { const p=getPoll(id);if(!p)throw new PollError('Poll not found',404);return p; }
function privateDirectory() {
  const folder=process.env.PUBLIC_POLL_KEY_DIR;
  if(!folder || !path.isAbsolute(folder))throw new PollError('Public poll privacy storage is not configured',503);
  return folder;
}
function keyPath(id:string) { if(!/^[0-9a-f-]{36}$/.test(id))throw new PollError('Invalid poll');return path.join(privateDirectory(),id+'.key'); }
function createKey(id:string) {
  fs.mkdirSync(privateDirectory(),{recursive:true,mode:0o700});
  fs.writeFileSync(keyPath(id),crypto.randomBytes(32),{flag:'wx',mode:0o600});
}
function keyFor(id:string) {
  try { const k=fs.readFileSync(keyPath(id));if(k.length!==32)throw new Error();return k; }
  catch { throw new PollError('Confirmation is temporarily unavailable. Contact the poll organiser.',503); }
}
function digest(value:string) { return crypto.createHash('sha256').update(value).digest('hex'); }
function keyed(key:Buffer,purpose:string,value:string) { return crypto.createHmac('sha256',key).update(purpose+'\0'+value).digest('hex'); }
function seal(value:Claim,key:Buffer) {
  const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key,iv);
  const body=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);
  return Buffer.concat([iv,cipher.getAuthTag(),body]).toString('base64');
}
function unseal(row:ClaimRow,key:Buffer):Claim {
  const b=Buffer.from(row.sealed,'base64'),dec=crypto.createDecipheriv('aes-256-gcm',key,b.subarray(0,12));
  dec.setAuthTag(b.subarray(12,28));return JSON.parse(Buffer.concat([dec.update(b.subarray(28)),dec.final()]).toString('utf8'));
}
function audit(actor:AdminSession,p:PublicPoll,action:string) { recordAdminAuditLog({adminUserId:actor.adminUserId,action:'public_poll.'+action,targetType:'public_poll',targetId:p.id}); }
function validatePollInput(input:any) {
  const bounded=(v:unknown,max:number)=>typeof v==='string' && v.trim().length>0 && v.length<=max;
  if(!input || !bounded(input.title,200)||!bounded(input.description,10000)||!bounded(input.question,500))throw new PollError('Provide a title, description and ranking question.');
  if(!Array.isArray(input.options)||input.options.length<2||input.options.length>50||input.options.some((v:unknown)=>!bounded(v,150)))throw new PollError('Provide 2 to 50 options, each no longer than 150 characters.');
  const options=input.options.map((v:string)=>v.trim());
  if(new Set(options.map((s:string)=>s.toLowerCase())).size!==options.length)throw new PollError('Options must be unique.');
  const {opens_at,closes_at,confirms_until}=input;
  if(![opens_at,closes_at,confirms_until].every(n=>typeof n==='number'&&Number.isSafeInteger(n)&&n>0) || opens_at>=closes_at || closes_at<=Date.now() || confirms_until<closes_at || confirms_until>closes_at+48*3600000)throw new PollError('Choose valid dates. Confirmation must close within 48 hours after submissions close.');
  return {title:input.title.trim(),description:input.description.trim(),question:input.question.trim(),options,opens_at,closes_at,confirms_until};
}
export function createPoll(actor:AdminSession,input:any) {
  if(!canManageElections(actor.role))throw new PollError('Owner or Returning Officer role required',403);
  const v=validatePollInput(input);
  const {options,opens_at,closes_at,confirms_until}=v;
  const id=crypto.randomUUID();
  db.prepare(`INSERT INTO public_polls(id,title,description,question,options_json,created_by,opens_at,closes_at,confirms_until,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)`)
    .run(id,input.title.trim(),input.description.trim(),input.question.trim(),JSON.stringify(options),actor.adminUserId,opens_at,closes_at,confirms_until,Date.now());
  const p=requirePoll(id);audit(actor,p,'create');return p;
}
export function updatePollDraft(actor:AdminSession,id:string,input:any) {
  const p=requirePoll(id);if(!managesPoll(actor,p))throw new PollError('Not authorised',403);
  const v=validatePollInput(input);
  db.transaction(()=>{
    if(db.prepare("UPDATE public_polls SET title=?,description=?,question=?,options_json=?,opens_at=?,closes_at=?,confirms_until=? WHERE id=? AND status='draft'")
      .run(v.title,v.description,v.question,JSON.stringify(v.options),v.opens_at,v.closes_at,v.confirms_until,id).changes!==1)throw new PollError('Only unpublished drafts can be edited.');
    audit(actor,p,'update_draft');
  }).immediate();
}
export function deletePollDraft(actor:AdminSession,id:string) {
  const p=requirePoll(id);if(!managesPoll(actor,p))throw new PollError('Not authorised',403);
  db.transaction(()=>{
    if(db.prepare("DELETE FROM public_polls WHERE id=? AND status='draft'").run(id).changes!==1)throw new PollError('Only unpublished drafts can be deleted.');
    audit(actor,p,'delete_draft');
  }).immediate();
}
export function pollSecuritySummary(actor:AdminSession,id:string) {
  const p=requirePoll(id);if(!managesPoll(actor,p))throw new PollError('Not authorised',403);
  if(p.status!=='open')return [];
  const key=keyFor(id),groups=new Map<string,{ip:string;submissions:number;emails:Set<string>;first:number;last:number}>();
  const claims=db.prepare('SELECT * FROM public_poll_claims WHERE poll_id=?').all(id) as ClaimRow[];
  for(const row of claims) {
    const c=unseal(row,key),g=groups.get(c.ip)||{ip:c.ip,submissions:0,emails:new Set<string>(),first:c.submitted,last:c.submitted};
    g.submissions++;g.emails.add(row.email_key);g.first=Math.min(g.first,c.submitted);g.last=Math.max(g.last,c.submitted);groups.set(c.ip,g);
  }
  // No email addresses, ballot identifiers, rankings or per-ballot timestamps are exposed.
  return [...groups.values()].map(g=>({ip:g.ip,submissions:g.submissions,distinctEmails:g.emails.size,first:g.first,last:g.last})).sort((a,b)=>b.distinctEmails-a.distinctEmails).slice(0,100);
}
export function openPoll(actor:AdminSession,id:string) {
  const p=requirePoll(id);if(!managesPoll(actor,p))throw new PollError('Not authorised',403);
  if(p.status!=='draft'||p.closes_at<=Date.now())throw new PollError('Only a current draft can be opened.');
  createKey(id);
  try { db.transaction(()=>{if(db.prepare("UPDATE public_polls SET status='open' WHERE id=? AND status='draft'").run(id).changes!==1)throw new PollError('Poll already opened');audit(actor,p,'open');}).immediate(); }
  catch(e) {fs.unlinkSync(keyPath(id));throw e;}
}
function consumeLimits(p:PublicPoll,key:Buffer,ip:string,scope:string,now:number) {
  return db.transaction(()=>{
    db.prepare('DELETE FROM public_poll_limits WHERE resets_at<=?').run(now);
    const limits:Array<[string,number]>=[[keyed(key,scope+'-ip',ip),scope==='submit'?100:300],[scope+'-global',scope==='submit'?5000:15000]];
    for(const [k,max] of limits) {
      const row=db.prepare('SELECT attempts FROM public_poll_limits WHERE poll_id=? AND key=?').get(p.id,k) as {attempts:number}|undefined;
      if(row && row.attempts>=max)throw new PollError('Too many requests. Please try again later.',429);
    }
    for(const [k] of limits)db.prepare(`INSERT INTO public_poll_limits(poll_id,key,attempts,resets_at) VALUES(?,?,1,?) ON CONFLICT(poll_id,key) DO UPDATE SET attempts=attempts+1`).run(p.id,k,now+3600000);
  }).immediate();
}
export function submitPublicBallot(id:string,input:any,ip:string,now=Date.now()) {
  const p=requirePoll(id);if(p.status!=='open'||now<p.opens_at||now>=p.closes_at)throw new PollError('This poll is not accepting ballots.',409);
  const options=JSON.parse(p.options_json) as string[];
  if(!input || !Array.isArray(input.rankings)||!input.rankings.length||input.rankings.length>options.length||new Set(input.rankings).size!==input.rankings.length||input.rankings.some((v:unknown)=>typeof v!=='string'||!options.includes(v)))throw new PollError('Rank at least one option without duplicates.');
  if(!['yes','no','prefer_not'].includes(input.membership)||input.consent!==true)throw new PollError('Answer the membership question and accept the privacy notice.');
  if(typeof input.email!=='string')throw new PollError('Enter a valid email address.');
  const email=input.email.trim().toLowerCase();
  if(email.length>254||!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email))throw new PollError('Enter a valid email address.');
  const key=keyFor(id);consumeLimits(p,key,ip,'submit',now);
  return db.transaction(()=>{
    const live=requirePoll(id);if(live.status!=='open'||now>=live.closes_at)throw new PollError('Voting has closed.',409);
    const emailKey=keyed(key,'email',email);
    const claims=db.prepare('SELECT * FROM public_poll_claims WHERE poll_id=? AND email_key=?').all(id,emailKey) as ClaimRow[];
    if(claims.some(c=>c.confirmed))return null;
    const recent=claims.map(c=>unseal(c,key)).filter(c=>now-c.submitted<3600000);
    if(recent.length>=5||recent.some(c=>now-c.submitted<60000))return null;
    const ballot=crypto.randomUUID(),token=crypto.randomBytes(32).toString('base64url');
    const expires=Math.min(now+48*3600000,p.confirms_until);
    db.prepare('INSERT INTO public_poll_ballots(id,poll_id,rankings_json,membership,accepted) VALUES(?,?,?,?,?)').run(ballot,id,JSON.stringify(input.rankings),input.membership,claims.length===0?1:0);
    db.prepare('INSERT INTO public_poll_claims(token_hash,poll_id,email_key,sealed) VALUES(?,?,?,?)').run(digest(token),id,emailKey,seal({ballot,email,ip,submitted:now,expires},key));
    return {email,token,title:p.title,expires};
  }).immediate();
}
export function confirmPublicBallot(id:string,token:unknown,ip:string,now=Date.now()) {
  const p=requirePoll(id);if(p.status!=='open'||now>=p.confirms_until)throw new PollError('Confirmation has closed.',409);
  const key=keyFor(id);consumeLimits(p,key,ip,'confirm',now);
  if(typeof token!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(token))throw new PollError('This confirmation link is invalid or expired.');
  return db.transaction(()=>{
    if(requirePoll(id).status!=='open')throw new PollError('Confirmation has closed.',409);
    const row=db.prepare('SELECT * FROM public_poll_claims WHERE poll_id=? AND token_hash=?').get(id,digest(token)) as ClaimRow|undefined;
    if(!row)throw new PollError('This confirmation link is invalid or expired.');
    if(row.confirmed)return {alreadyConfirmed:true};
    const claim=unseal(row,key);if(now>=claim.expires)throw new PollError('This confirmation link has expired.');
    const siblings=db.prepare('SELECT * FROM public_poll_claims WHERE poll_id=? AND email_key=?').all(id,row.email_key) as ClaimRow[];
    if(siblings.some(c=>c.confirmed))throw new PollError('A ballot for this email has already been confirmed. It has not been changed.',409);
    for(const c of siblings)db.prepare('UPDATE public_poll_ballots SET accepted=0 WHERE poll_id=? AND id=?').run(id,unseal(c,key).ballot);
    if(db.prepare('UPDATE public_poll_ballots SET accepted=1,confirmed=1 WHERE id=? AND poll_id=?').run(claim.ballot,id).changes!==1)throw new PollError('Ballot unavailable',409);
    db.prepare('UPDATE public_poll_claims SET confirmed=1,sealed=? WHERE token_hash=?').run(seal({...claim,confirmedAt:now},key),row.token_hash);
    return {alreadyConfirmed:false};
  }).immediate();
}
export function finalisePoll(actor:AdminSession,id:string,now=Date.now()) {
  let p=requirePoll(id);if(!managesPoll(actor,p))throw new PollError('Not authorised',403);
  if(!['open','sealing'].includes(p.status)||now<p.confirms_until)throw new PollError('Finalise after the confirmation deadline.');
  if(p.status==='open')db.transaction(()=>{
    p=requirePoll(id);if(p.status!=='open')throw new PollError('Poll state changed. Retry.');
    const ballots=db.prepare('SELECT rankings_json,membership,confirmed FROM public_poll_ballots WHERE poll_id=? AND accepted=1').all(id) as Ballot[];
    for(let i=ballots.length-1;i>0;i--){const j=crypto.randomInt(i+1);[ballots[i],ballots[j]]=[ballots[j],ballots[i]];}
    db.prepare('DELETE FROM public_poll_ballots WHERE poll_id=?').run(id);
    for(const b of ballots)db.prepare('INSERT INTO public_poll_ballots(id,poll_id,rankings_json,membership,confirmed,accepted) VALUES(?,?,?,?,?,1)').run(crypto.randomUUID(),id,b.rankings_json,b.membership,b.confirmed);
    db.prepare('DELETE FROM public_poll_claims WHERE poll_id=?').run(id);
    db.prepare('DELETE FROM public_poll_limits WHERE poll_id=?').run(id);
    db.prepare("UPDATE public_polls SET status='sealing' WHERE id=?").run(id);
    audit(actor,p,'seal_started');
  }).immediate();
  try {fs.unlinkSync(keyPath(id));}catch(e:any){if(e.code!=='ENOENT')throw new PollError('Privacy key removal failed. Retry finalisation; results remain private.',503);}
  db.transaction(()=>{db.prepare("UPDATE public_polls SET status='finalised' WHERE id=? AND status='sealing'").run(id);audit(actor,p,'finalise');}).immediate();
}
export function publishPollResults(actor:AdminSession,id:string) {
  const p=requirePoll(id);if(!managesPoll(actor,p))throw new PollError('Not authorised',403);
  if(p.status!=='finalised')throw new PollError('Finalise the poll first.');
  db.transaction(()=>{db.prepare("UPDATE public_polls SET status='published' WHERE id=? AND status='finalised'").run(id);audit(actor,p,'publish_results');}).immediate();
}
export function publicPollResults(p:PublicPoll) {
  if(!['finalised','published'].includes(p.status))throw new PollError('Results are not available yet.',409);
  const ballots=db.prepare('SELECT rankings_json,membership,confirmed FROM public_poll_ballots WHERE poll_id=? AND accepted=1').all(p.id) as Ballot[];
  const options=JSON.parse(p.options_json) as string[];
  const result=(items:Ballot[])=>({count:items.length,firstPreferences:options.map(candidate=>({candidate,count:items.filter(b=>JSON.parse(b.rankings_json)[0]===candidate).length})),ranked:items.length?tabulateCondorcet(items.map(b=>({preferences:JSON.parse(b.rankings_json)})),options):null});
  return {all:result(ballots),confirmed:result(ballots.filter(b=>b.confirmed)),members:result(ballots.filter(b=>b.confirmed&&b.membership==='yes'))};
}
export function pollCounts(id:string) {
  return db.prepare(`SELECT COUNT(*) AS ballots,COALESCE(SUM(confirmed),0) AS confirmed FROM public_poll_ballots WHERE poll_id=? AND accepted=1`).get(id) as {ballots:number;confirmed:number};
}
