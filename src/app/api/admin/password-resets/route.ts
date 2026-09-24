import { NextRequest, NextResponse } from 'next/server';
import { getAdminSessionFromRequest, recordAdminAuditLog, validateCSRFRequest } from '@/lib/auth';
import { createPasswordReset, PasswordResetError, revokePasswordReset } from '@/lib/admin-password-reset';
import { sendAdminPasswordResetEmail } from '@/lib/email';

export async function POST(request: NextRequest) {
  if (!validateCSRFRequest(request)) return NextResponse.json({error:'Invalid request'}, {status:403});
  const session = getAdminSessionFromRequest(request);
  if (!session || session.role !== 'owner') return NextResponse.json({error:'Owner role required'}, {status:403});
  try {
    const body = await request.json();
    const base = new URL(process.env.VOTEKIT_PUBLIC_URL || '');
    if (!['http:', 'https:'].includes(base.protocol) || (process.env.NODE_ENV === 'production' && base.protocol !== 'https:')) throw new Error('Invalid origin');
    const reset = createPasswordReset(Number(body.id), session);
    let sent = false;
    try {
      sent = (await sendAdminPasswordResetEmail({email:reset.email, name:reset.name,
        resetUrl:`${base.origin}/admin/reset-password#token=${encodeURIComponent(reset.token)}`})).success;
    } catch { /* Revoke on any delivery failure without logging credentials. */ }
    if (!sent) revokePasswordReset(reset.id);
    recordAdminAuditLog({adminUserId:session.adminUserId, action:sent ? 'admin_password_reset.send' : 'admin_password_reset.delivery_failed', targetType:'admin_user', targetId:Number(body.id), details:null});
    return sent ? NextResponse.json({success:true}) : NextResponse.json({error:'The reset email could not be sent. The link has been cancelled; try again in a minute.'}, {status:502});
  } catch (error) {
    return NextResponse.json({error:error instanceof PasswordResetError ? error.message : 'Could not send password reset'}, {status:error instanceof PasswordResetError ? error.status : 400});
  }
}
