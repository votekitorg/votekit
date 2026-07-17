import { cookies } from 'next/headers';
import { NextRequest } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import * as bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import db, { cleanupExpiredSessions } from './db';

export type AdminRole = 'owner' | 'returning_officer' | 'admin' | 'observer';

export const ADMIN_ROLE_LABELS: Record<AdminRole, string> = {
  owner: 'Owner',
  returning_officer: 'Returning Officer',
  admin: 'Admin',
  observer: 'Observer'
};

const ELECTION_MANAGEMENT_ROLES: AdminRole[] = ['owner', 'returning_officer', 'admin'];

export interface Session {
  email: string;
  plebisciteId: number;
  isAdmin?: boolean;
}

export interface AdminSession {
  isAdmin: true;
  adminUserId: number;
  email: string;
  name: string | null;
  role: AdminRole;
}

export interface AdminUser {
  id: number;
  email: string;
  name: string | null;
  role: AdminRole;
  active: boolean;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
}

export interface AdminInvitation {
  id: number;
  email: string;
  name: string | null;
  role: Exclude<AdminRole, 'owner'>;
  expires_at: string;
  created_at: string;
  invited_by_name: string | null;
  invited_by_email: string;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isAdminRole(role: string): role is AdminRole {
  return role === 'owner' || role === 'returning_officer' || role === 'admin' || role === 'observer';
}

export function canManageElections(role: AdminRole): boolean {
  return ELECTION_MANAGEMENT_ROLES.includes(role);
}

export function canManageUsers(role: AdminRole): boolean {
  return role === 'owner' || role === 'returning_officer';
}

export function canAssignRole(actorRole: AdminRole, targetRole: AdminRole): boolean {
  if (targetRole === 'owner') return false;
  if (actorRole === 'owner') return true;
  return actorRole === 'returning_officer' && (targetRole === 'admin' || targetRole === 'observer');
}

export function canManageUserRole(actorRole: AdminRole, targetRole: AdminRole): boolean {
  return canAssignRole(actorRole, targetRole);
}

function legacyRoleForAuthority(role: AdminRole): 'admin' | 'observer' {
  return role === 'observer' ? 'observer' : 'admin';
}

function publicAdminUser(user: any): AdminUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: isAdminRole(user.authority_role || user.role) ? (user.authority_role || user.role) : 'observer',
    active: Boolean(user.active),
    created_at: user.created_at,
    updated_at: user.updated_at,
    last_login_at: user.last_login_at
  };
}

async function getLegacyAdminPasswordHash(): Promise<string> {
  const existing = db.prepare('SELECT value FROM admin_config WHERE key = ?').get('admin_password_hash') as { value: string } | undefined;
  if (existing) return existing.value;

  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    throw new Error('ADMIN_PASSWORD environment variable not set');
  }

  const hashedPassword = await bcrypt.hash(adminPassword, 12);
  db.prepare('INSERT OR REPLACE INTO admin_config (key, value) VALUES (?, ?)').run('admin_password_hash', hashedPassword);
  return hashedPassword;
}

async function ensureBootstrapAdminUser(): Promise<void> {
  const count = db.prepare('SELECT COUNT(*) as count FROM admin_users').get() as { count: number };
  if (count.count > 0) return;

  const email = normalizeEmail(process.env.ADMIN_EMAIL || 'admin@votekit.local');
  const passwordHash = await getLegacyAdminPasswordHash();

  db.prepare(`
    INSERT INTO admin_users (email, name, password_hash, role, authority_role, active)
    VALUES (?, ?, ?, 'admin', 'owner', 1)
  `).run(email, 'VoteKit Owner', passwordHash);
}

// Backwards-compatible password-only check used by older tests/scripts.
export async function verifyAdminPassword(password: string): Promise<boolean> {
  try {
    await ensureBootstrapAdminUser();
    const user = db.prepare(`
      SELECT * FROM admin_users
      WHERE role = 'admin' AND active = 1
      ORDER BY id ASC
      LIMIT 1
    `).get() as any | undefined;

    if (!user) return false;
    return await bcrypt.compare(password, user.password_hash);
  } catch (error) {
    console.error('Admin password verification error:', error);
    return false;
  }
}

