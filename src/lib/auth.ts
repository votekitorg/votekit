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

export function getTrustedRequestIp(request: NextRequest): string {
  // Only trust proxy-supplied client IPs when the deployment explicitly says a
  // known reverse proxy is in front of the app. Otherwise all clients share the
  // conservative direct bucket and per-email throttles carry the main load.
  if (process.env.TRUST_PROXY_HEADERS === 'true') {
    const forwarded = request.headers.get('x-forwarded-for');
    if (forwarded) return forwarded.split(',')[0].trim();
    const realIp = request.headers.get('x-real-ip');
    if (realIp) return realIp.trim();
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

