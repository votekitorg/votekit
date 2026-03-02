import { cookies } from 'next/headers';
import { NextRequest } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import * as bcrypt from 'bcryptjs';
import db, { cleanupExpiredSessions } from './db';

export interface Session {
  email: string;
  plebisciteId: number;
  isAdmin?: boolean;
  identifierType?: 'email' | 'phone';
}

export interface AdminSession {
  isAdmin: true;
}

async function ensureAdminPasswordHashed(): Promise<void> {
  const existing = db.prepare('SELECT value FROM admin_config WHERE key = ?').get('admin_password_hash') as { value: string } | undefined;
  
  if (!existing) {
    const adminPassword = process.env.ADMIN_PASSWORD;
    if (!adminPassword) {
      throw new Error('ADMIN_PASSWORD environment variable not set');
    }
    
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(adminPassword, saltRounds);
    
    db.prepare('INSERT OR REPLACE INTO admin_config (key, value) VALUES (?, ?)').run('admin_password_hash', hashedPassword);
    console.log('Admin password has been hashed and stored securely');
  }
}

export async function verifyAdminPassword(password: string): Promise<boolean> {
  try {
    await ensureAdminPasswordHashed();
    
    const stored = db.prepare('SELECT value FROM admin_config WHERE key = ?').get('admin_password_hash') as { value: string } | undefined;
    
    if (!stored) {
      throw new Error('Admin password hash not found');
    }
    
    return await bcrypt.compare(password, stored.value);
  } catch (error) {
    console.error('Admin password verification error:', error);
    return false;
  }
}

export function createAdminSession(): string {
  const sessionId = uuidv4();
  const expiresAt = new Date(Date.now() + (24 * 60 * 60 * 1000));
  
  db.prepare(`
    INSERT INTO sessions (id, email, plebiscite_id, is_admin, expires_at, identifier_type)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(sessionId, 'admin', -1, 1, expiresAt.toISOString(), 'email');
  
  return sessionId;
}

export function getAdminSession(sessionId?: string): AdminSession | null {
  if (!sessionId) return null;
  
  const session = db.prepare(`
    SELECT * FROM sessions WHERE id = ? AND is_admin = 1
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
  
  return { isAdmin: true };
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

export function createVoterSession(email: string, plebisciteId: number, identifierType: 'email' | 'phone' = 'email'): string {
  const sessionId = uuidv4();
  const expiresAt = new Date(Date.now() + (2 * 60 * 60 * 1000));
  
  db.prepare(`
    INSERT INTO sessions (id, email, plebiscite_id, is_admin, expires_at, identifier_type)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(sessionId, email, plebisciteId, 0, expiresAt.toISOString(), identifierType);
  
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
    identifier_type?: string;
  } | undefined;
  
  if (!session) return null;
  
  if (new Date(session.expires_at) < new Date()) {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
    return null;
  }
  
  return {
    email: session.email,
    plebisciteId: session.plebiscite_id,
    identifierType: (session.identifier_type as 'email' | 'phone') || 'email'
  };
}

export function setVoterCookie(sessionId: string, plebisciteSlug: string) {
  const cookieStore = cookies();
  cookieStore.set('voter-session-' + plebisciteSlug, sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 2 * 60 * 60
  });
}

export function getVoterSessionFromCookies(plebisciteSlug: string): Session | null {
  const cookieStore = cookies();
  const sessionId = cookieStore.get('voter-session-' + plebisciteSlug)?.value;
  return getVoterSession(sessionId);
}

export function clearVoterCookie(plebisciteSlug: string) {
  const cookieStore = cookies();
  cookieStore.delete('voter-session-' + plebisciteSlug);
}

export { cleanupExpiredSessions };

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

export function getAdminSessionFromRequest(request: NextRequest): AdminSession | null {
  const sessionId = request.cookies.get('admin-session')?.value;
  return getAdminSession(sessionId);
}

export function getVoterSessionFromRequest(request: NextRequest, plebisciteSlug: string): Session | null {
  const sessionId = request.cookies.get('voter-session-' + plebisciteSlug)?.value;
  return getVoterSession(sessionId);
}

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
