import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, expect, it, vi } from 'vitest';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'votekit-role-restart-'));
process.env.DATABASE_PATH = path.join(directory, 'elections.db');
let db: any;
afterAll(() => { db?.close(); fs.rmSync(directory, { recursive: true, force: true }); });

it('preserves explicit election scopes and revoked assignments across database startup', async () => {
  db = (await import('@/lib/db')).default;
  const owner = Number(db.prepare("INSERT INTO admin_users(email,password_hash,role,authority_role) VALUES ('owner@example.invalid','unused','admin','owner')").run().lastInsertRowid);
  const observer = Number(db.prepare("INSERT INTO admin_users(email,password_hash,role,authority_role) VALUES ('observer@example.invalid','unused','observer','observer')").run().lastInsertRowid);
  const manager = Number(db.prepare("INSERT INTO admin_users(email,password_hash,role,authority_role) VALUES ('manager@example.invalid','unused','admin','admin')").run().lastInsertRowid);
  const unassigned = Number(db.prepare("INSERT INTO admin_users(email,password_hash,role,authority_role) VALUES ('unassigned@example.invalid','unused','observer','observer')").run().lastInsertRowid);
  const first = Number(db.prepare("INSERT INTO plebiscites(slug,title,description,open_date,close_date) VALUES ('first','First','','2099-01-01','2099-01-02')").run().lastInsertRowid);
  const second = Number(db.prepare("INSERT INTO plebiscites(slug,title,description,open_date,close_date) VALUES ('second','Second','','2099-01-01','2099-01-02')").run().lastInsertRowid);
  const grant = db.prepare('INSERT INTO election_team_members(plebiscite_id,admin_user_id,role,assigned_by_admin_user_id) VALUES (?,?,?,?)');
  grant.run(first, observer, 'observer', owner);
  grant.run(second, observer, 'observer', owner);
  grant.run(second, manager, 'admin', owner);
  db.prepare('DELETE FROM election_team_members WHERE plebiscite_id = ? AND admin_user_id = ?').run(second, observer);
  const before = db.prepare('SELECT * FROM election_team_members ORDER BY id').all();
  db.close();
  vi.resetModules();
  db = (await import('@/lib/db')).default;
  expect(db.prepare('SELECT * FROM election_team_members ORDER BY id').all()).toEqual(before);
  const auth = await import('@/lib/auth');
  const session = (id: number, role: 'admin' | 'observer') => ({ adminUserId: id, role, isAdmin: true as const, email: 'test@example.invalid', name: null });
  expect(auth.listAccessibleElectionIds(session(observer, 'observer'))).toEqual([first]);
  expect(auth.listAccessibleElectionIds(session(manager, 'admin'))).toEqual([second]);
  expect(auth.listAccessibleElectionIds(session(unassigned, 'observer'))).toEqual([]);
});
