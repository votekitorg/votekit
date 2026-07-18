import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { canManageElection, getAdminSessionFromRequest, recordAdminAuditLog, validateCSRFRequest } from '@/lib/auth';
import { sendVoterLinkEmail } from '@/lib/email';
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
  let sent = 0; let failed = 0;
  for (const voter of voters) {
    const token = generateLinkToken();
    upsert.run(id, voter.id, hashLinkToken(token));
    const result = await sendVoterLinkEmail({
      email: voter.email, electionTitle: election.title, electionDescription: election.description,
      ballotUrl: `${origin}/vote/${election.slug}#voter=${encodeURIComponent(token)}`, reminder, closeDate: election.close_date
    });
    if (result.success) sent++; else failed++;
  }
  recordAdminAuditLog({ adminUserId: session.adminUserId, action: reminder ? 'voter_links.remind' : 'voter_links.send', targetType: 'plebiscite', targetId: id, details: { eligible: voters.length, sent, failed } });
  return NextResponse.json({ success: failed === 0, sent, failed, eligible: voters.length });
}
