import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'votekit-admin-roles-'));
const databasePath = path.join(tmpDir, 'test.db');
process.env.DATABASE_PATH = databasePath;
process.env.ADMIN_EMAIL = 'bootstrap@example.com';
process.env.ADMIN_PASSWORD = 'correct horse battery staple';
process.env.VOTEKIT_PUBLIC_URL = 'http://localhost:3000';

// Reproduce the v0.2.3 role constraint so this test also proves the production
// migration promotes the existing primary administrator without losing data.
const legacy = new Database(databasePath);
legacy.exec(`
  CREATE TABLE admin_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    name TEXT,
    password_hash TEXT NOT NULL,
    role TEXT CHECK(role IN ('admin', 'observer')) NOT NULL DEFAULT 'observer',
    active BOOLEAN DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_login_at DATETIME NULL
  );
  INSERT INTO admin_users (email, name, password_hash, role, active)
  VALUES ('jud@example.com', 'Jud', 'legacy-hash', 'admin', 1);
`);
legacy.close();

let db: any;
let auth: typeof import('@/lib/auth');

beforeAll(async () => {
  db = (await import('@/lib/db')).default;
  auth = await import('@/lib/auth');
});

afterAll(() => {
  try { db.close(); } catch {}
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function sessionFor(email: string): import('@/lib/auth').AdminSession {
  const user = db.prepare('SELECT * FROM admin_users WHERE email = ?').get(email);
  return {
    isAdmin: true,
    adminUserId: user.id,
    email: user.email,
    name: user.name,
    role: user.authority_role || user.role
  };
}

describe('administrative role hierarchy and invitations', () => {
  it('promotes the existing primary admin to protected Owner during migration', () => {
    const owner = db.prepare('SELECT email, role, authority_role, active FROM admin_users WHERE id = 1').get();
    expect(owner).toMatchObject({ email: 'jud@example.com', role: 'admin', authority_role: 'owner', active: 1 });
    expect(db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'admin_users'").get().sql)
      .toContain("'returning_officer'");
    expect(db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'sessions'").get().sql)
      .not.toContain("'returning_officer'");
    expect(db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'election_team_members'").get().sql)
      .toContain("UNIQUE(plebiscite_id, admin_user_id)");
    expect(db.prepare('PRAGMA table_info(admin_invitations)').all().some((column: any) => column.name === 'plebiscite_id')).toBe(true);
    expect(db.pragma('foreign_key_check')).toEqual([]);
    expect(auth.listAdminUsers()[0]).toMatchObject({ email: 'jud@example.com', role: 'owner' });
  });

  it('stores only a hash of a single-use invitation and accepts it once', async () => {
    const owner = sessionFor('jud@example.com');
    const created = await auth.createAdminInvitation({
      email: 'returning@example.com',
      name: 'Returning Officer',
      role: 'returning_officer'
    }, owner);

    const stored = db.prepare('SELECT token_hash FROM admin_invitations WHERE id = ?').get(created.invitation.id);
    expect(stored.token_hash).not.toBe(created.token);
    expect(stored.token_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(auth.getAdminInvitationByToken(created.token)?.email).toBe('returning@example.com');

    const user = await auth.acceptAdminInvitation(created.token, 'a long unique election password');
    expect(user.role).toBe('returning_officer');
    expect(user.active).toBe(true);
    expect(auth.getAdminInvitationByToken(created.token)).toBeNull();
    await expect(auth.acceptAdminInvitation(created.token, 'a long unique election password'))
      .rejects.toThrow('invalid or has expired');
  });

  it('separates organisation authority from election-specific Admin and Observer access', async () => {
    const owner = sessionFor('jud@example.com');
    const returningOfficer = sessionFor('returning@example.com');

    await expect(auth.createAdminInvitation({
      email: 'second-ro@example.com',
      role: 'returning_officer'
    }, returningOfficer)).rejects.toThrow('Only an Owner');

    const electionId = Number(db.prepare(`INSERT INTO plebiscites
      (slug, title, description, open_date, close_date, status, created_by_admin_user_id)
      VALUES ('scoped-access', 'Scoped Access', 'desc', '2026-01-01', '2030-01-01', 'draft', ?)`
    ).run(returningOfficer.adminUserId).lastInsertRowid);
    db.prepare(`INSERT INTO election_team_members (plebiscite_id, admin_user_id, role, assigned_by_admin_user_id)
      VALUES (?, ?, 'returning_officer', ?)`
    ).run(electionId, returningOfficer.adminUserId, returningOfficer.adminUserId);

    const adminInvite = await auth.createAdminInvitation({
      email: 'admin@example.com',
      role: 'admin',
      plebisciteId: electionId
    }, returningOfficer);
    await auth.acceptAdminInvitation(adminInvite.token, 'another long unique password');
    const admin = sessionFor('admin@example.com');

    await expect(auth.createAdminInvitation({
      email: 'observer@example.com',
      role: 'observer',
      plebisciteId: electionId
    }, admin)).rejects.toThrow('permission');

    expect(auth.getElectionRole(admin, electionId)).toBe('admin');
    const unrelatedElectionId = Number(db.prepare(`INSERT INTO plebiscites
      (slug, title, description, open_date, close_date, status)
      VALUES ('unrelated', 'Unrelated', 'desc', '2026-01-01', '2030-01-01', 'draft')`).run().lastInsertRowid);
    expect(auth.canAccessElection(admin, unrelatedElectionId)).toBe(false);
    expect(auth.canAccessElection(owner, unrelatedElectionId)).toBe(true);
    expect(auth.canManageElectionTeam(admin, electionId)).toBe(false);

    const adminSessionId = auth.createAdminSession({ id: admin.adminUserId, email: admin.email, role: admin.role });
    const plebiscitesGet = (await import('@/app/api/admin/plebiscites/route')).GET;
    const votersGet = (await import('@/app/api/admin/voters/route')).GET;
    const scopedList = await plebiscitesGet(new NextRequest('http://localhost/api/admin/plebiscites', {
      headers: { cookie: `admin-session=${adminSessionId}` }
    }));
    expect(scopedList.status).toBe(200);
    expect((await scopedList.json()).plebiscites.map((election: any) => election.id)).toEqual([electionId]);
    const unrelatedVoters = await votersGet(new NextRequest(`http://localhost/api/admin/voters?plebiscite_id=${unrelatedElectionId}`, {
      headers: { cookie: `admin-session=${adminSessionId}` }
    }));
    expect(unrelatedVoters.status).toBe(403);

    await expect(auth.updateAdminUser(returningOfficer.adminUserId, { active: false }, returningOfficer))
      .rejects.toThrow('permission');
    await auth.updateAdminUser(returningOfficer.adminUserId, { active: false }, owner);
    expect(db.prepare('SELECT active FROM admin_users WHERE id = ?').get(returningOfficer.adminUserId).active).toBe(0);
  });

  it('does not allow the Owner account to be demoted or deactivated', async () => {
    const owner = sessionFor('jud@example.com');
    await expect(auth.updateAdminUser(owner.adminUserId, { role: 'admin' }, owner))
      .rejects.toThrow('permission');
    await expect(auth.updateAdminUser(owner.adminUserId, { active: false }, owner))
      .rejects.toThrow('permission');
    expect(db.prepare('SELECT role, authority_role, active FROM admin_users WHERE id = ?').get(owner.adminUserId))
      .toMatchObject({ role: 'admin', authority_role: 'owner', active: 1 });
  });
});
