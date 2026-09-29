import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeAll,beforeEach,afterAll,describe,it,expect,vi } from 'vitest';
import { NextRequest } from 'next/server';
const callbacks=vi.hoisted(()=>[] as Array<()=>Promise<void>>);
vi.mock('next/server',async original=>({...await original<any>(),after:vi.fn((fn:()=>Promise<void>)=>callbacks.push(fn))}));
vi.mock('@/lib/email',()=>({sendPublicPollConfirmation:vi.fn(async()=>({success:true}))}));
const root=fs.mkdtempSync(path.join(os.tmpdir(),'votekit-public-poll-'));
process.env.DATABASE_PATH=path.join(root,'polls.db');
process.env.PUBLIC_POLL_KEY_DIR=path.join(root,'keys');
process.env.VOTEKIT_PUBLIC_URL='https://votekit.example.invalid';
let db:any,lib:any,admin:any,pub:any,submit:any,confirm:any,mail:any;
const actors:Record<string,any>={};let now:number;
function input(extra:any={}) {return {title:'Fixture public poll',description:'Non-binding test poll.',question:'Who do you prefer?',options:['Alpha','Beta','Gamma'],opens_at:now-1000,closes_at:now+3600000,confirms_until:now+7200000,...extra};}
function ballot(extra:any={}) {return {rankings:['Beta','Alpha'],membership:'yes',email:'participant@example.invalid',consent:true,...extra};}
function opened() {const p=lib.createPoll(actors.ro,input());lib.openPoll(actors.ro,p.id);return lib.getPoll(p.id);}
function req(body:any,actor='ro',valid=true,method='POST') {return new NextRequest('https://votekit.example.invalid/api/poll',{method,headers:{'Content-Type':'application/json','x-csrf-token':valid?'fixture':'bad',cookie:`csrf-token=fixture; admin-session=poll-fixture-${actor}`},...(method==='POST'?{body:JSON.stringify(body)}:{})});}
const ctx=(id:string)=>({params:Promise.resolve({id})});
beforeAll(async()=>{
 db=(await import('@/lib/db')).default;lib=await import('@/lib/public-polls');admin=await import('@/app/api/admin/public-polls/route');pub=await import('@/app/api/public-polls/[id]/route');submit=await import('@/app/api/public-polls/[id]/submit/route');confirm=await import('@/app/api/public-polls/[id]/confirm/route');mail=(await import('@/lib/email')).sendPublicPollConfirmation;
 for(const [name,role] of Object.entries({owner:'owner',ro:'returning_officer',other:'returning_officer',observer:'observer',admin:'admin'})) {
  const id=Number(db.prepare('INSERT INTO admin_users(email,name,password_hash,role,authority_role,active) VALUES(?,?,?,?,?,1)').run(name+'@example.invalid',name,'not-a-login-password',role==='observer'?'observer':'admin',role).lastInsertRowid);
  actors[name]={adminUserId:id,email:name+'@example.invalid',name,role,isAdmin:true};
  db.prepare("INSERT INTO sessions(id,email,plebiscite_id,is_admin,admin_user_id,admin_role,expires_at) VALUES(?,?,-1,1,?,'admin',?)").run('poll-fixture-'+name,name+'@example.invalid',id,new Date(Date.now()+86400000).toISOString());
 }
});
beforeEach(()=>{now=Date.now();callbacks.length=0;mail.mockClear();mail.mockResolvedValue({success:true});for(const t of ['public_poll_claims','public_poll_ballots','public_poll_limits','public_polls'])db.prepare('DELETE FROM '+t).run();db.prepare('DELETE FROM admin_audit_log').run();});
afterAll(()=>{db.close();fs.rmSync(root,{recursive:true,force:true});});
describe('Public poll workflow and privacy',()=>{
 it('keeps schema additive and migration idempotent',async()=>{const p=opened();const original=db.prepare('SELECT * FROM public_polls').all();const {runPublicPollMigration}=await import('@/lib/public-poll-schema');runPublicPollMigration(db);expect(db.prepare('SELECT * FROM public_polls').all()).toEqual(original);expect(lib.getPoll(p.id).status).toBe('open');});
 it('allows draft edits/deletion only before opening and only by the owning RO or Owner',()=>{
  const p=lib.createPoll(actors.ro,input());expect(()=>lib.updatePollDraft(actors.other,p.id,input())).toThrow();
  lib.updatePollDraft(actors.ro,p.id,input({title:'Revised'}));expect(lib.getPoll(p.id).title).toBe('Revised');
  lib.openPoll(actors.ro,p.id);expect(()=>lib.updatePollDraft(actors.ro,p.id,input())).toThrow();expect(()=>lib.deletePollDraft(actors.ro,p.id)).toThrow();
  const draft=lib.createPoll(actors.ro,input());expect(()=>lib.deletePollDraft(actors.other,draft.id)).toThrow();lib.deletePollDraft(actors.owner,draft.id);expect(lib.getPoll(draft.id)).toBeUndefined();
 });
 it('restricts network abuse summaries and never exposes email/ballot/ranking details',()=>{
  const p=opened();lib.submitPublicBallot(p.id,ballot(),'shared');lib.submitPublicBallot(p.id,ballot({email:'second@example.invalid'}),'shared');
  expect(()=>lib.pollSecuritySummary(actors.other,p.id)).toThrow();const report=lib.pollSecuritySummary(actors.ro,p.id);
  expect(report).toHaveLength(1);expect(report[0].distinctEmails).toBe(2);expect(JSON.stringify(report)).not.toContain('@');expect(JSON.stringify(report)).not.toContain('Beta');
  lib.finalisePoll(actors.ro,p.id,p.confirms_until);expect(lib.pollSecuritySummary(actors.ro,p.id)).toEqual([]);
 });
 it('validates creation, role, CSRF, dates and choices',async()=>{
  for(const a of ['other','observer','admin','missing']) {const r=await admin.POST(req({action:'create',...input()},a));expect(r.status).toBe(a==='other'?201:403);}
  expect((await admin.POST(req({action:'create',...input()},'ro',false))).status).toBe(403);
  for(const extra of [{options:['Same','same']},{options:['Only']},{closes_at:now-1},{confirms_until:now+100*3600000},{opens_at:'2026-01-01'},{title:''}])expect(()=>lib.createPoll(actors.ro,input(extra))).toThrow();
 });
 it('scopes admin lists and actions to owner or creating RO',async()=>{
  const p=opened();const other=await admin.GET(req(null,'other',true,'GET'));expect((await other.json()).polls).toEqual([]);
  expect((await admin.POST(req({action:'finalise',id:p.id},'other'))).status).toBe(403);
  expect((await admin.GET(req(null,'observer',true,'GET'))).status).toBe(403);
  expect((await (await admin.GET(req(null,'owner',true,'GET'))).json()).polls).toHaveLength(1);
 });
 it('does not expose drafts or unpublished preferences',async()=>{
  const p=lib.createPoll(actors.ro,input());expect((await pub.GET(req(null,'missing',true,'GET'),ctx(p.id))).status).toBe(404);
  lib.openPoll(actors.ro,p.id);lib.submitPublicBallot(p.id,ballot(),'198.51.100.2');
  const data=await (await pub.GET(req(null,'missing',true,'GET'),ctx(p.id))).json();expect(data.results).toBeNull();expect(JSON.stringify(data)).not.toContain('rankings_json');
  const adminData=await (await admin.GET(req(null,'ro',true,'GET'))).json();expect(adminData.polls[0].results).toBeNull();expect(adminData.polls[0].counts).toEqual({ballots:1,confirmed:0});
 });
 it('rejects malformed ballots and submissions outside the window',()=>{
  const p=opened();for(const patch of [{rankings:[]},{rankings:['Alpha','Alpha']},{rankings:['unknown']},{email:'not email'},{membership:'unknown'},{consent:false}])expect(()=>lib.submitPublicBallot(p.id,ballot(patch),'ip')).toThrow();
  expect(()=>lib.submitPublicBallot(p.id,ballot(),'ip',p.opens_at-1)).toThrow();expect(()=>lib.submitPublicBallot(p.id,ballot(),'ip',p.closes_at)).toThrow();expect(lib.pollCounts(p.id).ballots).toBe(0);
 });
 it('stores identity and timing only as ciphertext, with no plaintext ballot linkage',()=>{
  const p=opened(),delivery=lib.submitPublicBallot(p.id,ballot(),'198.51.100.21');
  const claims=db.prepare('SELECT * FROM public_poll_claims').all(),votes=db.prepare('SELECT * FROM public_poll_ballots').all();
  const serialized=JSON.stringify({claims,votes,audit:db.prepare('SELECT * FROM admin_audit_log').all()});
  for(const v of [delivery.token,delivery.email,'198.51.100.21'])expect(serialized).not.toContain(v);
  expect(JSON.stringify(claims)).not.toContain(votes[0].id);expect(Object.keys(votes[0])).not.toContain('created_at');expect(Object.keys(votes[0])).not.toContain('email');
  expect(fs.statSync(path.join(root,'keys',p.id+'.key')).mode&0o777).toBe(0o600);
 });
 it('keeps one accepted ballot per email and lets the holder confirm a later intended ballot',()=>{
  const p=opened();const first=lib.submitPublicBallot(p.id,ballot({email:' PARTICIPANT@example.invalid ',rankings:['Alpha']}),'ip',now);
  const second=lib.submitPublicBallot(p.id,ballot(),'ip',now+61000);expect(lib.pollCounts(p.id)).toEqual({ballots:1,confirmed:0});
  lib.confirmPublicBallot(p.id,second.token,'ip',now+62000);expect(lib.pollCounts(p.id)).toEqual({ballots:1,confirmed:1});
  expect(JSON.parse(db.prepare('SELECT rankings_json FROM public_poll_ballots WHERE accepted=1').get().rankings_json)).toEqual(['Beta','Alpha']);
  expect(()=>lib.confirmPublicBallot(p.id,first.token,'ip',now+63000)).toThrow(/already been confirmed/);
  expect(lib.submitPublicBallot(p.id,ballot({rankings:['Gamma']}),'ip',now+125000)).toBeNull();
  expect(lib.confirmPublicBallot(p.id,second.token,'ip',now+64000)).toEqual({alreadyConfirmed:true});
 });
 it('allows email retries after the hourly limit without cancelling older links',()=>{
  const p=lib.createPoll(actors.ro,input({closes_at:now+10800000,confirms_until:now+14400000}));lib.openPoll(actors.ro,p.id);
  const first=lib.submitPublicBallot(p.id,ballot(),'ip',now);
  for(let i=1;i<5;i++)expect(lib.submitPublicBallot(p.id,ballot(),'ip',now+i*61000)).toBeTruthy();
  expect(lib.submitPublicBallot(p.id,ballot(),'ip',now+305000)).toBeNull();
  expect(lib.submitPublicBallot(p.id,ballot(),'ip',now+3600001)).toBeTruthy();
  lib.confirmPublicBallot(p.id,first.token,'ip',now+3600002);expect(lib.pollCounts(p.id)).toEqual({ballots:1,confirmed:1});
 });
 it('enforces token scope, format and expiration without consuming unrelated ballots',()=>{
  const p=opened(),second=opened(),d=lib.submitPublicBallot(p.id,ballot(),'ip');
  expect(()=>lib.confirmPublicBallot(second.id,d.token,'ip')).toThrow();expect(()=>lib.confirmPublicBallot(p.id,'bad','ip')).toThrow();
  expect(()=>lib.confirmPublicBallot(p.id,d.token,'ip',p.confirms_until)).toThrow();expect(lib.pollCounts(p.id).confirmed).toBe(0);
  lib.confirmPublicBallot(p.id,d.token,'ip',p.closes_at+1000);expect(lib.pollCounts(p.id).confirmed).toBe(1);
 });
 it('bounds IP bursts without treating all shared-IP ballots as duplicates',()=>{
  const p=opened();for(let i=0;i<100;i++)lib.submitPublicBallot(p.id,ballot({email:`person${i}@example.invalid`}),'shared-ip',now);
  expect(lib.pollCounts(p.id).ballots).toBe(100);expect(()=>lib.submitPublicBallot(p.id,ballot(),'shared-ip',now)).toThrow(/Too many/);
  expect(lib.submitPublicBallot(p.id,ballot(),'another-ip',now)).toBeTruthy();
 });
 it('does not regenerate missing keys or reopen published polls',()=>{
  const p=opened();fs.unlinkSync(path.join(root,'keys',p.id+'.key'));
  expect(()=>lib.submitPublicBallot(p.id,ballot(),'ip')).toThrow(/unavailable/);expect(()=>lib.openPoll(actors.ro,p.id)).toThrow();expect(fs.existsSync(path.join(root,'keys',p.id+'.key'))).toBe(false);
 });
 it('finalises transactionally, removes key/claims, shuffles IDs and preserves all result cohorts',()=>{
  const p=opened();const a=lib.submitPublicBallot(p.id,ballot(),'ip');lib.confirmPublicBallot(p.id,a.token,'ip');
  const b=lib.submitPublicBallot(p.id,ballot({email:'nonmember@example.invalid',membership:'no',rankings:['Alpha']}),'ip');lib.confirmPublicBallot(p.id,b.token,'ip');
  lib.submitPublicBallot(p.id,ballot({email:'unconfirmed@example.invalid',membership:'prefer_not',rankings:['Gamma']}),'ip');
  const oldIds=db.prepare('SELECT id FROM public_poll_ballots').all().map((r:any)=>r.id);
  expect(()=>lib.finalisePoll(actors.ro,p.id)).toThrow();lib.finalisePoll(actors.ro,p.id,p.confirms_until);
  expect(lib.getPoll(p.id).status).toBe('finalised');expect(fs.existsSync(path.join(root,'keys',p.id+'.key'))).toBe(false);
  expect(db.prepare('SELECT count(*) n FROM public_poll_claims').get().n).toBe(0);expect(db.prepare('SELECT count(*) n FROM public_poll_limits').get().n).toBe(0);
  for(const row of db.prepare('SELECT id FROM public_poll_ballots').all())expect(oldIds).not.toContain(row.id);
  const results=lib.publicPollResults(lib.getPoll(p.id));expect([results.all.count,results.confirmed.count,results.members.count]).toEqual([3,2,1]);expect(results.members.ranked.winner).toBe('Beta');
  lib.publishPollResults(actors.owner,p.id);expect(lib.getPoll(p.id).status).toBe('published');
 });
 it('keeps results locked if key removal fails and safely retries sealing',()=>{
  const p=opened();lib.submitPublicBallot(p.id,ballot(),'ip');const unlink=vi.spyOn(fs,'unlinkSync').mockImplementationOnce(()=>{throw Object.assign(new Error('fixture'),{code:'EACCES'});});
  expect(()=>lib.finalisePoll(actors.ro,p.id,p.confirms_until)).toThrow(/removal failed/);unlink.mockRestore();
  expect(lib.getPoll(p.id).status).toBe('sealing');expect(()=>lib.publishPollResults(actors.ro,p.id)).toThrow();
  lib.finalisePoll(actors.ro,p.id,p.confirms_until);expect(lib.pollCounts(p.id).ballots).toBe(1);expect(lib.getPoll(p.id).status).toBe('finalised');
 });
 it('public routes require CSRF and never expose credentials or duplicate status',async()=>{
  const p=opened();expect((await submit.POST(req(ballot(),'missing',false),ctx(p.id))).status).toBe(403);
  const r=await submit.POST(req(ballot(),'missing'),ctx(p.id));expect(r.status).toBe(200);expect(callbacks).toHaveLength(1);expect(mail).not.toHaveBeenCalled();
  const response=await r.json();await callbacks.shift()!();const link=new URL(mail.mock.calls[0][0].url);const token=new URLSearchParams(link.hash.slice(1)).get('token');expect(link.search).toBe('');
  expect(JSON.stringify(response)).not.toContain(token!);expect(JSON.stringify(response)).not.toContain('participant@example.invalid');
  expect((await confirm.POST(req({token},'missing',false),ctx(p.id))).status).toBe(403);
  expect((await confirm.POST(req({token},'missing'),ctx(p.id))).status).toBe(200);
  const again=await (await submit.POST(req(ballot(),'missing'),ctx(p.id))).json();expect(again).toEqual(response);expect(callbacks).toHaveLength(0);
 });
 it('preserves an unconfirmed ballot after email failure and allows bounded retries',async()=>{
  const p=opened();mail.mockResolvedValueOnce({success:false});const log=vi.spyOn(console,'error').mockImplementation(()=>{});
  expect((await submit.POST(req(ballot(),'missing'),ctx(p.id))).status).toBe(200);await callbacks.shift()!();expect(lib.pollCounts(p.id)).toEqual({ballots:1,confirmed:0});
  expect(lib.submitPublicBallot(p.id,ballot(),'ip',now+61000)).toBeTruthy();expect(lib.pollCounts(p.id).ballots).toBe(1);expect(JSON.stringify(log.mock.calls)).not.toContain('participant@');log.mockRestore();
 });
});
