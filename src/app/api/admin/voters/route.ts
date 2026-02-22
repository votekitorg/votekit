import { NextRequest, NextResponse } from 'next/server';
import { getAdminSessionFromRequest } from '@/lib/auth';
import db from '@/lib/db';

export async function GET(request: NextRequest) {
  // Verify admin authentication
  const adminSession = getAdminSessionFromRequest(request);
  if (!adminSession) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const voters = db.prepare(`
      SELECT id, email, added_at
      FROM voter_roll
      ORDER BY added_at DESC
    `).all();

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

  try {
    const body = await request.json();
    const { action, emails } = body;

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

      // Insert emails (ignore duplicates)
      const insertEmail = db.prepare(`
        INSERT OR IGNORE INTO voter_roll (email)
        VALUES (?)
      `);

      let insertedCount = 0;
      let duplicateCount = 0;

      const insertMany = db.transaction((emails) => {
        for (const email of emails) {
          const normalizedEmail = email.trim().toLowerCase();
          const result = insertEmail.run(normalizedEmail);
          if (result.changes > 0) {
            insertedCount++;
          } else {
            duplicateCount++;
          }
        }
      });

      insertMany(validEmails);

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
        db.prepare('INSERT INTO voter_roll (email) VALUES (?)').run(email.trim().toLowerCase());
        return NextResponse.json({ success: true });
      } catch (error: any) {
        if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
          return NextResponse.json(
            { error: 'Email already exists in voter roll' },
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

  try {
    const url = new URL(request.url);
    const id = url.searchParams.get('id') as any;
    const action = url.searchParams.get('action') as any;

    if (action === 'clear-all') {
      // Clear all voters (but check if any have voted)
      const participationCount = db.prepare('SELECT COUNT(*) as count FROM participation').get() as { count: number };
      
      if (participationCount.count > 0) {
        return NextResponse.json(
          { error: 'Cannot clear voter roll when votes exist. Delete plebiscites first.' },
          { status: 400 }
        );
      }

      db.prepare('DELETE FROM voter_roll').run();
      return NextResponse.json({ success: true, message: 'All voters removed' });
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