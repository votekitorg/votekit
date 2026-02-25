import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminPassword, createAdminSession, setAdminCookie, clearAdminCookie, checkAdminBruteForce, recordAdminLoginAttempt, clearAdminFailedAttempts } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const action = formData.get('action') as string;

    if (action === 'login') {
      const password = formData.get('password') as string;

      if (!password) {
        return NextResponse.json(
          { error: 'Password is required' },
          { status: 400 }
        );
      }

      // Get client IP address
      const forwarded = request.headers.get('x-forwarded-for');
      const ipAddress = forwarded ? forwarded.split(',')[0].trim() : 
                       request.headers.get('x-real-ip') || 
                       '127.0.0.1';

      // Check brute force protection
      const bruteCheck = checkAdminBruteForce(ipAddress);
      if (bruteCheck.blocked) {
        const minutesLeft = bruteCheck.lockedUntil ? Math.ceil((bruteCheck.lockedUntil.getTime() - Date.now()) / (60 * 1000)) : 15;
        return NextResponse.json(
          { error: `Too many failed login attempts. Access blocked for ${minutesLeft} minute${minutesLeft !== 1 ? 's' : ''}.` },
          { status: 429 }
        );
      }

      // Verify password
      const isValid = await verifyAdminPassword(password);
      
      // Record the attempt
      recordAdminLoginAttempt(ipAddress, isValid);

      if (!isValid) {
        const remaining = checkAdminBruteForce(ipAddress).remaining;
        return NextResponse.json(
          { error: remaining > 0 
              ? `Invalid password. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining before lockout.`
              : 'Invalid password. Account temporarily locked.' },
          { status: 401 }
        );
      }

      // Clear failed attempts on successful login
      clearAdminFailedAttempts(ipAddress);

      const sessionId = createAdminSession();
      
      const response = NextResponse.json({ success: true });
      response.cookies.set('admin-session', sessionId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 24 * 60 * 60 // 24 hours
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
  // Check if admin is already logged in
  const sessionId = request.cookies.get('admin-session')?.value;
  
  if (sessionId) {
    // TODO: Validate session
    return NextResponse.json({ authenticated: true });
  }

  return NextResponse.json({ authenticated: false });
}