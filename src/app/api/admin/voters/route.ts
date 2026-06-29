import { NextRequest, NextResponse } from 'next/server';
import { getAdminSessionFromRequest, requireAdminRole } from '@/lib/auth';
import db from '@/lib/db';

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
        { error: 'plebiscite_id parameter is required' },
        { status: 400 }
      );
    }

    const voters = db.prepare(`
      SELECT id, email, added_at
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
  // Verify admin authentication
  const adminSession = getAdminSessionFromRequest(request);
  if (!adminSession) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!requireAdminRole(adminSession)) {
    return NextResponse.json({ error: 'Admin role required' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { action, emails, plebiscite_id } = body;

    if (!plebiscite_id) {
      return NextResponse.json(
        { error: 'plebiscite_id is required' },
        { status: 400 }
      );
    }

    // Verify plebiscite exists
    const plebiscite = db.prepare('SELECT id FROM plebiscites WHERE id = ?').get(plebiscite_id);
    if (!plebiscite) {
      return NextResponse.json(
        { error: 'Election not found' },
        { status: 404 }
      );
    }

    if (action === 'upload') {
      if (!emails || !Array.isArray(emails)) {
        return NextResponse.json(
          { error: 'Emails array is required' },
          { status: 400 }
        );
      }

      // Validate email addresses
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const validEmails = emails.filter(email => 
        typeof email === 'string' && emailRegex.test(email.trim().toLowerCase())
      );

      if (validEmails.length === 0) {
        return NextResponse.json(
          { error: 'No valid email addresses provided' },
          { status: 400 }
        );
      }

      // Insert emails for this specific election (handle duplicates within this election)
      const insertEmail = db.prepare(`
        INSERT OR IGNORE INTO voter_roll (email, plebiscite_id)
        VALUES (?, ?)
      `);

      let insertedCount = 0;
      let duplicateCount = 0;

      const insertMany = db.transaction((emails, plebisciteId) => {
        for (const email of emails) {
          const normalizedEmail = email.trim().toLowerCase();
          const result = insertEmail.run(normalizedEmail, plebisciteId);
          if (result.changes > 0) {
            insertedCount++;
          } else {
            duplicateCount++;
          }
        }
      });

      insertMany(validEmails, plebiscite_id);

      return NextResponse.json({
        success: true,
        inserted: insertedCount,
        duplicates: duplicateCount,
        invalid: emails.length - validEmails.length
      });
    }

    if (action === 'add') {
      const { email } = body;
      
      if (!email || typeof email !== 'string') {
        return NextResponse.json(
          { error: 'Email is required' },
          { status: 400 }
        );
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email.trim())) {
        return NextResponse.json(
          { error: 'Invalid email address' },
          { status: 400 }
        );
      }

      try {
        db.prepare('INSERT INTO voter_roll (email, plebiscite_id) VALUES (?, ?)').run(email.trim().toLowerCase(), plebiscite_id);
        return NextResponse.json({ success: true });
      } catch (error: any) {
        if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
          return NextResponse.json(
            { error: 'Email already exists in this election\'s voter roll' },
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
  // Verify admin authentication
  const adminSession = getAdminSessionFromRequest(request);
  if (!adminSession) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!requireAdminRole(adminSession)) {
    return NextResponse.json({ error: 'Admin role required' }, { status: 403 });
  }

  try {
    const url = new URL(request.url);
    const id = url.searchParams.get('id') as any;
    const action = url.searchParams.get('action') as any;
    const plebisciteId = url.searchParams.get('plebiscite_id') as any;

    if (action === 'clear-all') {
      if (!plebisciteId) {
        return NextResponse.json(
          { error: 'plebiscite_id is required for clear-all action' },
          { status: 400 }
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

      db.prepare('DELETE FROM voter_roll WHERE plebiscite_id = ?').run(plebisciteId);
      return NextResponse.json({ success: true, message: 'All voters removed from this election' });
    }

    if (!id) {
      return NextResponse.json(
        { error: 'Voter ID is required' },
        { status: 400 }
      );
    }

    // Check if voter has participated in any plebiscites
    const participation = db.prepare('SELECT COUNT(*) as count FROM participation WHERE voter_roll_id = ?').get(id) as { count: number };
    
    if (participation.count > 0) {
      return NextResponse.json(
        { error: 'Cannot remove voter who has participated in plebiscites' },
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

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Failed to delete voter:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}