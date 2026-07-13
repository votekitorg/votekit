import { NextRequest, NextResponse } from 'next/server';
import { getAdminSessionFromRequest, recordAdminAuditLog, requireAdminRole,
  validateCSRFRequest
} from '@/lib/auth';
import db, { closePlebisciteWithPrivacyHardening, generateUniqueSlug } from '@/lib/db';
import { parseElectionCloseDate, votingClosedError } from '@/lib/election-window';

const MAX_TITLE_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 20_000;
const MAX_QUESTIONS = 100;
const MAX_OPTIONS = 100;
const MAX_OPTION_LENGTH = 500;
const QUESTION_TYPES = new Set(['yes_no', 'multiple_choice', 'ranked_choice', 'condorcet']);

function validHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function validateElectionDates(openDate: unknown, closeDate: unknown): string | null {
  if (typeof openDate !== 'string' || typeof closeDate !== 'string') {
    return 'Opening and closing dates are required';
  }
  const parsedOpen = parseElectionCloseDate(openDate);
  const parsedClose = parseElectionCloseDate(closeDate);
  if (Number.isNaN(parsedOpen.getTime()) || Number.isNaN(parsedClose.getTime())) {
    return 'Opening and closing dates must be valid';
  }
  if (parsedOpen >= parsedClose) return 'Close date must be after open date';
  return null;
}

