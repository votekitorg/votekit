import { NextRequest, NextResponse } from 'next/server';
import { getAdminSessionFromRequest } from '@/lib/auth';
import db, { generateUniqueSlug } from '@/lib/db';

export async function GET(request: NextRequest) {
  const adminSession = getAdminSessionFromRequest(request);
  if (!adminSession) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const plebiscites = db.prepare(`
      SELECT 
        p.*,
        (SELECT COUNT(*) FROM participation WHERE plebiscite_id = p.id) as vote_count,
        (SELECT COUNT(*) FROM questions WHERE plebiscite_id = p.id) as question_count
      FROM plebiscites p
      ORDER BY p.created_at DESC
    `).all();

    return NextResponse.json({ 
      plebiscites: plebiscites.map((p: any) => ({
        ...p,
        sms_enabled: !!p.sms_enabled
      }))
    });
  } catch (error) {
    console.error('Failed to fetch plebiscites:', error);
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
    const { title, description, info_url, open_date, close_date, timezone, questions = [], sms_enabled = false } = body;

    if (!title || !description || !open_date || !close_date) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    if (new Date(open_date) >= new Date(close_date)) {
      return NextResponse.json(
        { error: 'Close date must be after open date' },
        { status: 400 }
      );
    }

    if (questions.length === 0) {
      return NextResponse.json(
        { error: 'At least one question is required' },
        { status: 400 }
      );
    }

    for (const question of questions) {
      if (!question.title || !question.type || !question.options || question.options.length === 0) {
        return NextResponse.json(
          { error: 'Each question must have a title, type, and options' },
          { status: 400 }
        );
      }

      if (question.type === 'yes_no' && question.options.length !== 2) {
        return NextResponse.json(
          { error: 'Yes/No questions must have exactly 2 options' },
          { status: 400 }
        );
      }

      if ((question.type === 'multiple_choice' || question.type === 'ranked_choice' || question.type === 'condorcet') && question.options.length < 2) {
        return NextResponse.json(
          { error: 'Multiple choice and ranked choice questions must have at least 2 options' },
          { status: 400 }
        );
      }
    }

    const slug = generateUniqueSlug(title);

    const createPlebiscite = db.prepare(`
      INSERT INTO plebiscites (slug, title, description, info_url, open_date, close_date, status, sms_enabled, timezone)
      VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?)
    `);

    const result = createPlebiscite.run(slug, title, description, info_url, open_date, close_date, sms_enabled ? 1 : 0, timezone || 'UTC');
    const plebisciteId = result.lastInsertRowid;

    const createQuestion = db.prepare(`
      INSERT INTO questions (plebiscite_id, title, description, type, options, display_order, preferential_type)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    questions.forEach((question: any, index: number) => {
      createQuestion.run(
        plebisciteId,
        question.title,
        question.description || null,
        question.type,
        JSON.stringify(question.options),
        index,
        question.preferentialType || 'compulsory'
      );
    });

    return NextResponse.json({
      success: true,
      plebiscite: {
        id: plebisciteId,
        slug,
        title,
        description,
        info_url,
        open_date,
        close_date,
        timezone: timezone || 'UTC',
        status: 'draft',
        sms_enabled
      }
    });

  } catch (error) {
    console.error('Failed to create plebiscite:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  const adminSession = getAdminSessionFromRequest(request);
  if (!adminSession) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { id, action, ...updateData } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'Plebiscite ID is required' },
        { status: 400 }
      );
    }

    const plebiscite = db.prepare('SELECT * FROM plebiscites WHERE id = ?').get(id) as any;
    if (!plebiscite) {
      return NextResponse.json(
        { error: 'Plebiscite not found' },
        { status: 404 }
      );
    }

    if (action === 'open') {
      db.prepare('UPDATE plebiscites SET status = ? WHERE id = ?').run('open', id);
      return NextResponse.json({ success: true, status: 'open' });
    }

    if (action === 'close') {
      db.prepare('UPDATE plebiscites SET status = ? WHERE id = ?').run('closed', id);
      return NextResponse.json({ success: true, status: 'closed' });
    }

    if (action === 'toggle_sms') {
      const newValue = !plebiscite.sms_enabled;
      db.prepare('UPDATE plebiscites SET sms_enabled = ? WHERE id = ?').run(newValue ? 1 : 0, id);
      return NextResponse.json({ success: true, sms_enabled: newValue });
    }

    const { title, description, info_url, open_date, close_date, sms_enabled } = updateData;

    if (sms_enabled !== undefined) {
      db.prepare('UPDATE plebiscites SET sms_enabled = ? WHERE id = ?').run(sms_enabled ? 1 : 0, id);
    }

    if (plebiscite.status === 'draft') {
      const updateFields = [];
      const updateValues: any[] = [];

      if (title !== undefined) {
        updateFields.push('title = ?');
        updateValues.push(title);
      }
      if (description !== undefined) {
        updateFields.push('description = ?');
        updateValues.push(description);
      }
      if (info_url !== undefined) {
        updateFields.push('info_url = ?');
        updateValues.push(info_url);
      }
      if (open_date !== undefined) {
        updateFields.push('open_date = ?');
        updateValues.push(open_date);
      }
      if (close_date !== undefined) {
        updateFields.push('close_date = ?');
        updateValues.push(close_date);
      }

      if (updateFields.length > 0) {
        updateValues.push(id);
        db.prepare(`UPDATE plebiscites SET ${updateFields.join(', ')} WHERE id = ?`)
          .run(...updateValues);
      }
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Failed to update plebiscite:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const adminSession = getAdminSessionFromRequest(request);
  if (!adminSession) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const id = url.searchParams.get('id') as any;

    if (!id) {
      return NextResponse.json(
        { error: 'Plebiscite ID is required' },
        { status: 400 }
      );
    }

    const plebiscite = db.prepare('SELECT * FROM plebiscites WHERE id = ?').get(id) as any;
    if (!plebiscite) {
      return NextResponse.json(
        { error: 'Plebiscite not found' },
        { status: 404 }
      );
    }

    const voteCount = db.prepare('SELECT COUNT(*) as count FROM participation WHERE plebiscite_id = ?').get(id) as { count: number };
    if (voteCount.count > 0) {
      return NextResponse.json(
        { error: 'Cannot delete plebiscite with existing votes' },
        { status: 400 }
      );
    }

    db.prepare('DELETE FROM plebiscites WHERE id = ?').run(id);

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Failed to delete plebiscite:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
