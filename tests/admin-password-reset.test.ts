import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import bcrypt from 'bcryptjs';
import Database from 'better-sqlite3';
import crypto from 'node:crypto';
const background = vi.hoisted(() => [] as Array<() => Promise<void>>);
vi.mock('next/server', async original => ({...await original<any>(), after:vi.fn((fn:() => Promise<void>) => background.push(fn))}));

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'votekit-reset-'));
process.env.DATABASE_PATH = path.join(tmp, 'test.db');
process.env.VOTEKIT_PUBLIC_URL = 'https://votekit.example.invalid';
vi.mock('@/lib/email', async original => ({...await original<any>(), sendAdminPasswordResetEmail:vi.fn(async () => ({success:true}))}));
let db:any, auth:any, reset:any, send:any, complete:any, mail:any, requestReset:any, migrate:any;
const ids:Record<string,number> = {};
const initialPassword = 'test-only-'.repeat(3);
const replacement = 'new-test-only-'.repeat(3);
let oldHash:string;
const csrf='fixture-csrf';
function req(body:any, session='owner', csrfValid=true, endpoint='') {
  return new NextRequest('http://localhost/api/admin/password-resets'+endpoint, {method:'POST', headers:{
    'content-type':'application/json', 'x-csrf-token':csrfValid?csrf:'bad', cookie:`csrf-token=${csrf}; admin-session=reset-fixture-${session}`
  },body:JSON.stringify(body)});
}
async function issue() {
  const response=await send(req({id:ids.ro}));expect(response.status).toBe(200);
  const url=new URL(mail.mock.calls.at(-1)[0].resetUrl);
  return new URLSearchParams(url.hash.slice(1)).get('token')!;
}
function ageRequests() { db.prepare('UPDATE admin_password_resets SET created_at = created_at - 61000').run(); }
beforeAll(async()=>{
  db=(await import('@/lib/db')).default;migrate=(await import('@/lib/db')).runPasswordResetMigration;auth=await import('@/lib/auth');reset=await import('@/lib/admin-password-reset');
  send=(await import('@/app/api/admin/password-resets/route')).POST;
  requestReset=(await import('@/app/api/admin/password-resets/request/route')).POST;
  complete=(await import('@/app/api/admin/password-resets/complete/route')).POST;
  mail=(await import('@/lib/email')).sendAdminPasswordResetEmail;
  oldHash=await bcrypt.hash(initialPassword,4);
  for(const [name,role] of Object.entries({owner:'owner',ro:'returning_officer',admin:'admin',observer:'observer',inactive:'returning_officer'})) {
    ids[name]=Number(db.prepare('INSERT INTO admin_users(email,name,password_hash,role,authority_role,active) VALUES (?,?,?,?,?,?)')
      .run(name+'@example.invalid',name,oldHash,role==='observer'?'observer':'admin',role,name==='inactive'?0:1).lastInsertRowid);
  }
});
beforeEach(()=>{
  background.length=0;
  mail.mockReset();mail.mockResolvedValue({success:true});
  db.prepare('DELETE FROM admin_password_resets').run();db.prepare('DELETE FROM email_rate_limits').run();
  db.prepare('DELETE FROM admin_audit_log').run();db.prepare('DELETE FROM sessions').run();
  db.prepare('UPDATE admin_users SET password_hash = ?').run(oldHash);
  db.prepare("UPDATE admin_users SET active = 1, authority_role = 'returning_officer', email = 'ro@example.invalid' WHERE id = ?").run(ids.ro);
  db.prepare("UPDATE admin_users SET active = 1, authority_role = 'owner' WHERE id = ?").run(ids.owner);
  for(const name of ['owner','ro','admin','observer']) db.prepare("INSERT INTO sessions(id,email,plebiscite_id,is_admin,admin_user_id,admin_role,expires_at) VALUES (?,?,-1,1,?,'admin',?)")
    .run('reset-fixture-'+name,name+'@example.invalid',ids[name],new Date(Date.now()+3600000).toISOString());
});
afterAll(()=>{db.close();fs.rmSync(tmp,{recursive:true,force:true});});

