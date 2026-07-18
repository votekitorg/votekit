import { NextRequest, NextResponse } from 'next/server';
import {
  verifyAdminLogin,
  createAdminSession,
  checkAdminBruteForce,
  recordAdminLoginAttempt,
  clearAdminFailedAttempts,
  deleteAdminSession,
  getAdminRequestIp,
  getAdminSession,
  recordAdminAuditLog,
  validateCSRFRequest
} from '@/lib/auth';

export async function POST(request: NextRequest) {
  if (!validateCSRFRequest(request)) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 403 });
  }

  try {
    const formData = await request.formData();
    const action = formData.get('action') as string;

    if (action === 'login') {
      const email = formData.get('email') as string;
      const password = formData.get('password') as string;

      if (!email || !password || email.length > 254 || password.length > 1024) {
        return NextResponse.json(
          { error: 'Email and password are required' },
          { status: 400 }
        );
      }

      const ipAddress = getAdminRequestIp(request);

      const bruteCheck = checkAdminBruteForce(email, ipAddress);
      if (bruteCheck.blocked) {
        const minutesLeft = bruteCheck.lockedUntil ? Math.ceil((bruteCheck.lockedUntil.getTime() - Date.now()) / (60 * 1000)) : 15;
        return NextResponse.json(
          { error: `Too many failed login attempts. Access blocked for ${minutesLeft} minute${minutesLeft !== 1 ? 's' : ''}.` },
          { status: 429 }
        );
      }

      const adminUser = await verifyAdminLogin(email, password);

      recordAdminLoginAttempt(email, ipAddress, Boolean(adminUser));
      recordAdminAuditLog({
        adminUserId: adminUser?.id ?? null,
        action: adminUser ? 'admin.login.success' : 'admin.login.failure',
        targetType: 'admin_user',
        targetId: adminUser?.id ?? email.trim().toLowerCase(),
        details: { email: email.trim().toLowerCase(), ipAddress }
      });

      if (!adminUser) {
        const remaining = checkAdminBruteForce(email, ipAddress).remaining;
        return NextResponse.json(
          { error: remaining > 0
              ? `Invalid email or password. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining before lockout.`
              : 'Invalid email or password. Account temporarily locked.' },
          { status: 401 }
        );
      }

      clearAdminFailedAttempts(email, ipAddress);

      const sessionId = createAdminSession(adminUser);

      const response = NextResponse.json({
        success: true,
        user: {
          email: adminUser.email,
          name: adminUser.name,
          role: adminUser.role
        }
      });
      response.cookies.set('admin-session', sessionId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 24 * 60 * 60
      });

      return response;
    }

    if (action === 'logout') {
      const sessionId = request.cookies.get('admin-session')?.value;
      const session = getAdminSession(sessionId);
      if (session) {
        recordAdminAuditLog({
          adminUserId: session.adminUserId,
          action: 'admin.logout',
          targetType: 'admin_user',
          targetId: session.adminUserId
        });
      }

      deleteAdminSession(sessionId);

      const response = NextResponse.json({ success: true });
      response.cookies.set('admin-session', '', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        expires: new Date(0)
      });
      return response;
    }

    return NextResponse.json(
      { error: 'Invalid action' },
      { status: 400 }
    );

  } catch (error) {
    console.error('Admin auth error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const sessionId = request.cookies.get('admin-session')?.value;
  const session = getAdminSession(sessionId);

  if (session) {
    return NextResponse.json({
      authenticated: true,
      user: {
        email: session.email,
        name: session.name,
        role: session.role
      }
    });
  }

  return NextResponse.json({ authenticated: false });
}
