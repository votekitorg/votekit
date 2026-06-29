import { cookies } from 'next/headers';
import { NextRequest } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import * as bcrypt from 'bcryptjs';
import db, { cleanupExpiredSessions } from './db';

export type AdminRole = 'admin' | 'observer';

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

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isAdminRole(role: string): role is AdminRole {
  return role === 'admin' || role === 'observer';
}

function publicAdminUser(user: any): AdminUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: isAdminRole(user.role) ? user.role : 'observer',
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
    INSERT INTO admin_users (email, name, password_hash, role, active)
    VALUES (?, ?, ?, 'admin', 1)
  `).run(email, 'VoteKit Admin', passwordHash);
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

  const email = normalizeEmail(input.email);
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
    throw new Error('A valid email address is required');
  }
  if (!input.password || input.password.length < 12) {
    throw new Error('Password must be at least 12 characters');
  }
  if (!isAdminRole(input.role)) {
    throw new Error('Invalid admin role');
  }

  const passwordHash = await bcrypt.hash(input.password, 12);
  const result = db.prepare(`
    INSERT INTO admin_users (email, name, password_hash, role, active)
    VALUES (?, ?, ?, ?, 1)
  `).run(email, input.name?.trim() || null, passwordHash, input.role);

  const user = db.prepare('SELECT * FROM admin_users WHERE id = ?').get(result.lastInsertRowid) as any;
  return publicAdminUser(user);
}

export async function updateAdminUser(id: number, input: { email?: string; name?: string; role?: AdminRole; active?: boolean; password?: string }): Promise<AdminUser> {
  await ensureBootstrapAdminUser();

  const existing = db.prepare('SELECT * FROM admin_users WHERE id = ?').get(id) as any | undefined;
  if (!existing) throw new Error('Admin user not found');

  const fields: string[] = [];
  const values: any[] = [];

  if (input.email !== undefined) {
    const email = normalizeEmail(input.email);
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('A valid email address is required');
    fields.push('email = ?');
    values.push(email);
  }

  if (input.name !== undefined) {
    fields.push('name = ?');
    values.push(input.name.trim() || null);
  }

  if (input.role !== undefined) {
    if (!isAdminRole(input.role)) throw new Error('Invalid admin role');
    fields.push('role = ?');
    values.push(input.role);
  }

  if (input.active !== undefined) {
    fields.push('active = ?');
    values.push(input.active ? 1 : 0);
  }

  if (input.password !== undefined && input.password !== '') {
    if (input.password.length < 12) throw new Error('Password must be at least 12 characters');
    fields.push('password_hash = ?');
    values.push(await bcrypt.hash(input.password, 12));
  }

  if (fields.length > 0) {
    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);
    db.prepare(`UPDATE admin_users SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  }

  const user = db.prepare('SELECT * FROM admin_users WHERE id = ?').get(id) as any;
  return publicAdminUser(user);
}

export function listAdminUsers(): AdminUser[] {
  const users = db.prepare(`
    SELECT id, email, name, role, active, created_at, updated_at, last_login_at
    FROM admin_users
    ORDER BY role ASC, email ASC
  `).all() as any[];
  return users.map(publicAdminUser);
}

export function requireAdminRole(session: AdminSession | null, allowed: AdminRole[] = ['admin']): AdminSession | null {
  if (!session) return null;
  return allowed.includes(session.role) ? session : null;
}

export function createAdminSession(adminUser: Pick<AdminUser, 'id' | 'email' | 'role'>): string {
  const sessionId = uuidv4();
  const expiresAt = new Date(Date.now() + (24 * 60 * 60 * 1000));

  db.prepare(`
    INSERT INTO sessions (id, email, plebiscite_id, is_admin, admin_user_id, admin_role, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(sessionId, adminUser.email, -1, 1, adminUser.id, adminUser.role, expiresAt.toISOString());

  return sessionId;
}

export function getAdminSession(sessionId?: string): AdminSession | null {
  if (!sessionId) return null;

  const session = db.prepare(`
    SELECT s.*, u.name, u.role, u.active
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

  const role = isAdminRole(session.role || session.admin_role) ? (session.role || session.admin_role) : 'observer';
  return {
    isAdmin: true,
    adminUserId: session.admin_user_id,
    email: session.email,
    name: session.name,
    role
  };
}

export function setAdminCookie(sessionId: string) {
  const cookieStore = cookies();
  cookieStore.set('admin-session', sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 24 * 60 * 60
  });
}

