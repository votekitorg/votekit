import { NextResponse } from 'next/server';
import { createCSRFTokenResponse } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  const token = createCSRFTokenResponse();
  const response = NextResponse.json(
    { token },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } }
  );
  response.cookies.set('csrf-token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 60 * 60
  });
  return response;
}
