import { NextRequest, NextResponse } from 'next/server';
import {
  verifyAdminLogin,
  createAdminSession,
  checkAdminBruteForce,
  recordAdminLoginAttempt,
  clearAdminFailedAttempts,
  getAdminSession
} from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const action = formData.get('action') as string;

    if (action === 'login') {
      const email = formData.get('email') as string;
      const password = formData.get('password') as string;

      if (!email || !password) {
        return NextResponse.json(
          { error: 'Email and password are required' },
          { status: 400 }
        );
      }

      const forwarded = request.headers.get('x-forwarded-for');
      const ipAddress = forwarded ? forwarded.split(',')[0].trim() :
                       request.headers.get('x-real-ip') ||
                       '127.0.0.1';

      const bruteCheck = checkAdminBruteForce(ipAddress);
      if (bruteCheck.blocked) {
        const minutesLeft = bruteCheck.lockedUntil ? Math.ceil((bruteCheck.lockedUntil.getTime() - Date.now()) / (60 * 1000)) : 15;
        return NextResponse.json(
          { error: `Too many failed login attempts. Access blocked for ${minutesLeft} minute${minutesLeft !== 1 ? 's' : ''}.` },
          { status: 429 }
        );
      }

      const adminUser = await verifyAdminLogin(email, password);

      recordAdminLoginAttempt(ipAddress, Boolean(adminUser));

      if (!adminUser) {
        const remaining = checkAdminBruteForce(ipAddress).remaining;
        return NextResponse.json(
          { error: remaining > 0
              ? `Invalid email or password. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining before lockout.`
              : 'Invalid email or password. Account temporarily locked.' },
          { status: 401 }
        );
      }

      clearAdminFailedAttempts(ipAddress);

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
      const response = NextResponse.redirect(new URL('/admin', request.url));
      response.cookies.delete('admin-session');
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