export async function verifyAdminLogin(email: string, password: string): Promise<AdminUser | null> {
  try {
    await ensureBootstrapAdminUser();
    const normalizedEmail = normalizeEmail(email);
    const user = db.prepare('SELECT * FROM admin_users WHERE email = ? AND active = 1').get(normalizedEmail) as any | undefined;
    if (!user) return null;

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return null;

    db.prepare('UPDATE admin_users SET last_login_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);
    return publicAdminUser({ ...user, last_login_at: new Date().toISOString() });
  } catch (error) {
    console.error('Admin login verification error:', error);
    return null;
  }
}

export async function createAdminUser(input: { email: string; password: string; name?: string; role: AdminRole }): Promise<AdminUser> {
  await ensureBootstrapAdminUser();

  if (typeof input.email !== 'string') throw new Error('A valid email address is required');
  if (typeof input.password !== 'string') throw new Error('Password must be between 12 and 128 characters');
  if (input.name !== undefined && typeof input.name !== 'string') throw new Error('Name must be text');

  const email = normalizeEmail(input.email);
  if (!email || email.length > 254 || !/^\S+@\S+\.\S+$/.test(email)) {
    throw new Error('A valid email address is required');
  }
  if (!input.password || input.password.length < 12 || input.password.length > 128) {
    throw new Error('Password must be between 12 and 128 characters');
  }
  if (!isAdminRole(input.role)) {
    throw new Error('Invalid admin role');
  }

  const passwordHash = await bcrypt.hash(input.password, 12);
  const result = db.prepare(`
    INSERT INTO admin_users (email, name, password_hash, role, authority_role, active)
    VALUES (?, ?, ?, ?, ?, 1)
  `).run(email, input.name?.trim().slice(0, 200) || null, passwordHash, legacyRoleForAuthority(input.role), input.role);

  const user = db.prepare('SELECT * FROM admin_users WHERE id = ?').get(result.lastInsertRowid) as any;
  return publicAdminUser(user);
}

export async function updateAdminUser(
  id: number,
  input: { email?: string; name?: string; role?: AdminRole; active?: boolean; password?: string },
  actor: AdminSession
): Promise<AdminUser> {
  await ensureBootstrapAdminUser();

  if (input.email !== undefined && typeof input.email !== 'string') throw new Error('Email must be text');
  if (input.name !== undefined && typeof input.name !== 'string') throw new Error('Name must be text');
  if (input.active !== undefined && typeof input.active !== 'boolean') throw new Error('Active must be true or false');
  if (input.password !== undefined && typeof input.password !== 'string') throw new Error('Password must be text');

  const existing = db.prepare('SELECT * FROM admin_users WHERE id = ?').get(id) as any | undefined;
  if (!existing) throw new Error('Admin user not found');

  const existingRole = isAdminRole(existing.authority_role || existing.role) ? (existing.authority_role || existing.role) : 'observer';
  if (!canManageUserRole(actor.role, existingRole)) {
    throw new Error('You do not have permission to manage this account');
  }
  if (id === actor.adminUserId && (input.role !== undefined || input.active === false)) {
    throw new Error('You cannot change your own role or deactivate your own account');
  }
  if (existingRole === 'owner' && (input.role !== undefined || input.active === false)) {
    throw new Error('Owner access can only be changed through a formal ownership transfer');
  }
  if (input.role !== undefined && !canAssignRole(actor.role, input.role)) {
    throw new Error('You cannot assign that role');
  }

  const removesActiveOwner = existingRole === 'owner' && Boolean(existing.active) &&
    (input.role !== 'owner' || input.active === false);
  if (removesActiveOwner) {
    const activeOwners = db.prepare("SELECT COUNT(*) AS count FROM admin_users WHERE authority_role = 'owner' AND active = 1")
      .get() as { count: number };
    if (activeOwners.count <= 1) throw new Error('At least one active Owner account is required');
  }

  const fields: string[] = [];
  const values: any[] = [];

  if (input.email !== undefined) {
    const email = normalizeEmail(input.email);
    if (email.length > 254 || !/^\S+@\S+\.\S+$/.test(email)) throw new Error('A valid email address is required');
    fields.push('email = ?');
    values.push(email);
  }

  if (input.name !== undefined) {
    fields.push('name = ?');
    values.push(input.name.trim().slice(0, 200) || null);
  }

  if (input.role !== undefined) {
    if (!isAdminRole(input.role)) throw new Error('Invalid admin role');
    fields.push('role = ?', 'authority_role = ?');
    values.push(legacyRoleForAuthority(input.role), input.role);
  }

  if (input.active !== undefined) {
    fields.push('active = ?');
    values.push(input.active ? 1 : 0);
  }

  if (input.password !== undefined && input.password !== '') {
    if (input.password.length < 12 || input.password.length > 128) throw new Error('Password must be between 12 and 128 characters');
    fields.push('password_hash = ?');
    values.push(await bcrypt.hash(input.password, 12));
  }

  if (fields.length > 0) {
    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);
    db.prepare(`UPDATE admin_users SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  }

  if (input.password || input.role !== undefined || input.active === false) {
    db.prepare('DELETE FROM sessions WHERE admin_user_id = ?').run(id);
  }

  const user = db.prepare('SELECT * FROM admin_users WHERE id = ?').get(id) as any;
  return publicAdminUser(user);
}

export function listAdminUsers(): AdminUser[] {
  const users = db.prepare(`
    SELECT id, email, name, role, authority_role, active, created_at, updated_at, last_login_at
    FROM admin_users
    ORDER BY CASE authority_role
      WHEN 'owner' THEN 0
      WHEN 'returning_officer' THEN 1
      WHEN 'admin' THEN 2
      ELSE 3 END,
      email ASC
  `).all() as any[];
  return users.map(publicAdminUser);
}

function publicAdminInvitation(invitation: any): AdminInvitation {
  return {
    id: invitation.id,
    email: invitation.email,
    name: invitation.name,
    role: invitation.role,
    expires_at: invitation.expires_at,
    created_at: invitation.created_at,
    invited_by_name: invitation.invited_by_name ?? null,
    invited_by_email: invitation.invited_by_email
  };
}

function invitationTokenHash(token: string): string {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}

function validateInvitationRole(role: AdminRole): asserts role is Exclude<AdminRole, 'owner'> {
  if (role === 'owner' || !isAdminRole(role)) throw new Error('Invalid invitation role');
}

export async function createAdminInvitation(input: {
  email: string;
  name?: string;
  role: AdminRole;
}, actor: AdminSession): Promise<{ invitation: AdminInvitation; token: string }> {
  await ensureBootstrapAdminUser();
  if (!canManageUsers(actor.role)) throw new Error('You do not have permission to invite users');
  if (typeof input.email !== 'string') throw new Error('A valid email address is required');
  if (input.name !== undefined && typeof input.name !== 'string') throw new Error('Name must be text');
  validateInvitationRole(input.role);
  if (!canAssignRole(actor.role, input.role)) throw new Error('You cannot assign that role');

  const email = normalizeEmail(input.email);
  if (!email || email.length > 254 || !/^\S+@\S+\.\S+$/.test(email)) {
    throw new Error('A valid email address is required');
  }

  const existing = db.prepare('SELECT id, role, authority_role, active FROM admin_users WHERE email = ?').get(email) as
    { id: number; role: 'admin' | 'observer'; authority_role: AdminRole | null; active: number } | undefined;
  if (existing?.active) throw new Error('An active account with that email already exists');
  const existingAuthority = existing?.authority_role || existing?.role;
  if (existingAuthority && !canManageUserRole(actor.role, existingAuthority)) {
    throw new Error('You do not have permission to reactivate this account');
  }

  const token = crypto.randomBytes(32).toString('base64url');
  const tokenHash = invitationTokenHash(token);
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

  const create = db.transaction(() => {
    db.prepare(`
      UPDATE admin_invitations SET revoked_at = CURRENT_TIMESTAMP
      WHERE email = ? AND accepted_at IS NULL AND revoked_at IS NULL
    `).run(email);
    return db.prepare(`
      INSERT INTO admin_invitations
        (email, name, role, token_hash, expires_at, invited_by_admin_user_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(email, input.name?.trim().slice(0, 200) || null, input.role, tokenHash, expiresAt, actor.adminUserId);
  });

  const result = create();
  const invitation = db.prepare(`
    SELECT i.*, u.name AS invited_by_name, u.email AS invited_by_email
    FROM admin_invitations i
    JOIN admin_users u ON u.id = i.invited_by_admin_user_id
    WHERE i.id = ?
  `).get(result.lastInsertRowid) as any;

  return { invitation: publicAdminInvitation(invitation), token };
}

export function listPendingAdminInvitations(actor: AdminSession): AdminInvitation[] {
  if (!canManageUsers(actor.role)) return [];
  const rows = db.prepare(`
    SELECT i.*, u.name AS invited_by_name, u.email AS invited_by_email
    FROM admin_invitations i
    JOIN admin_users u ON u.id = i.invited_by_admin_user_id
    WHERE i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.expires_at > ?
    ORDER BY i.created_at DESC
  `).all(new Date().toISOString()) as any[];
  return rows.filter(row => canManageUserRole(actor.role, row.role)).map(publicAdminInvitation);
}

export function getAdminInvitationByToken(token: string): AdminInvitation | null {
  if (typeof token !== 'string' || token.length < 40 || token.length > 128) return null;
  const row = db.prepare(`
    SELECT i.*, u.name AS invited_by_name, u.email AS invited_by_email
    FROM admin_invitations i
    JOIN admin_users u ON u.id = i.invited_by_admin_user_id
    WHERE i.token_hash = ? AND i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.expires_at > ?
  `).get(invitationTokenHash(token), new Date().toISOString()) as any | undefined;
  return row ? publicAdminInvitation(row) : null;
}

export async function acceptAdminInvitation(token: string, password: string): Promise<AdminUser> {
  const invitation = getAdminInvitationByToken(token);
  if (!invitation) throw new Error('This invitation is invalid or has expired');
  if (typeof password !== 'string' || password.length < 12 || password.length > 128) {
    throw new Error('Password must be between 12 and 128 characters');
  }
  const passwordHash = await bcrypt.hash(password, 12);
  const tokenHash = invitationTokenHash(token);

  const accept = db.transaction(() => {
    const current = db.prepare(`
      SELECT * FROM admin_invitations
      WHERE token_hash = ? AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > ?
    `).get(tokenHash, new Date().toISOString()) as any | undefined;
    if (!current) throw new Error('This invitation is invalid or has expired');

    const existing = db.prepare('SELECT * FROM admin_users WHERE email = ?').get(current.email) as any | undefined;
    let userId: number;
    if (existing) {
      if (existing.active) throw new Error('This account is already active');
      db.prepare(`
        UPDATE admin_users
        SET name = ?, password_hash = ?, role = ?, authority_role = ?, active = 1,
            updated_at = CURRENT_TIMESTAMP, last_login_at = NULL
        WHERE id = ?
      `).run(current.name, passwordHash, legacyRoleForAuthority(current.role), current.role, existing.id);
      userId = existing.id;
    } else {
      const created = db.prepare(`
        INSERT INTO admin_users (email, name, password_hash, role, authority_role, active)
        VALUES (?, ?, ?, ?, ?, 1)
      `).run(current.email, current.name, passwordHash, legacyRoleForAuthority(current.role), current.role);
      userId = Number(created.lastInsertRowid);
    }

    const updated = db.prepare(`
      UPDATE admin_invitations
      SET accepted_at = CURRENT_TIMESTAMP, accepted_by_admin_user_id = ?
      WHERE id = ? AND accepted_at IS NULL AND revoked_at IS NULL
    `).run(userId, current.id);
    if (updated.changes !== 1) throw new Error('This invitation has already been used');

    db.prepare('DELETE FROM sessions WHERE admin_user_id = ?').run(userId);
    return db.prepare('SELECT * FROM admin_users WHERE id = ?').get(userId) as any;
  });

  const user = publicAdminUser(accept());
  recordAdminAuditLog({
    adminUserId: user.id,
    action: 'admin_invitation.accept',
    targetType: 'admin_user',
    targetId: user.id,
    details: { role: user.role }
  });
  return user;
}

export function revokeAdminInvitation(id: number, actor: AdminSession): AdminInvitation {
  const row = db.prepare(`
    SELECT i.*, u.name AS invited_by_name, u.email AS invited_by_email
    FROM admin_invitations i
    JOIN admin_users u ON u.id = i.invited_by_admin_user_id
    WHERE i.id = ? AND i.accepted_at IS NULL AND i.revoked_at IS NULL
  `).get(id) as any | undefined;
  if (!row) throw new Error('Pending invitation not found');
  if (!canManageUserRole(actor.role, row.role)) throw new Error('You cannot revoke this invitation');
  db.prepare('UPDATE admin_invitations SET revoked_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);
  return publicAdminInvitation(row);
}

export async function replaceAdminInvitation(id: number, actor: AdminSession): Promise<{ invitation: AdminInvitation; token: string }> {
  const row = db.prepare(`
    SELECT * FROM admin_invitations
    WHERE id = ? AND accepted_at IS NULL AND revoked_at IS NULL
  `).get(id) as any | undefined;
  if (!row) throw new Error('Pending invitation not found');
  if (!canManageUserRole(actor.role, row.role)) throw new Error('You cannot resend this invitation');
  return createAdminInvitation({ email: row.email, name: row.name || undefined, role: row.role }, actor);
}

export function requireAdminRole(session: AdminSession | null, allowed: AdminRole[] = ELECTION_MANAGEMENT_ROLES): AdminSession | null {
  if (!session) return null;
  return allowed.includes(session.role) ? session : null;
}

export function createAdminSession(adminUser: Pick<AdminUser, 'id' | 'email' | 'role'>): string {
  const sessionId = uuidv4();
  const expiresAt = new Date(Date.now() + (24 * 60 * 60 * 1000));

  db.prepare(`
    INSERT INTO sessions (id, email, plebiscite_id, is_admin, admin_user_id, admin_role, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(sessionId, adminUser.email, -1, 1, adminUser.id, legacyRoleForAuthority(adminUser.role), expiresAt.toISOString());

  return sessionId;
}

export function getAdminSession(sessionId?: string): AdminSession | null {
  if (!sessionId) return null;

  const session = db.prepare(`
    SELECT s.*, u.name, u.role, u.authority_role, u.active
    FROM sessions s
    LEFT JOIN admin_users u ON u.id = s.admin_user_id
    WHERE s.id = ? AND s.is_admin = 1
  `).get(sessionId) as any | undefined;

  if (!session) return null;

  if (new Date(session.expires_at) < new Date()) {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
    return null;
  }

  if (!session.admin_user_id || !session.active) {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
    return null;
  }

  const role = isAdminRole(session.authority_role || session.role || session.admin_role)
    ? (session.authority_role || session.role || session.admin_role)
    : 'observer';
  return {
    isAdmin: true,
    adminUserId: session.admin_user_id,
    email: session.email,
    name: session.name,
    role
  };
}

export async function setAdminCookie(sessionId: string) {
  const cookieStore = await cookies();
  cookieStore.set('admin-session', sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 24 * 60 * 60
  });
}

export async function getAdminSessionFromCookies(): Promise<AdminSession | null> {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get('admin-session')?.value;
  return getAdminSession(sessionId);
}

export async function clearAdminCookie() {
  const cookieStore = await cookies();
  cookieStore.delete('admin-session');
}

// Voter authentication (email verification based)
export function createVoterSession(email: string, plebisciteId: number): string {
  const sessionId = uuidv4();
  const expiresAt = new Date(Date.now() + (2 * 60 * 60 * 1000));

  db.prepare(`
    INSERT INTO sessions (id, email, plebiscite_id, is_admin, expires_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(sessionId, email, plebisciteId, 0, expiresAt.toISOString());

  return sessionId;
}

export function getVoterSession(sessionId?: string): Session | null {
  if (!sessionId) return null;

  const session = db.prepare(`
    SELECT * FROM sessions WHERE id = ? AND is_admin = FALSE
  `).get(sessionId) as {
    id: string;
    email: string;
    plebiscite_id: number;
    is_admin: boolean;
    expires_at: string;
  } | undefined;

  if (!session) return null;

  if (new Date(session.expires_at) < new Date()) {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
    return null;
  }

  return {
    email: session.email,
    plebisciteId: session.plebiscite_id
  };
}

export async function setVoterCookie(sessionId: string, plebisciteSlug: string) {
  const cookieStore = await cookies();
  cookieStore.set(`voter-session-${plebisciteSlug}`, sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 2 * 60 * 60
  });
}

export async function getVoterSessionFromCookies(plebisciteSlug: string): Promise<Session | null> {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(`voter-session-${plebisciteSlug}`)?.value;
  return getVoterSession(sessionId);
}

export async function clearVoterCookie(plebisciteSlug: string) {
  const cookieStore = await cookies();
  cookieStore.delete(`voter-session-${plebisciteSlug}`);
}

// Session cleanup (delegates to db.ts)
export { cleanupExpiredSessions };

// Admin brute force protection
const MAX_ADMIN_ATTEMPTS = 5;
const ADMIN_LOCKOUT_DURATION = 15 * 60 * 1000;

export function getTrustedRequestIp(request: NextRequest): string {
  // Only trust proxy-supplied client IPs when the deployment explicitly says a
  // known reverse proxy is in front of the app. Otherwise all clients share the
  // conservative direct bucket and per-email throttles carry the main load.
  if (process.env.TRUST_PROXY_HEADERS === 'true') {
    const forwarded = request.headers.get('x-forwarded-for');
    if (forwarded) {
      // The supported nginx config appends the socket peer to any incoming
      // header. Earlier values can be supplied by the client, so use the
      // right-most address observed by our trusted proxy.
      const clientIp = forwarded.split(',').map(value => value.trim()).filter(Boolean).pop();
      if (clientIp && clientIp.length <= 64) return clientIp;
    }
    const realIp = request.headers.get('x-real-ip');
    if (realIp && realIp.trim().length <= 64) return realIp.trim();
  }

  return 'direct';
}

export function getAdminRequestIp(request: NextRequest): string {
  return getTrustedRequestIp(request);
}

function adminLoginWhereClause(email: string, ipAddress: string): { clause: string; params: string[] } {
  const normalizedEmail = normalizeEmail(email);
  return {
    clause: '(email = ? OR ip_address = ?)',
    params: [normalizedEmail, ipAddress]
  };
}

export function checkAdminBruteForce(email: string, ipAddress: string): { blocked: boolean; remaining: number; lockedUntil?: Date } {
  const normalizedEmail = normalizeEmail(email);
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const now = new Date().toISOString();
  db.prepare('DELETE FROM admin_login_attempts WHERE attempted_at < ? AND locked_until IS NULL').run(hourAgo);

  const { clause, params } = adminLoginWhereClause(normalizedEmail, ipAddress);
  const lockoutRecord = db.prepare(`
    SELECT locked_until FROM admin_login_attempts
    WHERE ${clause} AND locked_until IS NOT NULL AND locked_until > ?
    ORDER BY locked_until DESC LIMIT 1
  `).get(...params, now) as { locked_until: string } | undefined;

  if (lockoutRecord) {
    return {
      blocked: true,
      remaining: 0,
      lockedUntil: new Date(lockoutRecord.locked_until)
    };
  }

  const recentAttempts = db.prepare(`
    SELECT COUNT(*) as count FROM admin_login_attempts
    WHERE ${clause} AND success = FALSE AND attempted_at > ?
  `).get(...params, hourAgo) as { count: number };

  return {
    blocked: recentAttempts.count >= MAX_ADMIN_ATTEMPTS,
    remaining: Math.max(0, MAX_ADMIN_ATTEMPTS - recentAttempts.count)
  };
}

export function recordAdminLoginAttempt(email: string, ipAddress: string, success: boolean): void {
  const normalizedEmail = normalizeEmail(email);
  const now = new Date().toISOString();
  let lockedUntil: string | null = null;

  if (!success) {
    const bruteCheck = checkAdminBruteForce(normalizedEmail, ipAddress);
    if (bruteCheck.remaining <= 1) {
      lockedUntil = new Date(Date.now() + ADMIN_LOCKOUT_DURATION).toISOString();
    }
  }

  db.prepare(`
    INSERT INTO admin_login_attempts (email, ip_address, success, attempted_at, locked_until)
    VALUES (?, ?, ?, ?, ?)
  `).run(normalizedEmail, ipAddress, success ? 1 : 0, now, lockedUntil);

  if (success) {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    db.prepare('DELETE FROM admin_login_attempts WHERE email = ? AND ip_address = ? AND success = 1 AND attempted_at < ?')
      .run(normalizedEmail, ipAddress, weekAgo);
  }
}

export function clearAdminFailedAttempts(email: string, ipAddress: string): void {
  db.prepare('DELETE FROM admin_login_attempts WHERE (email = ? OR ip_address = ?) AND success = FALSE')
    .run(normalizeEmail(email), ipAddress);
}


// Voter verification brute-force protection
const MAX_VOTER_VERIFY_ATTEMPTS = 5;
const VOTER_VERIFY_LOCKOUT_DURATION = 15 * 60 * 1000;

export function checkVoterVerificationBruteForce(email: string, plebisciteId: number): { blocked: boolean; remaining: number; lockedUntil?: Date } {
  const normalizedEmail = normalizeEmail(email);
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const now = new Date().toISOString();

  db.prepare(`
    DELETE FROM voter_verification_attempts
    WHERE attempted_at < ? AND locked_until IS NULL
  `).run(hourAgo);

  const lockoutRecord = db.prepare(`
    SELECT locked_until FROM voter_verification_attempts
    WHERE email = ? AND plebiscite_id = ? AND locked_until IS NOT NULL AND locked_until > ?
    ORDER BY attempted_at DESC LIMIT 1
  `).get(normalizedEmail, plebisciteId, now) as { locked_until: string } | undefined;

  if (lockoutRecord) {
    return { blocked: true, remaining: 0, lockedUntil: new Date(lockoutRecord.locked_until) };
  }

  const recentAttempts = db.prepare(`
    SELECT COUNT(*) as count FROM voter_verification_attempts
    WHERE email = ? AND plebiscite_id = ? AND success = FALSE AND attempted_at > ?
  `).get(normalizedEmail, plebisciteId, hourAgo) as { count: number };

  return {
    blocked: recentAttempts.count >= MAX_VOTER_VERIFY_ATTEMPTS,
    remaining: Math.max(0, MAX_VOTER_VERIFY_ATTEMPTS - recentAttempts.count)
  };
}

export function recordVoterVerificationAttempt(email: string, plebisciteId: number, success: boolean): void {
  const normalizedEmail = normalizeEmail(email);
  const now = new Date().toISOString();
  let lockedUntil: string | null = null;

  if (!success) {
    const bruteCheck = checkVoterVerificationBruteForce(normalizedEmail, plebisciteId);
    if (bruteCheck.remaining <= 1) {
      lockedUntil = new Date(Date.now() + VOTER_VERIFY_LOCKOUT_DURATION).toISOString();
      db.prepare(`
        UPDATE verification_codes
        SET used = TRUE
        WHERE email = ? AND plebiscite_id = ? AND used = FALSE
      `).run(normalizedEmail, plebisciteId);
    }
  }

  db.prepare(`
    INSERT INTO voter_verification_attempts (email, plebiscite_id, success, attempted_at, locked_until)
    VALUES (?, ?, ?, ?, ?)
  `).run(normalizedEmail, plebisciteId, success ? 1 : 0, now, lockedUntil);
}

export function clearVoterVerificationFailedAttempts(email: string, plebisciteId: number): void {
  db.prepare(`
    DELETE FROM voter_verification_attempts
    WHERE email = ? AND plebiscite_id = ? AND success = FALSE
  `).run(normalizeEmail(email), plebisciteId);
}

export function recordAdminAuditLog(input: {
  adminUserId?: number | null;
  action: string;
  targetType?: string | null;
  targetId?: string | number | null;
  details?: Record<string, any> | null;
}): void {
  db.prepare(`
    INSERT INTO admin_audit_log (admin_user_id, action, target_type, target_id, details)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    input.adminUserId ?? null,
    input.action,
    input.targetType ?? null,
    input.targetId == null ? null : String(input.targetId),
    input.details ? JSON.stringify(input.details) : null
  );
}

// Request helpers
export function getAdminSessionFromRequest(request: NextRequest): AdminSession | null {
  const sessionId = request.cookies.get('admin-session')?.value;
  return getAdminSession(sessionId);
}

export function getVoterSessionFromRequest(request: NextRequest, plebisciteSlug: string): Session | null {
  const sessionId = request.cookies.get(`voter-session-${plebisciteSlug}`)?.value;
  return getVoterSession(sessionId);
}


export function createCSRFTokenResponse() {
  const token = generateCSRFToken();
  return token;
}

function safeEqual(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

export function validateCSRFRequest(request: NextRequest): boolean {
  const headerToken = request.headers.get('x-csrf-token') || '';
  const cookieToken = request.cookies.get('csrf-token')?.value || '';
  return safeEqual(headerToken, cookieToken);
}

// CSRF protection helper
export function generateCSRFToken(): string {
  return uuidv4();
}
