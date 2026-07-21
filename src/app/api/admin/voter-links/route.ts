import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { canManageElection, getAdminSessionFromRequest, recordAdminAuditLog, validateCSRFRequest } from '@/lib/auth';
import { buildVoterLinkEmail } from '@/lib/email';
import { cancelPendingElectionEmails, getElectionEmailStats, queueBulkEmails, type QueueEmailInput } from '@/lib/email-queue';
import { generateLinkToken, hashLinkToken } from '@/lib/voter-access';

export async function POST(request: NextRequest) {
  if (!validateCSRFRequest(request)) return NextResponse.json({ error: 'Invalid request' }, { status: 403 });
  const session = getAdminSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await request.json();
  const id = Number(body.plebiscite_id);
  const reminder = body.action === 'remind';
  if (!id || !canManageElection(session, id)) return NextResponse.json({ error: 'You do not have permission to manage this election' }, { status: 403 });
  const election = db.prepare(`SELECT * FROM plebiscites WHERE id = ? AND access_mode = 'voter_roll'`).get(id) as any;
  if (!election || election.status !== 'open') return NextResponse.json({ error: 'Registered-voter links can only be sent for an open election' }, { status: 409 });
  const voters = db.prepare(`SELECT vr.id, vr.email FROM voter_roll vr WHERE vr.plebiscite_id = ? AND vr.email IS NOT NULL
    ${reminder ? 'AND NOT EXISTS (SELECT 1 FROM participation p WHERE p.plebiscite_id = vr.plebiscite_id AND p.voter_roll_id = vr.id)' : ''}`).all(id) as Array<{ id: number; email: string }>;
  const origin = (process.env.VOTEKIT_PUBLIC_URL || request.nextUrl.origin).replace(/\/$/u, '');
  const upsert = db.prepare(`INSERT INTO voter_link_tokens (plebiscite_id, voter_roll_id, token_hash) VALUES (?, ?, ?)
    ON CONFLICT(plebiscite_id, voter_roll_id) DO UPDATE SET token_hash = excluded.token_hash, revoked = FALSE, created_at = CURRENT_TIMESTAMP`);
  const jobs: QueueEmailInput[] = [];
  let queued;
  try {
    queued = db.transaction(() => {
      const replaced = cancelPendingElectionEmails(id);
      for (const voter of voters) {
        const token = generateLinkToken();
        upsert.run(id, voter.id, hashLinkToken(token));
        const emailInput = {
          email: voter.email, electionTitle: election.title, electionDescription: election.description,
          ballotUrl: `${origin}/vote/${election.slug}#voter=${encodeURIComponent(token)}`, reminder, closeDate: election.close_date
        };
        jobs.push({
          plebisciteId: id,
          kind: reminder ? 'voter_reminder' : 'voter_link',
          recipient: voter.email,
          payload: buildVoterLinkEmail(emailInput)
        });
      }
      return { ...queueBulkEmails(jobs), replaced };
    })();
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not queue ballot links' }, { status: 409 });
  }
  recordAdminAuditLog({
    adminUserId: session.adminUserId,
    action: reminder ? 'voter_links.remind' : 'voter_links.send',
    targetType: 'plebiscite', targetId: id,
    details: { eligible: voters.length, queued: queued.queued, suppressed: queued.suppressed, campaignId: queued.campaignId, replaced: queued.replaced }
  });
  return NextResponse.json({ success: true, eligible: voters.length, ...queued, delivery: getElectionEmailStats(id) }, { status: 202 });
}

export async function GET(request: NextRequest) {
  const session = getAdminSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const id = Number(request.nextUrl.searchParams.get('plebiscite_id'));
  if (!id || !canManageElection(session, id)) return NextResponse.json({ error: 'You do not have permission to manage this election' }, { status: 403 });
  return NextResponse.json({ delivery: getElectionEmailStats(id) });
}
