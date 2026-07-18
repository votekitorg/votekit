import { NextRequest, NextResponse } from 'next/server';
import { canManageElection, getAdminSessionFromRequest, recordAdminAuditLog,
  validateCSRFRequest
} from '@/lib/auth';
import db from '@/lib/db';
import { normalizePhoneNumber } from '@/lib/voter-access';

const MAX_VOTER_UPLOAD = 10_000;

function getDraftElection(id: unknown): { id: number; status: string } | null {
  const election = db.prepare('SELECT id, status FROM plebiscites WHERE id = ?').get(id) as { id: number; status: string } | undefined;
  return election?.status === 'draft' ? election : null;
}

export async function GET(request: NextRequest) {
  // Verify admin authentication
  const adminSession = getAdminSessionFromRequest(request);
  if (!adminSession) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const plebisciteId = url.searchParams.get('plebiscite_id');

    if (!plebisciteId) {
      return NextResponse.json(
        { error: 'Election ID is required' },
        { status: 400 }
      );
    }
    if (!canManageElection(adminSession, Number(plebisciteId))) return NextResponse.json({ error: 'You do not have permission to manage this election' }, { status: 403 });

    const voters = db.prepare(`
      SELECT id, email, phone, added_at
      FROM voter_roll
      WHERE plebiscite_id = ?
      ORDER BY added_at DESC
    `).all(plebisciteId);

    return NextResponse.json({ voters });
  } catch (error) {
    console.error('Failed to fetch voters:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  if (!validateCSRFRequest(request)) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 403 });
  }

  // Verify admin authentication
  const adminSession = getAdminSessionFromRequest(request);
  if (!adminSession) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { action, emails, voters, plebiscite_id } = body;

    if (!plebiscite_id) {
      return NextResponse.json(
        { error: 'Election ID is required' },
        { status: 400 }
      );
    }
    if (!canManageElection(adminSession, Number(plebiscite_id))) return NextResponse.json({ error: 'You do not have permission to manage this election' }, { status: 403 });

    // Verify plebiscite exists
    const plebiscite = db.prepare('SELECT id, status FROM plebiscites WHERE id = ?').get(plebiscite_id) as { id: number; status: string } | undefined;
    if (!plebiscite) {
      return NextResponse.json(
        { error: 'Election not found' },
        { status: 404 }
      );
    }
    if (plebiscite.status !== 'draft') {
      return NextResponse.json(
        { error: 'The voter roll is locked once an election opens' },
        { status: 409 }
      );
    }

    if (action === 'upload') {
      const supplied = Array.isArray(voters) ? voters : Array.isArray(emails) ? emails.map((email: string) => ({ email })) : null;
      if (!supplied || supplied.length > MAX_VOTER_UPLOAD) {
        return NextResponse.json(
          { error: `A voter list of at most ${MAX_VOTER_UPLOAD} entries is required` },
          { status: 400 }
        );
      }

      // Validate email addresses
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const validVoters = supplied.map((entry: any) => {
        const email = typeof entry?.email === 'string' && emailRegex.test(entry.email.trim()) ? entry.email.trim().toLowerCase() : null;
        const phone = typeof entry?.phone === 'string' ? normalizePhoneNumber(entry.phone) : null;
        return email || phone ? { email, phone } : null;
      }).filter(Boolean) as Array<{ email: string | null; phone: string | null }>;

      if (validVoters.length === 0) {
        return NextResponse.json(
          { error: 'No valid email addresses or phone numbers provided' },
          { status: 400 }
        );
      }

      // Insert emails for this specific election (handle duplicates within this election)
      const insertVoter = db.prepare(`
        INSERT OR IGNORE INTO voter_roll (email, phone, plebiscite_id)
        VALUES (?, ?, ?)
      `);

      let insertedCount = 0;
      let duplicateCount = 0;

      const insertMany = db.transaction((entries, plebisciteId) => {
        for (const entry of entries) {
          const result = insertVoter.run(entry.email, entry.phone, plebisciteId);
          if (result.changes > 0) {
            insertedCount++;
          } else {
            duplicateCount++;
          }
        }
      });

      insertMany(validVoters, plebiscite_id);
      recordAdminAuditLog({
        adminUserId: adminSession.adminUserId,
        action: 'voter_roll.upload',
        targetType: 'plebiscite',
        targetId: plebiscite_id,
        details: { inserted: insertedCount, duplicates: duplicateCount, invalid: supplied.length - validVoters.length }
      });

      return NextResponse.json({
        success: true,
        inserted: insertedCount,
        duplicates: duplicateCount,
        invalid: supplied.length - validVoters.length
      });
    }

    if (action === 'add') {
      const { email, phone } = body;
      const normalizedPhone = typeof phone === 'string' ? normalizePhoneNumber(phone) : null;
      const normalizedEmail = typeof email === 'string' && email.trim() ? email.trim().toLowerCase() : null;
      
      if (!normalizedEmail && !normalizedPhone) {
        return NextResponse.json(
          { error: 'A valid email address or phone number is required' },
          { status: 400 }
        );
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (normalizedEmail && (normalizedEmail.length > 254 || !emailRegex.test(normalizedEmail))) {
        return NextResponse.json(
          { error: 'Invalid email address' },
          { status: 400 }
        );
      }

      try {
        const result = db.prepare('INSERT INTO voter_roll (email, phone, plebiscite_id) VALUES (?, ?, ?)').run(normalizedEmail, normalizedPhone, plebiscite_id);
        recordAdminAuditLog({
          adminUserId: adminSession.adminUserId,
          action: 'voter_roll.add',
          targetType: 'voter_roll',
          targetId: Number(result.lastInsertRowid),
          details: { plebisciteId: plebiscite_id, hasEmail: Boolean(normalizedEmail), hasPhone: Boolean(normalizedPhone) }
        });
        return NextResponse.json({ success: true });
      } catch (error: any) {
        if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
          return NextResponse.json(
            { error: 'That email address or phone number already exists in this election' },
            { status: 409 }
          );
        }
        throw error;
      }
    }

    return NextResponse.json(
      { error: 'Invalid action' },
      { status: 400 }
    );

  } catch (error) {
    console.error('Failed to manage voters:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  if (!validateCSRFRequest(request)) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 403 });
  }

  // Verify admin authentication
  const adminSession = getAdminSessionFromRequest(request);
  if (!adminSession) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const id = url.searchParams.get('id') as any;
    const action = url.searchParams.get('action') as any;
    const plebisciteId = url.searchParams.get('plebiscite_id') as any;

    if (action === 'clear-all') {
      if (!plebisciteId) {
        return NextResponse.json(
          { error: 'Election ID is required for this action' },
          { status: 400 }
        );
      }
      if (!canManageElection(adminSession, Number(plebisciteId))) return NextResponse.json({ error: 'You do not have permission to manage this election' }, { status: 403 });
      if (!getDraftElection(plebisciteId)) {
        return NextResponse.json(
          { error: 'The voter roll is locked once an election opens' },
          { status: 409 }
        );
      }

      // Clear all voters for this election (but check if any have voted)
      const participationCount = db.prepare('SELECT COUNT(*) as count FROM participation WHERE plebiscite_id = ?').get(plebisciteId) as { count: number };
      
      if (participationCount.count > 0) {
        return NextResponse.json(
          { error: 'Cannot clear voter roll when votes exist for this election.' },
          { status: 400 }
        );
      }

      const result = db.prepare('DELETE FROM voter_roll WHERE plebiscite_id = ?').run(plebisciteId);
      recordAdminAuditLog({
        adminUserId: adminSession.adminUserId,
        action: 'voter_roll.clear',
        targetType: 'plebiscite',
        targetId: plebisciteId,
        details: { removed: result.changes }
      });
      return NextResponse.json({ success: true, message: 'All voters removed from this election' });
    }

    if (!id) {
      return NextResponse.json(
        { error: 'Voter ID is required' },
        { status: 400 }
      );
    }

    // Check if voter has participated in any plebiscites
    const voter = db.prepare('SELECT email, phone, plebiscite_id FROM voter_roll WHERE id = ?').get(id) as any | undefined;
    if (voter && !canManageElection(adminSession, Number(voter.plebiscite_id))) return NextResponse.json({ error: 'You do not have permission to manage this election' }, { status: 403 });
    if (!voter) {
      return NextResponse.json({ error: 'Voter not found' }, { status: 404 });
    }
    if (!getDraftElection(voter.plebiscite_id)) {
      return NextResponse.json(
        { error: 'The voter roll is locked once an election opens' },
        { status: 409 }
      );
    }

    const participation = db.prepare('SELECT COUNT(*) as count FROM participation WHERE voter_roll_id = ?').get(id) as { count: number };
    
    if (participation.count > 0) {
      return NextResponse.json(
        { error: 'Cannot remove voter who has participated in elections' },
        { status: 400 }
      );
    }

    // Delete voter
    const result = db.prepare('DELETE FROM voter_roll WHERE id = ?').run(id);
    
    if (result.changes === 0) {
      return NextResponse.json(
        { error: 'Voter not found' },
        { status: 404 }
      );
    }

    recordAdminAuditLog({
      adminUserId: adminSession.adminUserId,
      action: 'voter_roll.delete',
      targetType: 'voter_roll',
      targetId: id,
      details: voter ? { plebisciteId: voter.plebiscite_id, hadEmail: Boolean(voter.email), hadPhone: Boolean(voter.phone) } : null
    });

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Failed to delete voter:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
