import { NextRequest, NextResponse } from 'next/server';
import {
  ADMIN_ROLE_LABELS,
  canManageUsers,
  createAdminInvitation,
  getAdminSessionFromRequest,
  listPendingAdminInvitations,
  recordAdminAuditLog,
  replaceAdminInvitation,
  revokeAdminInvitation,
  validateCSRFRequest,
  type AdminRole
} from '@/lib/auth';
import { sendAdminInvitationEmail } from '@/lib/email';

function publicBaseUrl(): string {
  const configured = process.env.VOTEKIT_PUBLIC_URL;
  if (!configured) throw new Error('VOTEKIT_PUBLIC_URL is not configured');
  const url = new URL(configured);
  if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') {
    throw new Error('VOTEKIT_PUBLIC_URL must use HTTPS in production');
  }
  return url.origin;
}

async function deliverInvitation(
  invitationResult: Awaited<ReturnType<typeof createAdminInvitation>>,
  actor: NonNullable<ReturnType<typeof getAdminSessionFromRequest>>
) {
  const { invitation, token } = invitationResult;
  try {
    const invitationUrl = `${publicBaseUrl()}/admin/invite#token=${encodeURIComponent(token)}`;
    const delivery = await sendAdminInvitationEmail({
      email: invitation.email,
      name: invitation.name,
      roleLabel: ADMIN_ROLE_LABELS[invitation.role],
      invitationUrl,
      inviterName: actor.name || actor.email
    });
    if (!delivery.success) throw new Error('The invitation email could not be delivered');
  } catch (error) {
    revokeAdminInvitation(invitation.id, actor);
    throw error;
  }
  recordAdminAuditLog({
    adminUserId: actor.adminUserId,
    action: 'admin_invitation.send',
    targetType: 'admin_invitation',
    targetId: invitation.id,
    details: { email: invitation.email, role: invitation.role }
  });
  return invitation;
}

function authorisedSession(request: NextRequest) {
  const session = getAdminSessionFromRequest(request);
  return session && canManageUsers(session.role) ? session : null;
}

export async function GET(request: NextRequest) {
  const session = authorisedSession(request);
  if (!session) return NextResponse.json({ error: 'Returning Officer or Owner role required' }, { status: 403 });
  return NextResponse.json({ invitations: listPendingAdminInvitations(session) });
}

export async function POST(request: NextRequest) {
  if (!validateCSRFRequest(request)) return NextResponse.json({ error: 'Invalid request' }, { status: 403 });
  const session = authorisedSession(request);
  if (!session) return NextResponse.json({ error: 'Returning Officer or Owner role required' }, { status: 403 });

  try {
    const body = await request.json();
    const result = body.action === 'resend'
      ? await replaceAdminInvitation(Number(body.id), session)
      : await createAdminInvitation({
          email: body.email,
          name: body.name,
          role: body.role as AdminRole
        }, session);
    const invitation = await deliverInvitation(result, session);
    return NextResponse.json({ success: true, invitation });
  } catch (error: any) {
    const message = error?.message || 'Could not send invitation';
    const status = message.includes('already exists') ? 409 : message.includes('delivered') ? 502 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(request: NextRequest) {
  if (!validateCSRFRequest(request)) return NextResponse.json({ error: 'Invalid request' }, { status: 403 });
  const session = authorisedSession(request);
  if (!session) return NextResponse.json({ error: 'Returning Officer or Owner role required' }, { status: 403 });

  try {
    const body = await request.json();
    const invitation = revokeAdminInvitation(Number(body.id), session);
    recordAdminAuditLog({
      adminUserId: session.adminUserId,
      action: 'admin_invitation.revoke',
      targetType: 'admin_invitation',
      targetId: invitation.id,
      details: { email: invitation.email, role: invitation.role }
    });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Could not revoke invitation' }, { status: 400 });
  }
}