describe('Owner-assisted password resets',()=>{
  it('requires Owner, CSRF and an active non-Owner target, and never sends for invalid requests',async()=>{
    for(const session of ['ro','admin','observer','missing']) expect((await send(req({id:ids.ro},session))).status).toBe(403);
    expect((await send(req({id:ids.ro},'owner',false))).status).toBe(403);
    for(const id of [ids.owner,ids.inactive,9999,-1,1.5]) expect((await send(req({id}))).status).toBe(400);
    expect(mail).not.toHaveBeenCalled();
  });
  it('stores only token digest and leaves the account/session untouched until completion',async()=>{
    const userBefore=db.prepare('SELECT * FROM admin_users WHERE id=?').get(ids.ro);
    const token=await issue();const row=db.prepare('SELECT * FROM admin_password_resets').get();
    expect(row.token_hash.length).toBe(64);expect(row.token_hash===token).toBe(false);
    expect(JSON.stringify(row).includes(token)).toBe(false);
    expect(row.expires_at-row.created_at).toBe(1800000);
    expect(new URL(mail.mock.calls[0][0].resetUrl).origin).toBe('https://votekit.example.invalid');
    expect(db.prepare('SELECT * FROM admin_users WHERE id=?').get(ids.ro)).toEqual(userBefore);
    expect(auth.getAdminSession('reset-fixture-ro')).toBeTruthy();
    expect(JSON.stringify(db.prepare('SELECT * FROM admin_audit_log').all()).includes(token)).toBe(false);
    const inspected=await complete(req({action:'inspect',token},'missing'));
    expect(inspected.status).toBe(200);expect(db.prepare('SELECT used_at FROM admin_password_resets').get().used_at).toBeNull();
  });
  it('changes only password, consumes once, revokes sessions and sends credential-free notice',async()=>{
    const token=await issue();const before=db.prepare('SELECT * FROM admin_users WHERE id=?').get(ids.ro);
    const teams=JSON.stringify(db.prepare('SELECT * FROM election_team_members').all());
    const response=await complete(req({action:'complete',token,password:replacement,confirmation:replacement},'missing'));
    expect(response.status).toBe(200);expect(await response.json()).toEqual({success:true});
    const after=db.prepare('SELECT * FROM admin_users WHERE id=?').get(ids.ro);
    const {password_hash:old,updated_at:oldTime,...oldRest}=before;
    const {password_hash:next,updated_at:nextTime,...nextRest}=after;
    expect(nextRest).toEqual(oldRest);expect(await bcrypt.compare(replacement,next)).toBe(true);expect(await bcrypt.compare(initialPassword,next)).toBe(false);
    expect(auth.getAdminSession('reset-fixture-ro')).toBeNull();expect(auth.getAdminSession('reset-fixture-owner')).toBeTruthy();
    expect(JSON.stringify(db.prepare('SELECT * FROM election_team_members').all())).toBe(teams);
    expect((await complete(req({action:'complete',token,password:initialPassword,confirmation:initialPassword},'missing'))).status).toBe(400);
    expect(mail.mock.calls.at(-1)[0].resetUrl).toBeUndefined();expect(JSON.stringify(mail.mock.calls.at(-1)).includes(replacement)).toBe(false);
    expect(db.prepare("SELECT count(*) AS n FROM admin_audit_log WHERE action='admin_password_reset.complete'").get().n).toBe(1);
  });
  it('rejects mismatches, short/oversized passwords and CSRF without consuming the link',async()=>{
    const token=await issue();
    for(const [password,confirmation] of [['short','short'],[replacement,'different'],['x'.repeat(73),'x'.repeat(73)],['é'.repeat(40),'é'.repeat(40)]]) {
      expect((await complete(req({action:'complete',token,password,confirmation},'missing'))).status).toBe(400);
    }
    expect((await complete(req({action:'complete',token,password:replacement,confirmation:replacement},'missing',false))).status).toBe(403);
    expect(db.prepare('SELECT used_at FROM admin_password_resets').get().used_at).toBeNull();
    expect(db.prepare('SELECT password_hash FROM admin_users WHERE id=?').get(ids.ro).password_hash===oldHash).toBe(true);
  });
  it('enforces expiry, resend cooldown, replacement and account request limit',async()=>{
    const token=await issue();expect((await send(req({id:ids.ro}))).status).toBe(429);
    ageRequests();const second=await issue();expect(()=>reset.inspectPasswordReset(token)).toThrow();
    db.prepare('UPDATE admin_password_resets SET expires_at=?').run(Date.now()-1);expect(()=>reset.inspectPasswordReset(second)).toThrow();
    for(let i=0;i<3;i++){ageRequests();await issue();}
    ageRequests();expect((await send(req({id:ids.ro}))).status).toBe(429);
  });
  it('revokes undelivered links without changing passwords or sessions',async()=>{
    mail.mockResolvedValueOnce({success:false});expect((await send(req({id:ids.ro}))).status).toBe(502);
    const token=new URLSearchParams(new URL(mail.mock.calls[0][0].resetUrl).hash.slice(1)).get('token');
    expect(()=>reset.inspectPasswordReset(token)).toThrow();expect(auth.getAdminSession('reset-fixture-ro')).toBeTruthy();
    expect(db.prepare('SELECT password_hash FROM admin_users WHERE id=?').get(ids.ro).password_hash===oldHash).toBe(true);
  });
  it('rejects changed account state and revokes links across deactivation/reactivation',async()=>{
    let token=await issue();db.prepare("UPDATE admin_users SET email='changed@example.invalid' WHERE id=?").run(ids.ro);expect(()=>reset.inspectPasswordReset(token)).toThrow();
    db.prepare("UPDATE admin_users SET email='ro@example.invalid' WHERE id=?").run(ids.ro);
    const actor=auth.getAdminSession('reset-fixture-owner');
    await auth.updateAdminUser(ids.ro,{active:false},actor);await auth.updateAdminUser(ids.ro,{active:true},actor);
    expect(()=>reset.inspectPasswordReset(token)).toThrow();
    ageRequests();token=await issue();db.prepare('UPDATE admin_users SET active=0 WHERE id=?').run(ids.owner);expect(()=>reset.inspectPasswordReset(token)).toThrow();
  });
  it('allows only one concurrent completion and preserves completed reset on notice failure',async()=>{
    const token=await issue();mail.mockResolvedValue({success:false});
    const responses=await Promise.all([complete(req({action:'complete',token,password:replacement,confirmation:replacement},'missing')),complete(req({action:'complete',token,password:replacement,confirmation:replacement},'missing'))]);
    expect(responses.map(r=>r.status).sort()).toEqual([200,400]);
    expect(db.prepare("SELECT count(*) AS n FROM admin_audit_log WHERE action='admin_password_reset.notice_failed'").get().n).toBe(1);
    expect(await auth.verifyAdminLogin('ro@example.invalid',replacement)).toBeTruthy();
  });
  it('invalidates outstanding links after a manual password change or email edit',async()=>{
    const actor=auth.getAdminSession('reset-fixture-owner');
    let token=await issue();
    await auth.updateAdminUser(ids.ro,{password:replacement},actor);
    expect(()=>reset.inspectPasswordReset(token)).toThrow();
    ageRequests();token=await issue();
    await auth.updateAdminUser(ids.ro,{email:'new-ro@example.invalid'},actor);
    expect(()=>reset.inspectPasswordReset(token)).toThrow();
  });
  it('enforces the Owner hourly limit across different target accounts',async()=>{
    const now=Date.now();
    for(let i=0;i<20;i++)db.prepare(`INSERT INTO admin_password_resets
      (admin_user_id,requested_by,token_hash,account_fingerprint,created_at,expires_at) VALUES (?,?,?,?,?,?)`)
      .run(ids.observer,ids.owner,'rate-fixture-'+i,'unused',now-120000,now+1800000);
    expect((await send(req({id:ids.ro}))).status).toBe(429);expect(mail).not.toHaveBeenCalled();
  });
  it('revalidates account state after asynchronous password hashing',async()=>{
    const token=await issue();
    const pending=reset.completePasswordReset(token,replacement,replacement);
    db.prepare('UPDATE admin_users SET active=0 WHERE id=?').run(ids.ro);
    await expect(pending).rejects.toThrow('invalid or has expired');
    expect(db.prepare('SELECT password_hash FROM admin_users WHERE id=?').get(ids.ro).password_hash===oldHash).toBe(true);
    expect(db.prepare('SELECT used_at FROM admin_password_resets').get().used_at).toBeNull();
  });
  it('rate limits token requests separately from login',async()=>{
    db.prepare('INSERT INTO email_rate_limits(email,attempt_count,reset_time) VALUES (?,?,?)').run('password-reset:ip:direct',100,new Date(Date.now()+3600000).toISOString());
    // Use the implementation-resolved key rather than trust forwarded headers.
    const key='password-reset:ip:'+auth.getTrustedRequestIp(req({}));
    db.prepare('DELETE FROM email_rate_limits').run();db.prepare('INSERT INTO email_rate_limits(email,attempt_count,reset_time) VALUES (?,?,?)').run(key,100,new Date(Date.now()+3600000).toISOString());
    expect((await complete(req({action:'inspect',token:'invalid'},'missing'))).status).toBe(429);
    expect(db.prepare('SELECT count(*) AS n FROM admin_login_attempts').get().n).toBe(0);
  });
});


