import { NextRequest } from 'next/server';
import db from '@/lib/db';
import {
  canAccessElection,
  getAdminSessionFromCookies,
  getAdminSessionFromRequest,
  getVoterSessionFromCookies,
  getVoterSessionFromRequest
} from '@/lib/auth';

export interface ResultsAccessElection {
  id: number;
  slug: string;
  title: string;
  status: 'draft' | 'open' | 'closed';
  access_mode: 'voter_roll' | 'anonymous_codes';
  sms_enabled: number;
  results_visibility: 'eligible' | 'public';
  archived_at: string | null;
}

export function getResultsAccessElection(slug: string): ResultsAccessElection | null {
  return db.prepare(`
    SELECT id, slug, title, status, access_mode, sms_enabled, results_visibility, archived_at
    FROM plebiscites WHERE slug = ?
  `).get(slug) as ResultsAccessElection | undefined || null;
}

function adminMayView(election: ResultsAccessElection, session: ReturnType<typeof getAdminSessionFromRequest>): boolean {
  if (!session) return false;
  if (election.archived_at) return session.role === 'owner';
  return canAccessElection(session, election.id);
}

export function canViewResultsFromRequest(request: NextRequest, election: ResultsAccessElection): boolean {
  if (election.status !== 'closed') return false;
  if (adminMayView(election, getAdminSessionFromRequest(request))) return true;
  if (election.archived_at) return false;
  if (election.results_visibility === 'public') return true;
  return getVoterSessionFromRequest(request, election.slug)?.plebisciteId === election.id;
}

export async function canViewResultsFromCookies(election: ResultsAccessElection): Promise<boolean> {
  if (election.status !== 'closed') return false;
  if (adminMayView(election, await getAdminSessionFromCookies())) return true;
  if (election.archived_at) return false;
  if (election.results_visibility === 'public') return true;
  return (await getVoterSessionFromCookies(election.slug))?.plebisciteId === election.id;
}
