import { NextRequest, NextResponse } from 'next/server';
import { getAdminSessionFromRequest } from '@/lib/auth';
import db, { normalizePhoneNumber } from '@/lib/db';

export async function GET(request: NextRequest) {
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
  const adminSession = getAdminSessionFromRequest(request);
  if (!adminSession) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { action, emails, voters: voterData, plebiscite_id } = body;

    if (!plebiscite_id) {
      return NextResponse.json(
        { error: 'plebiscite_id is required' },
        { status: 400 }
      );
    }

    const plebiscite = db.prepare('SELECT id FROM plebiscites WHERE id = ?').get(plebiscite_id);
    if (!plebiscite) {
      return NextResponse.json(
        { error: 'Election not found' },
        { status: 404 }
      );
    }

    if (action === 'upload') {
      if (voterData && Array.isArray(voterData)) {
        return handleVoterUpload(voterData, plebiscite_id);
      }
      
      if (emails && Array.isArray(emails)) {
        const voterList = emails.map((email: string) => ({ email, phone: null }));
        return handleVoterUpload(voterList, plebiscite_id);
      }

      return NextResponse.json(
        { error: 'Voters array is required' },
        { status: 400 }
      );
    }

    if (action === 'add') {
      const { email, phone } = body;
      
      if (!email && !phone) {
        return NextResponse.json(
          { error: 'Email or phone is required' },
          { status: 400 }
        );
      }

      if (email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email.trim())) {
          return NextResponse.json(
            { error: 'Invalid email address' },
            { status: 400 }
          );
        }
      }

      let normalizedPhone = null;
      if (phone) {
        normalizedPhone = normalizePhoneNumber(phone.trim());
        if (!normalizedPhone || normalizedPhone.length < 10) {
          return NextResponse.json(
            { error: 'Invalid phone number' },
            { status: 400 }
          );
        }
      }

      const normalizedEmail = email ? email.trim().toLowerCase() : null;

      try {
        if (normalizedEmail) {
          const existingEmail = db.prepare(
            'SELECT id FROM voter_roll WHERE email = ? AND plebiscite_id = ?'
          ).get(normalizedEmail, plebiscite_id);
          if (existingEmail) {
            return NextResponse.json(
              { error: 'Email already exists in this election\'s voter roll' },
              { status: 409 }
            );
          }
        }

        if (normalizedPhone) {
          const existingPhone = db.prepare(
            'SELECT id FROM voter_roll WHERE phone = ? AND plebiscite_id = ?'
          ).get(normalizedPhone, plebiscite_id);
          if (existingPhone) {
            return NextResponse.json(
              { error: 'Phone number already exists in this election\'s voter roll' },
              { status: 409 }
            );
          }
        }

        db.prepare(
          'INSERT INTO voter_roll (email, phone, plebiscite_id) VALUES (?, ?, ?)'
        ).run(normalizedEmail, normalizedPhone, plebiscite_id);
        
        return NextResponse.json({ success: true });
      } catch (error: any) {
        if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
          return NextResponse.json(
            { error: 'Voter already exists in this election\'s voter roll' },
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

function handleVoterUpload(voters: Array<{email?: string | null; phone?: string | null}>, plebisciteId: number) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  
  let insertedCount = 0;
  let duplicateCount = 0;
  let invalidCount = 0;

  const insertVoter = db.prepare(`
    INSERT INTO voter_roll (email, phone, plebiscite_id)
    VALUES (?, ?, ?)
  `);

  const checkEmailExists = db.prepare(
    'SELECT id FROM voter_roll WHERE email = ? AND plebiscite_id = ?'
  );

  const checkPhoneExists = db.prepare(
    'SELECT id FROM voter_roll WHERE phone = ? AND plebiscite_id = ?'
  );

  const insertMany = db.transaction((voterList: typeof voters) => {
    for (const voter of voterList) {
      const email = voter.email?.trim().toLowerCase() || null;
      const phone = voter.phone ? normalizePhoneNumber(voter.phone.trim()) : null;

      if (!email && !phone) {
        invalidCount++;
        continue;
      }

      if (email && !emailRegex.test(email)) {
        invalidCount++;
        continue;
      }

      let isDuplicate = false;
      if (email) {
        const existing = checkEmailExists.get(email, plebisciteId);
        if (existing) isDuplicate = true;
      }
      if (phone && !isDuplicate) {
        const existing = checkPhoneExists.get(phone, plebisciteId);
        if (existing) isDuplicate = true;
      }

      if (isDuplicate) {
        duplicateCount++;
        continue;
      }

      try {
        insertVoter.run(email, phone, plebisciteId);
        insertedCount++;
      } catch (e) {
        duplicateCount++;
      }
    }
  });

  insertMany(voters);

  return NextResponse.json({
    success: true,
    inserted: insertedCount,
    duplicates: duplicateCount,
    invalid: invalidCount
  });
}

export async function DELETE(request: NextRequest) {
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
          { error: 'plebiscite_id is required for clear-all action' },
          { status: 400 }
        );
      }

      const participationCount = db.prepare(
        'SELECT COUNT(*) as count FROM participation WHERE plebiscite_id = ?'
      ).get(plebisciteId) as { count: number };
      
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

    const participation = db.prepare(
      'SELECT COUNT(*) as count FROM participation WHERE voter_roll_id = ?'
    ).get(id) as { count: number };
    
    if (participation.count > 0) {
      return NextResponse.json(
        { error: 'Cannot remove voter who has participated in plebiscites' },
        { status: 400 }
      );
    }

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