export function getAdminSessionFromCookies(): AdminSession | null {
  const cookieStore = cookies();
  const sessionId = cookieStore.get('admin-session')?.value;
  return getAdminSession(sessionId);
}

export function clearAdminCookie() {
  const cookieStore = cookies();
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

export function setVoterCookie(sessionId: string, plebisciteSlug: string) {
  const cookieStore = cookies();
  cookieStore.set(`voter-session-${plebisciteSlug}`, sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 2 * 60 * 60
  });
}

export function getVoterSessionFromCookies(plebisciteSlug: string): Session | null {
  const cookieStore = cookies();
  const sessionId = cookieStore.get(`voter-session-${plebisciteSlug}`)?.value;
  return getVoterSession(sessionId);
}

export function clearVoterCookie(plebisciteSlug: string) {
  const cookieStore = cookies();
  cookieStore.delete(`voter-session-${plebisciteSlug}`);
}

// Session cleanup (delegates to db.ts)
export { cleanupExpiredSessions };

// Admin brute force protection
const MAX_ADMIN_ATTEMPTS = 5;
const ADMIN_LOCKOUT_DURATION = 15 * 60 * 1000;

export function checkAdminBruteForce(ipAddress: string): { blocked: boolean; remaining: number; lockedUntil?: Date } {
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
  db.prepare('DELETE FROM admin_login_attempts WHERE attempted_at < ? AND locked_until IS NULL').run(hourAgo.toISOString());

  const lockoutRecord = db.prepare(`
    SELECT locked_until FROM admin_login_attempts
    WHERE ip_address = ? AND locked_until IS NOT NULL AND locked_until > ?
    ORDER BY attempted_at DESC LIMIT 1
  `).get(ipAddress, new Date().toISOString()) as { locked_until: string } | undefined;

  if (lockoutRecord) {
    return {
      blocked: true,
      remaining: 0,
      lockedUntil: new Date(lockoutRecord.locked_until)
    };
  }

  const recentAttempts = db.prepare(`
    SELECT COUNT(*) as count FROM admin_login_attempts
    WHERE ip_address = ? AND success = FALSE AND attempted_at > ?
  `).get(ipAddress, hourAgo.toISOString()) as { count: number };

  const remaining = Math.max(0, MAX_ADMIN_ATTEMPTS - recentAttempts.count);

  return {
    blocked: recentAttempts.count >= MAX_ADMIN_ATTEMPTS,
    remaining
  };
}

export function recordAdminLoginAttempt(ipAddress: string, success: boolean): void {
  const now = new Date().toISOString();
  let lockedUntil: string | null = null;

  if (!success) {
    const bruteCheck = checkAdminBruteForce(ipAddress);
    if (bruteCheck.remaining <= 1) {
      lockedUntil = new Date(Date.now() + ADMIN_LOCKOUT_DURATION).toISOString();
    }
  }

  db.prepare(`
    INSERT INTO admin_login_attempts (ip_address, success, attempted_at, locked_until)
    VALUES (?, ?, ?, ?)
  `).run(ipAddress, success ? 1 : 0, now, lockedUntil);

  if (success) {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    db.prepare('DELETE FROM admin_login_attempts WHERE ip_address = ? AND success = 1 AND attempted_at < ?')
      .run(ipAddress, weekAgo.toISOString());
  }
}

export function clearAdminFailedAttempts(ipAddress: string): void {
  db.prepare('DELETE FROM admin_login_attempts WHERE ip_address = ? AND success = FALSE').run(ipAddress);
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

// CSRF protection helper
export function generateCSRFToken(): string {
  return uuidv4();
}

const csrfTokens = new Set<string>();

export function addCSRFToken(token: string): void {
  csrfTokens.add(token);
  setTimeout(() => csrfTokens.delete(token), 60 * 60 * 1000);
}

export function validateCSRFToken(token: string): boolean {
  const valid = csrfTokens.has(token);
  if (valid) {
    csrfTokens.delete(token);
  }
  return valid;
}
