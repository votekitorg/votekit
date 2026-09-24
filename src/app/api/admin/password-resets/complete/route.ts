import { NextRequest, NextResponse } from 'next/server';
import { getTrustedRequestIp, recordAdminAuditLog, validateCSRFRequest } from '@/lib/auth';
import { completePasswordReset, inspectPasswordReset, PasswordResetError } from '@/lib/admin-password-reset';
import { incrementRateLimitKey, isRateLimitKeyLimited, sendAdminPasswordResetEmail } from '@/lib/email';

export async function POST(request: NextRequest) {
  if (!validateCSRFRequest(request)) return NextResponse.json({error:'Invalid request'}, {status:403});
  const key = `password-reset:ip:${getTrustedRequestIp(request)}`;
  if (isRateLimitKeyLimited(key, 100)) return NextResponse.json({error:'Too many attempts. Try again later.'}, {status:429});
  incrementRateLimitKey(key);
  try {
    const body = await request.json();
    if (body.action === 'inspect') return NextResponse.json({reset:inspectPasswordReset(body.token)});
    if (body.action !== 'complete') return NextResponse.json({error:'Invalid action'}, {status:400});
    const user = await completePasswordReset(body.token, body.password, body.confirmation);
    let notified = false;
    try { notified = (await sendAdminPasswordResetEmail({email:user.email, name:user.name})).success; } catch { /* Reset already committed. */ }
    if (!notified) recordAdminAuditLog({adminUserId:user.id, action:'admin_password_reset.notice_failed', targetType:'admin_user', targetId:user.id, details:null});
    return NextResponse.json({success:true});
  } catch (error) {
    return NextResponse.json({error:error instanceof PasswordResetError ? error.message : 'Could not reset password. Please try again.'}, {status:error instanceof PasswordResetError ? error.status : 400});
  }
}