async function publicRequest(email: string, flush=true) {
  const response = await requestReset(req({email}, 'missing', true, '/request'));
  if (flush) await flushBackground();
  return response;
}
async function flushBackground() { while (background.length) await background.shift()!(); }
function mailedToken() { return new URLSearchParams(new URL(mail.mock.calls.at(-1)[0].resetUrl).hash.slice(1)).get('token')!; }

describe('Self-service password recovery', () => {
  it('responds before account lookup or delivery, identically for active, inactive and unknown accounts', async () => {
    const replies=[];
    for (const email of ['ro@example.invalid','inactive@example.invalid','missing@example.invalid']) {
      const response=await publicRequest(email,false);
      expect(response.status).toBe(200);replies.push(await response.json());
    }
    expect(replies[0]).toEqual(replies[1]);expect(replies[0]).toEqual(replies[2]);
    expect(mail).not.toHaveBeenCalled();expect(db.prepare('SELECT count(*) AS n FROM admin_password_resets').get().n).toBe(0);
    await flushBackground();expect(mail).toHaveBeenCalledTimes(1);
    expect(mail.mock.calls[0][0].selfService).toBe(true);
    expect(db.prepare('SELECT requested_by FROM admin_password_resets').get().requested_by).toBeNull();
    expect(db.prepare("SELECT admin_user_id FROM admin_audit_log WHERE action='admin_password_reset.self_request'").get().admin_user_id).toBeNull();
  });
  it('allows every active role including Owner to recover without role or assignment changes', async () => {
    const teams=JSON.stringify(db.prepare('SELECT * FROM election_team_members').all());
    for (const name of ['owner','ro','admin','observer']) {
      const before=db.prepare('SELECT * FROM admin_users WHERE id=?').get(ids[name]);
      expect((await publicRequest('  '+name.toUpperCase()+'@EXAMPLE.INVALID  ')).status).toBe(200);
      const token=mailedToken();
      expect(db.prepare('SELECT * FROM admin_users WHERE id=?').get(ids[name])).toEqual(before);
      const result=await complete(req({action:'complete',token,password:replacement,confirmation:replacement},'missing'));
      expect(result.status).toBe(200);
      const after=db.prepare('SELECT * FROM admin_users WHERE id=?').get(ids[name]);
      expect(after.authority_role).toBe(before.authority_role);expect(after.active).toBe(before.active);
      expect(auth.getAdminSession('reset-fixture-'+name)).toBeNull();
      expect(await auth.verifyAdminLogin(name+'@example.invalid',replacement)).toBeTruthy();
    }
    expect(JSON.stringify(db.prepare('SELECT * FROM election_team_members').all())).toBe(teams);
  });
  it('rejects CSRF, malformed and oversized email input without scheduling delivery', async () => {
    expect((await requestReset(req({email:'ro@example.invalid'},'missing',false))).status).toBe(403);
    for (const email of ['',null,7,'invalid','x'.repeat(260)+'@example.invalid']) expect((await requestReset(req({email},'missing'))).status).toBe(400);
    expect(background.length).toBe(0);expect(mail).not.toHaveBeenCalled();
  });
  it('keeps older links valid through repeated requests but consumes all links on completion', async () => {
    const original=await issue();ageRequests();
    await publicRequest('ro@example.invalid');const newer=mailedToken();
    expect(reset.inspectPasswordReset(original)).toBeTruthy();expect(reset.inspectPasswordReset(newer)).toBeTruthy();
    await reset.completePasswordReset(original,replacement,replacement);
    expect(()=>reset.inspectPasswordReset(original)).toThrow();expect(()=>reset.inspectPasswordReset(newer)).toThrow();
  });
  it('revokes failed deliveries, does not expose failure or disturb another valid link', async () => {
    const original=await issue();ageRequests();mail.mockResolvedValue({success:false});
    const response=await publicRequest('ro@example.invalid');const failed=mailedToken();
    expect(response.status).toBe(200);expect((await response.json()).success).toBe(true);
    expect(()=>reset.inspectPasswordReset(failed)).toThrow();expect(reset.inspectPasswordReset(original)).toBeTruthy();
    expect(auth.getAdminSession('reset-fixture-ro')).toBeTruthy();
  });
  it('limits IP, address and global requests without changing the public response or login counters', async () => {
    const email='ro@example.invalid';
    const normal=await (await publicRequest('missing@example.invalid')).json();
    const keys=[['password-reset-request:ip:'+auth.getTrustedRequestIp(req({})),20],
      ['password-reset-request:email:'+crypto.createHash('sha256').update(email).digest('hex'),5],
      ['password-reset-request:global',200]];
    for (const [key,limit] of keys) {
      db.prepare('DELETE FROM email_rate_limits').run();
      db.prepare('INSERT INTO email_rate_limits(email,attempt_count,reset_time) VALUES (?,?,?)').run(key,limit,new Date(Date.now()+3600000).toISOString());
      const response=await publicRequest(email);expect(response.status).toBe(200);expect(await response.json()).toEqual(normal);
    }
    expect(mail).not.toHaveBeenCalled();expect(db.prepare('SELECT count(*) AS n FROM admin_login_attempts').get().n).toBe(0);
  });
  it('atomically limits concurrent requests and enforces account cooldown across assisted and public requests', async () => {
    await Promise.all(Array.from({length:8},()=>publicRequest('ro@example.invalid',false)));
    await Promise.all(background.splice(0).map(fn=>fn()));
    expect(mail).toHaveBeenCalledTimes(1);
    expect((await send(req({id:ids.ro}))).status).toBe(429);
    expect(db.prepare('SELECT count(*) AS n FROM admin_password_resets').get().n).toBe(1);
  });
  it('self-service links are independent of another Owner but invalidated by target changes', async () => {
    await publicRequest('ro@example.invalid');const token=mailedToken();
    db.prepare('UPDATE admin_users SET active=0 WHERE id=?').run(ids.owner);
    expect(reset.inspectPasswordReset(token)).toBeTruthy();
    db.prepare('UPDATE admin_users SET active=0 WHERE id=?').run(ids.ro);
    expect(()=>reset.inspectPasswordReset(token)).toThrow();
  });
  it('preserves populated legacy reset records, indexes and sequence through idempotent migration', () => {
    const legacy=new Database(':memory:');legacy.pragma('foreign_keys=ON');
    legacy.exec(`CREATE TABLE admin_users(id INTEGER PRIMARY KEY); INSERT INTO admin_users VALUES(1),(2);
      CREATE TABLE admin_password_resets(id INTEGER PRIMARY KEY AUTOINCREMENT, admin_user_id INTEGER NOT NULL REFERENCES admin_users(id),
      requested_by INTEGER NOT NULL REFERENCES admin_users(id), token_hash TEXT NOT NULL UNIQUE, account_fingerprint TEXT NOT NULL,
      created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, used_at INTEGER, revoked_at INTEGER);
      CREATE INDEX idx_password_resets_user ON admin_password_resets(admin_user_id,created_at);
      CREATE INDEX idx_password_resets_actor ON admin_password_resets(requested_by,created_at);
      INSERT INTO admin_password_resets VALUES(4,2,1,'hash','fingerprint',1,2,NULL,NULL);
      UPDATE sqlite_sequence SET seq=99 WHERE name='admin_password_resets';`);
    const before=legacy.prepare('SELECT * FROM admin_password_resets').all();
    migrate(legacy);migrate(legacy);
    expect(legacy.prepare('SELECT * FROM admin_password_resets').all()).toEqual(before);
    expect(legacy.prepare("SELECT seq FROM sqlite_sequence WHERE name='admin_password_resets'").get()).toEqual({seq:99});
    expect(legacy.pragma('foreign_key_check')).toEqual([]);
    expect(legacy.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='index' AND name LIKE 'idx_password_resets_%'").get()).toEqual({n:2});
    expect(legacy.prepare("INSERT INTO admin_password_resets(admin_user_id,requested_by,token_hash,account_fingerprint,created_at,expires_at) VALUES(1,NULL,'next','fp',1,2)").run().lastInsertRowid).toBe(100);
    legacy.close();
  });
});
