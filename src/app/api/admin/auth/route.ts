import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminPassword, createAdminSession, setAdminCookie, clearAdminCookie } from '@/lib/auth';

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

      if (!verifyAdminPassword(password)) {
        return NextResponse.json(
          { error: 'Invalid password' },
          { status: 401 }
        );
      }

      const sessionId = createAdminSession();
      
      const response = NextResponse.json({ success: true });
      response.cookies.set('admin-session', sessionId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/plebiscite',
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