import { NextRequest, NextResponse } from 'next/server';
import {
  canManageUsers,
  getAdminSessionFromRequest,
  listAdminUsers,
  recordAdminAuditLog,
  updateAdminUser,
  type AdminRole,
  validateCSRFRequest
} from '@/lib/auth';

export async function GET(request: NextRequest) {
  const adminSession = getAdminSessionFromRequest(request);
  if (!adminSession) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!canManageUsers(adminSession.role)) {
    return NextResponse.json({ error: 'Owner role required' }, { status: 403 });
  }

  return NextResponse.json({ users: listAdminUsers() });
}

export async function PUT(request: NextRequest) {
  if (!validateCSRFRequest(request)) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 403 });
  }

  const adminSession = getAdminSessionFromRequest(request);
  if (!adminSession) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!canManageUsers(adminSession.role)) {
    return NextResponse.json({ error: 'Owner role required' }, { status: 403 });
  }

  try {
    const body = await request.json();
    if (!body.id) {
      return NextResponse.json({ error: 'Admin user ID is required' }, { status: 400 });
    }

    const user = await updateAdminUser(Number(body.id), {
      email: body.email,
      name: body.name,
      role: body.role as AdminRole | undefined,
      active: body.active,
      password: body.password
    }, adminSession);
    recordAdminAuditLog({
      adminUserId: adminSession.adminUserId,
      action: 'admin_user.update',
      targetType: 'admin_user',
      targetId: user.id,
      details: {
        fields: Object.keys(body).filter(key => key !== 'id' && key !== 'password'),
        passwordChanged: Boolean(body.password)
      }
    });

    return NextResponse.json({ success: true, user });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to update admin user' }, { status: 400 });
  }
}