export async function GET(request: NextRequest) {
  // Verify admin authentication
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

    return NextResponse.json({ plebiscites });
  } catch (error) {
    console.error('Failed to fetch plebiscites:', error);
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
  if (!requireAdminRole(adminSession)) {
    return NextResponse.json({ error: 'Admin role required' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { title, description, info_url, open_date, close_date, questions = [] } = body;

    // Validation
    if (typeof title !== 'string' || !title.trim() || typeof description !== 'string' || !description.trim()) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }
    if (title.trim().length > MAX_TITLE_LENGTH || description.trim().length > MAX_DESCRIPTION_LENGTH) {
      return NextResponse.json(
        { error: 'Election title or description is too long' },
        { status: 400 }
      );
    }
    if (info_url && (typeof info_url !== 'string' || info_url.length > 2048 || !validHttpUrl(info_url))) {
      return NextResponse.json({ error: 'Information URL must be a valid HTTP or HTTPS URL' }, { status: 400 });
    }
    const dateError = validateElectionDates(open_date, close_date);
    if (dateError) return NextResponse.json({ error: dateError }, { status: 400 });

    if (!Array.isArray(questions) || questions.length === 0 || questions.length > MAX_QUESTIONS) {
      return NextResponse.json(
        { error: `Between 1 and ${MAX_QUESTIONS} questions are required` },
        { status: 400 }
      );
    }

    // Validate questions
    for (const question of questions) {
      if (
        typeof question?.title !== 'string' || !question.title.trim() || question.title.trim().length > MAX_TITLE_LENGTH ||
        !QUESTION_TYPES.has(question?.type) || !Array.isArray(question?.options) ||
        question.options.length === 0 || question.options.length > MAX_OPTIONS ||
        question.options.some((option: unknown) => typeof option !== 'string' || !option.trim() || option.trim().length > MAX_OPTION_LENGTH)
      ) {
        return NextResponse.json(
          { error: 'Each question must have a valid title, type, and option list' },
          { status: 400 }
        );
      }

      const normalizedOptions = question.options.map((option: string) => option.trim());
      if (new Set(normalizedOptions).size !== normalizedOptions.length) {
        return NextResponse.json({ error: 'Question options must be unique' }, { status: 400 });
      }
      if (question.preferentialType && !['compulsory', 'optional'].includes(question.preferentialType)) {
        return NextResponse.json({ error: 'Invalid preferential voting rule' }, { status: 400 });
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

    const normalizedTitle = title.trim();
    const normalizedDescription = description.trim();
    const normalizedInfoUrl = typeof info_url === 'string' ? info_url.trim() || null : null;
    const slug = generateUniqueSlug(normalizedTitle);
    const createElection = db.transaction(() => {
      const result = db.prepare(`
        INSERT INTO plebiscites (slug, title, description, info_url, open_date, close_date, status)
        VALUES (?, ?, ?, ?, ?, ?, 'draft')
      `).run(slug, normalizedTitle, normalizedDescription, normalizedInfoUrl, open_date, close_date);
      const plebisciteId = Number(result.lastInsertRowid);
      const createQuestion = db.prepare(`
        INSERT INTO questions (plebiscite_id, title, description, type, options, display_order, preferential_type)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      questions.forEach((question: any, index: number) => {
        createQuestion.run(
          plebisciteId,
          question.title.trim(),
          typeof question.description === 'string' ? question.description.trim() || null : null,
          question.type,
          JSON.stringify(question.options.map((option: string) => option.trim())),
          index,
          question.preferentialType || 'compulsory'
        );
      });

      recordAdminAuditLog({
        adminUserId: adminSession.adminUserId,
        action: 'plebiscite.create',
        targetType: 'plebiscite',
        targetId: plebisciteId,
        details: { slug, title: normalizedTitle, questionCount: questions.length }
      });
      return plebisciteId;
    });
    const plebisciteId = createElection.immediate();

    return NextResponse.json({
      success: true,
      plebiscite: {
        id: plebisciteId,
        slug,
        title: normalizedTitle,
        description: normalizedDescription,
        info_url: normalizedInfoUrl,
        open_date,
        close_date,
        status: 'draft'
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
  if (!validateCSRFRequest(request)) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 403 });
  }

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
    const { id, action, ...updateData } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'Election ID is required' },
        { status: 400 }
      );
    }

    // Get current plebiscite
    const plebiscite = db.prepare('SELECT * FROM plebiscites WHERE id = ?').get(id) as any;
    if (!plebiscite) {
      return NextResponse.json(
        { error: 'Election not found' },
        { status: 404 }
      );
    }

    if (action === 'open') {
      if (plebiscite.status !== 'draft') {
        return NextResponse.json(
          { error: 'Only draft elections can be opened' },
          { status: 400 }
        );
      }

      const voterCount = db.prepare('SELECT COUNT(*) AS count FROM voter_roll WHERE plebiscite_id = ?')
        .get(id) as { count: number };
      const questionCount = db.prepare('SELECT COUNT(*) AS count FROM questions WHERE plebiscite_id = ?')
        .get(id) as { count: number };
      if (voterCount.count === 0 || questionCount.count === 0) {
        return NextResponse.json(
          { error: 'An election must have at least one voter and one question before it can open' },
          { status: 400 }
        );
      }
      if (votingClosedError(plebiscite)) {
        return NextResponse.json(
          { error: 'The closing date must be in the future before this election can open' },
          { status: 400 }
        );
      }

      // Open plebiscite
      db.prepare('UPDATE plebiscites SET status = ? WHERE id = ?')
        .run('open', id);
      recordAdminAuditLog({
        adminUserId: adminSession.adminUserId,
        action: 'plebiscite.open',
        targetType: 'plebiscite',
        targetId: id,
        details: { slug: plebiscite.slug }
      });

      return NextResponse.json({ success: true, status: 'open' });
    }

    if (action === 'close') {
      if (plebiscite.status !== 'open') {
        return NextResponse.json(
          { error: 'Only open elections can be closed' },
          { status: 400 }
        );
      }

      // Close and harden atomically: shuffle anonymous ballots and purge
      // voter sessions/used verification codes for this plebiscite.
      closePlebisciteWithPrivacyHardening(Number(id));
      recordAdminAuditLog({
        adminUserId: adminSession.adminUserId,
        action: 'plebiscite.close',
        targetType: 'plebiscite',
        targetId: id,
        details: { slug: plebiscite.slug }
      });

      return NextResponse.json({ success: true, status: 'closed' });
    }

    // Regular update
    const { title, description, info_url, open_date, close_date } = updateData;

    // Validation for regular updates
    if ((plebiscite as any).status !== 'draft') {
      return NextResponse.json(
        { error: 'Can only edit draft elections' },
        { status: 400 }
      );
    }

    if (title !== undefined && (typeof title !== 'string' || !title.trim() || title.trim().length > MAX_TITLE_LENGTH)) {
      return NextResponse.json({ error: 'Election title is invalid' }, { status: 400 });
    }
    if (description !== undefined && (typeof description !== 'string' || !description.trim() || description.trim().length > MAX_DESCRIPTION_LENGTH)) {
      return NextResponse.json({ error: 'Election description is invalid' }, { status: 400 });
    }
    if (info_url !== undefined && info_url !== '' && (typeof info_url !== 'string' || info_url.length > 2048 || !validHttpUrl(info_url))) {
      return NextResponse.json({ error: 'Information URL must be a valid HTTP or HTTPS URL' }, { status: 400 });
    }
    const dateError = validateElectionDates(open_date ?? plebiscite.open_date, close_date ?? plebiscite.close_date);
    if (dateError) return NextResponse.json({ error: dateError }, { status: 400 });

    const updateFields = [];
    const updateValues = [];

    if (title !== undefined) {
      updateFields.push('title = ?');
      updateValues.push(title.trim());
    }
    if (description !== undefined) {
      updateFields.push('description = ?');
      updateValues.push(description.trim());
    }
    if (info_url !== undefined) {
      updateFields.push('info_url = ?');
      updateValues.push(info_url.trim() || null);
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
      recordAdminAuditLog({
        adminUserId: adminSession.adminUserId,
        action: 'plebiscite.update',
        targetType: 'plebiscite',
        targetId: id,
        details: { fields: updateFields.map(field => field.split(' = ')[0]) }
      });
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
  if (!validateCSRFRequest(request)) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 403 });
  }

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

    if (!id) {
      return NextResponse.json(
        { error: 'Election ID is required' },
        { status: 400 }
      );
    }

    // Check if plebiscite exists and has no votes
    const plebiscite = db.prepare('SELECT * FROM plebiscites WHERE id = ?').get(id) as any;
    if (!plebiscite) {
      return NextResponse.json(
        { error: 'Election not found' },
        { status: 404 }
      );
    }

    if (plebiscite.status !== 'draft') {
      return NextResponse.json(
        { error: 'Only draft elections can be deleted' },
        { status: 400 }
      );
    }

    const voteCount = db.prepare('SELECT COUNT(*) as count FROM participation WHERE plebiscite_id = ?').get(id) as { count: number };
    if (voteCount.count > 0) {
      return NextResponse.json(
        { error: 'Cannot delete election with existing votes' },
        { status: 400 }
      );
    }

    // Delete plebiscite (cascade will delete questions)
    db.prepare('DELETE FROM plebiscites WHERE id = ?').run(id);
    recordAdminAuditLog({
      adminUserId: adminSession.adminUserId,
      action: 'plebiscite.delete',
      targetType: 'plebiscite',
      targetId: id,
      details: { slug: plebiscite.slug }
    });

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Failed to delete plebiscite:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
