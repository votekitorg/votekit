import { NextRequest, NextResponse } from 'next/server';
import {
  ADMIN_ROLE_LABELS,
  acceptAdminInvitation,
  getAdminInvitationByToken,
  validateCSRFRequest
} from '@/lib/auth';

export async function POST(request: NextRequest) {
  if (!validateCSRFRequest(request)) return NextResponse.json({ error: 'Invalid request' }, { status: 403 });

  try {
    const body = await request.json();
    const token = typeof body.token === 'string' ? body.token : '';
    if (token.length > 128) return NextResponse.json({ error: 'Invalid invitation' }, { status: 400 });

    if (body.action === 'inspect') {
      const invitation = getAdminInvitationByToken(token);
      if (!invitation) return NextResponse.json({ error: 'This invitation is invalid or has expired' }, { status: 404 });
      return NextResponse.json({
        invitation: {
          email: invitation.email,
          name: invitation.name,
          role: invitation.role,
          roleLabel: invitation.plebiscite_title ? `${ADMIN_ROLE_LABELS[invitation.role]} for ${invitation.plebiscite_title}` : ADMIN_ROLE_LABELS[invitation.role],
          existingAccount: invitation.existing_account,
          expiresAt: invitation.expires_at,
          inviter: invitation.invited_by_name || invitation.invited_by_email
        }
      });
    }

    if (body.action === 'accept') {
      const user = await acceptAdminInvitation(token, body.password);
      return NextResponse.json({ success: true, email: user.email });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Could not accept invitation' }, { status: 400 });
  }
}
