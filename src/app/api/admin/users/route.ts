import { NextRequest, NextResponse } from 'next/server';
import {
  createAdminUser,
  getAdminSessionFromRequest,
  listAdminUsers,
  requireAdminRole,
  updateAdminUser,
  type AdminRole,
  validateCSRFRequest
} from '@/lib/auth';

export async function GET(request: NextRequest) {
  const adminSession = getAdminSessionFromRequest(request);
  if (!adminSession) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json({ users: listAdminUsers() });
}

export async function POST(request: NextRequest) {
  if (!validateCSRFRequest(request)) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 403 });
  }

  const adminSession = getAdminSessionFromRequest(request);
  if (!adminSession) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!requireAdminRole(adminSession)) {
    return NextResponse.json({ error: 'Admin role required' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const user = await createAdminUser({
      email: body.email,
      password: body.password,
      name: body.name,
      role: body.role as AdminRole
    });

    return NextResponse.json({ success: true, user });
  } catch (error: any) {
    const message = error?.message || 'Failed to create admin user';
    const status = message.includes('UNIQUE') ? 409 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PUT(request: NextRequest) {
  if (!validateCSRFRequest(request)) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 403 });
  }

  const adminSession = getAdminSessionFromRequest(request);
  if (!adminSession) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!requireAdminRole(adminSession)) {
    return NextResponse.json({ error: 'Admin role required' }, { status: 403 });
  }

  try {
    const body = await request.json();
    if (!body.id) {
      return NextResponse.json({ error: 'Admin user ID is required' }, { status: 400 });
    }

    if (body.id === adminSession.adminUserId && body.active === false) {
      return NextResponse.json({ error: 'You cannot deactivate your own admin account' }, { status: 400 });
    }

    const user = await updateAdminUser(Number(body.id), {
      email: body.email,
      name: body.name,
      role: body.role as AdminRole | undefined,
      active: body.active,
      password: body.password
    });

    return NextResponse.json({ success: true, user });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to update admin user' }, { status: 400 });
  }
}
