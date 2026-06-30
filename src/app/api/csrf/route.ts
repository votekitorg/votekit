import { NextResponse } from 'next/server';
import { createCSRFTokenResponse } from '@/lib/auth';

export async function GET() {
  const token = createCSRFTokenResponse();
  const response = NextResponse.json({ token });
  response.cookies.set('csrf-token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60
  });
  return response;
}
