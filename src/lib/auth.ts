import { cookies } from 'next/headers';
import { NextRequest } from 'next/server';
import { v4 as uuidv4 } from 'uuid';

// Session management
const sessions = new Map<string, { email: string; plebisciteId: number; isAdmin?: boolean; expiresAt: number }>();

export interface Session {
  email: string;
  plebisciteId: number;
  isAdmin?: boolean;
}

export interface AdminSession {
  isAdmin: true;
}

// Admin authentication
export function verifyAdminPassword(password: string): boolean {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    throw new Error('ADMIN_PASSWORD environment variable not set');
  }
  return password === adminPassword;
}

export function createAdminSession(): string {
  const sessionId = uuidv4();
  const expiresAt = Date.now() + (24 * 60 * 60 * 1000); // 24 hours
  
  sessions.set(sessionId, {
    email: 'admin',
    plebisciteId: -1,
    isAdmin: true,
    expiresAt
  });
  
  return sessionId;
}

export function getAdminSession(sessionId?: string): AdminSession | null {
  if (!sessionId) return null;
  
  const session = sessions.get(sessionId);
  if (!session || session.expiresAt < Date.now()) {
    if (session) sessions.delete(sessionId);
    return null;
  }
  
  if (session.isAdmin) {
    return { isAdmin: true };
  }
  
  return null;
}

export function setAdminCookie(sessionId: string) {
  const cookieStore = cookies();
  cookieStore.set('admin-session', sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 24 * 60 * 60 // 24 hours
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
  const expiresAt = Date.now() + (2 * 60 * 60 * 1000); // 2 hours
  
  sessions.set(sessionId, {
    email,
    plebisciteId,
    expiresAt
  });
  
  return sessionId;
}

export function getVoterSession(sessionId?: string): Session | null {
  if (!sessionId) return null;
  
  const session = sessions.get(sessionId);
  if (!session || session.expiresAt < Date.now()) {
    if (session) sessions.delete(sessionId);
    return null;
  }
  
  if (!session.isAdmin) {
    return {
      email: session.email,
      plebisciteId: session.plebisciteId
    };
  }
  
  return null;
}

export function setVoterCookie(sessionId: string, plebisciteSlug: string) {
  const cookieStore = cookies();
  cookieStore.set(`voter-session-${plebisciteSlug}`, sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 2 * 60 * 60 // 2 hours
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

// Session cleanup
export function cleanupExpiredSessions(): void {
  const now = Date.now();
  for (const [sessionId, session] of sessions.entries()) {
    if (session.expiresAt < now) {
      sessions.delete(sessionId);
    }
  }
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
  // Auto-cleanup: remove after 1 hour
  setTimeout(() => csrfTokens.delete(token), 60 * 60 * 1000);
}

export function validateCSRFToken(token: string): boolean {
  const valid = csrfTokens.has(token);
  if (valid) {
    csrfTokens.delete(token); // One-time use
  }
  return valid;
}