import crypto from 'node:crypto';
import { after, NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { getTrustedRequestIp, recordAdminAuditLog, validateCSRFRequest } from '@/lib/auth';
import { createSelfServicePasswordReset, revokePasswordReset } from '@/lib/admin-password-reset';
import { incrementRateLimitKey, isRateLimitKeyLimited, sendAdminPasswordResetEmail } from '@/lib/email';

export const runtime = 'nodejs';
const message = 'If this email belongs to an active VoteKit account, you will receive a password reset link shortly. The link is valid for 30 minutes. Check your spam folder too.';

export async function POST(request: NextRequest) {
  if (!validateCSRFRequest(request)) return NextResponse.json({error:'Invalid request'}, {status:403});
  let email: string;
  try {
    const text = await request.text();
    if (text.length > 2048) throw new Error();
    const body = JSON.parse(text);
    if (typeof body.email !== 'string') throw new Error();
    email = body.email.trim().toLowerCase();
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error();
  } catch { return NextResponse.json({error:'Enter a valid email address.'}, {status:400}); }
  const ip = getTrustedRequestIp(request);
  // Account lookup, throttling and delivery happen AFTER the generic response.
  // Next owns this awaited callback, unlike a detached fire-and-forget promise.
  after(async () => {
    try {
      const allowed = db.transaction(() => {
        const keys: Array<[string, number]> = [
          [`password-reset-request:ip:${ip}`, 20],
          ['password-reset-request:global', 200],
          [`password-reset-request:email:${crypto.createHash('sha256').update(email).digest('hex')}`, 5]
        ];
        if (keys.some(([key, limit]) => isRateLimitKeyLimited(key, limit))) return false;
        keys.forEach(([key]) => incrementRateLimitKey(key));
        return true;
      }).immediate();
      if (!allowed) return;
      const base = new URL(process.env.VOTEKIT_PUBLIC_URL || '');
      if (!['http:', 'https:'].includes(base.protocol) || (process.env.NODE_ENV === 'production' && base.protocol !== 'https:')) throw new Error();
      const reset = createSelfServicePasswordReset(email);
      if (!reset) return;
      let sent = false;
      try {
        sent = (await sendAdminPasswordResetEmail({email:reset.email, name:reset.name, selfService:true,
          resetUrl:`${base.origin}/admin/reset-password#token=${encodeURIComponent(reset.token)}`})).success;
      } catch { /* Never log email transport payloads or credentials. */ }
      if (!sent) revokePasswordReset(reset.id);
      recordAdminAuditLog({adminUserId:null, action:sent ? 'admin_password_reset.self_send' : 'admin_password_reset.delivery_failed', targetType:'admin_user', targetId:reset.userId, details:{source:'self_service'}});
    } catch {
      // No address/token/exception payload in logs. Generic response is already sent.
      console.error('VoteKit self-service password recovery could not be processed');
    }
  });
  return NextResponse.json({success:true, message});
}
