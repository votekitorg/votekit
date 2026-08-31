import { NextRequest, NextResponse } from 'next/server';
import { canAccessElection, canManageElection, canManageElections, getAdminSessionFromRequest, listAccessibleElectionIds, recordAdminAuditLog,
  validateCSRFRequest
} from '@/lib/auth';
import db, { closePlebisciteWithPrivacyHardening, generateUniqueSlug } from '@/lib/db';
import { parseElectionCloseDate } from '@/lib/election-window';
import { randomUUID } from 'crypto';
import { encryptedBallotsEnabled } from '@/lib/encrypted-election-server';
import { openElectionNow } from '@/lib/election-opening';

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

function brisbaneDateTimeInput(date: Date): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Australia/Brisbane', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  }).format(date).replace(' ', 'T');
}

export async function GET(request: NextRequest) {
  // Verify admin authentication
  const adminSession = getAdminSessionFromRequest(request);
  if (!adminSession) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const accessibleIds = listAccessibleElectionIds(adminSession);
    if (accessibleIds?.length === 0) return NextResponse.json({ plebiscites: [] });
    const scope = accessibleIds
      ? `WHERE p.archived_at IS NULL AND p.id IN (${accessibleIds.map(() => '?').join(',')})`
      : 'WHERE p.archived_at IS NULL';
    const plebiscites = db.prepare(`
      SELECT 
        p.*,
        (SELECT COUNT(*) FROM participation WHERE plebiscite_id = p.id) as vote_count,
        (SELECT COUNT(*) FROM questions WHERE plebiscite_id = p.id) as question_count
      FROM plebiscites p
      ${scope}
      ORDER BY p.created_at DESC
    `).all(...(accessibleIds || []));

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
  if (!canManageElections(adminSession.role)) {
    return NextResponse.json({ error: 'Owner or Returning Officer role required' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const {
      title, description, info_url, open_date, close_date, opening_mode = 'immediate',
      questions = [], access_mode = 'voter_roll', results_visibility = 'eligible',
      sms_enabled = false, setup_draft_id
    } = body;

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
    if (!['immediate', 'scheduled'].includes(opening_mode)) {
      return NextResponse.json({ error: 'Invalid opening mode' }, { status: 400 });
    }
    const effectiveOpenDate = opening_mode === 'immediate' ? brisbaneDateTimeInput(new Date()) : open_date;
    const dateError = validateElectionDates(effectiveOpenDate, close_date);
    if (dateError) return NextResponse.json({ error: dateError }, { status: 400 });
    const now = new Date();
    if (parseElectionCloseDate(close_date) <= now) {
      return NextResponse.json({ error: 'Closing date must be in the future' }, { status: 400 });
    }
    if (opening_mode === 'scheduled' && parseElectionCloseDate(effectiveOpenDate) <= now) {
      return NextResponse.json({ error: 'Scheduled opening must be in the future' }, { status: 400 });
    }
    if (!['voter_roll', 'anonymous_codes'].includes(access_mode)) {
      return NextResponse.json({ error: 'Invalid voter access mode' }, { status: 400 });
    }
    if (!['eligible', 'public'].includes(results_visibility)) {
      return NextResponse.json({ error: 'Invalid results visibility' }, { status: 400 });
    }
    const setupDraftId = setup_draft_id === null || setup_draft_id === undefined ? null : Number(setup_draft_id);
    if (setupDraftId !== null) {
      if (!Number.isInteger(setupDraftId) || setupDraftId < 1) {
        return NextResponse.json({ error: 'Invalid setup draft' }, { status: 400 });
      }
      const ownedDraft = db.prepare(`
        SELECT id FROM election_setup_drafts
        WHERE id = ? AND created_by_admin_user_id = ?
      `).get(setupDraftId, adminSession.adminUserId);
      if (!ownedDraft) return NextResponse.json({ error: 'Setup draft not found' }, { status: 404 });
    }

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
      if (question.continueAfterMajority !== undefined && typeof question.continueAfterMajority !== 'boolean') {
        return NextResponse.json({ error: 'Invalid full preference distribution setting' }, { status: 400 });
      }
      if (question.type !== 'ranked_choice' && question.continueAfterMajority === true) {
        return NextResponse.json({ error: 'Full preference distribution is available only for ranked-choice questions' }, { status: 400 });
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
      const privacyMode = encryptedBallotsEnabled && access_mode === 'voter_roll' ? 'encrypted' : 'legacy';
      const result = db.prepare(`
        INSERT INTO plebiscites (slug, title, description, info_url, open_date, close_date, opening_mode, status, privacy_mode, created_by_admin_user_id, access_mode, results_visibility, sms_enabled, configuration_published_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `).run(slug, normalizedTitle, normalizedDescription, normalizedInfoUrl, effectiveOpenDate, close_date, opening_mode, privacyMode, adminSession.adminUserId, access_mode, results_visibility, sms_enabled ? 1 : 0);
      const plebisciteId = Number(result.lastInsertRowid);
      if (adminSession.role === 'returning_officer') {
        db.prepare(`INSERT INTO election_team_members (plebiscite_id, admin_user_id, role, assigned_by_admin_user_id)
          VALUES (?, ?, 'returning_officer', ?)`
        ).run(plebisciteId, adminSession.adminUserId, adminSession.adminUserId);
      }
      const createQuestion = db.prepare(`
        INSERT INTO questions (plebiscite_id, title, description, type, options, display_order, preferential_type, public_id, continue_after_majority)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      questions.forEach((question: any, index: number) => {
        createQuestion.run(
          plebisciteId,
          question.title.trim(),
          typeof question.description === 'string' ? question.description.trim() || null : null,
          question.type,
          JSON.stringify(question.options.map((option: string) => option.trim())),
          index,
          question.preferentialType || 'compulsory',
          randomUUID(),
          question.type === 'ranked_choice' && question.continueAfterMajority === true ? 1 : 0
        );
      });

      if (setupDraftId !== null) {
        db.prepare(`
          DELETE FROM election_setup_drafts
          WHERE id = ? AND created_by_admin_user_id = ?
        `).run(setupDraftId, adminSession.adminUserId);
      }

      recordAdminAuditLog({
        adminUserId: adminSession.adminUserId,
        action: 'plebiscite.create',
        targetType: 'plebiscite',
        targetId: plebisciteId,
        details: {
          slug, title: normalizedTitle, questionCount: questions.length, privacyMode,
          accessMode: access_mode, resultsVisibility: results_visibility, openingMode: opening_mode,
          scheduledOpenDate: opening_mode === 'scheduled' ? effectiveOpenDate : null, setupDraftId
        }
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
        open_date: effectiveOpenDate,
        close_date,
        opening_mode,
        results_visibility,
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

  try {
    const body = await request.json();
    const { id, action, ...updateData } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'Election ID is required' },
        { status: 400 }
      );
    }
    if (!canManageElection(adminSession, Number(id))) {
      return NextResponse.json({ error: 'You do not have permission to manage this election' }, { status: 403 });
    }

    // Get current plebiscite
    const plebiscite = db.prepare('SELECT * FROM plebiscites WHERE id = ?').get(id) as any;
    if (!plebiscite) {
      return NextResponse.json(
        { error: 'Election not found' },
        { status: 404 }
      );
    }

    if (action === 'archive' || action === 'restore') {
      if (adminSession.role !== 'owner') {
        return NextResponse.json({ error: 'Only the Owner can archive or restore elections' }, { status: 403 });
      }
      if (action === 'archive') {
        if (plebiscite.archived_at) return NextResponse.json({ error: 'Election is already archived' }, { status: 400 });
        if (plebiscite.status === 'open') {
          return NextResponse.json({ error: 'Close voting before archiving this election' }, { status: 400 });
        }
        db.prepare('UPDATE plebiscites SET archived_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);
        recordAdminAuditLog({
          adminUserId: adminSession.adminUserId,
          action: 'plebiscite.archive',
          targetType: 'plebiscite',
          targetId: id,
          details: { slug: plebiscite.slug }
        });
        return NextResponse.json({ success: true, archived: true });
      }

      if (!plebiscite.archived_at) return NextResponse.json({ error: 'Election is not archived' }, { status: 400 });
      db.prepare('UPDATE plebiscites SET archived_at = NULL WHERE id = ?').run(id);
      recordAdminAuditLog({
        adminUserId: adminSession.adminUserId,
        action: 'plebiscite.restore',
        targetType: 'plebiscite',
        targetId: id,
        details: { slug: plebiscite.slug }
      });
      return NextResponse.json({ success: true, archived: false });
    }

    if (action === 'set_results_visibility') {
      if (adminSession.role !== 'owner') {
        return NextResponse.json({ error: 'Only the Owner can change results visibility' }, { status: 403 });
      }
      if (updateData.visibility !== 'eligible' && updateData.visibility !== 'public') {
        return NextResponse.json({ error: 'Invalid results visibility' }, { status: 400 });
      }
      db.prepare('UPDATE plebiscites SET results_visibility = ? WHERE id = ?').run(updateData.visibility, id);
      recordAdminAuditLog({
        adminUserId: adminSession.adminUserId,
        action: 'plebiscite.results_visibility.change',
        targetType: 'plebiscite',
        targetId: id,
        details: { slug: plebiscite.slug, from: plebiscite.results_visibility || 'eligible', to: updateData.visibility }
      });
      return NextResponse.json({ success: true, resultsVisibility: updateData.visibility });
    }

    if (action === 'set_ballot_publication') {
      if (adminSession.role !== 'owner') {
        return NextResponse.json({ error: 'Only the Owner can change anonymous ballot publication' }, { status: 403 });
      }
      if (plebiscite.status !== 'draft') {
        return NextResponse.json({ error: 'Anonymous ballot publication is locked once voting opens' }, { status: 409 });
      }
      if (plebiscite.archived_at) {
        return NextResponse.json({ error: 'Restore this election before changing ballot publication' }, { status: 409 });
      }
      const mode = updateData.mode;
      const threshold = Number(updateData.threshold);
      if (!['threshold', 'always'].includes(mode) ||
        (mode === 'threshold' && (!Number.isSafeInteger(threshold) || threshold < 20 || threshold > 10_000_000))) {
        return NextResponse.json({ error: 'Choose always publish or a threshold between 20 and 10,000,000' }, { status: 400 });
      }
      const previousMode = plebiscite.ballot_publication_mode || 'threshold';
      const previousThreshold = Number(plebiscite.privacy_threshold || 20);
      db.prepare(`UPDATE plebiscites SET ballot_publication_mode = ?, privacy_threshold = ? WHERE id = ?`)
        .run(mode, mode === 'threshold' ? threshold : previousThreshold, id);
      recordAdminAuditLog({
        adminUserId: adminSession.adminUserId,
        action: 'plebiscite.ballot_publication.change',
        targetType: 'plebiscite',
        targetId: id,
        details: {
          slug: plebiscite.slug,
          from: { mode: previousMode, threshold: previousThreshold },
          to: { mode, threshold: mode === 'threshold' ? threshold : null }
        }
      });
      return NextResponse.json({ success: true, mode, threshold: mode === 'threshold' ? threshold : null });
    }

    if (plebiscite.archived_at) {
      return NextResponse.json({ error: 'Restore this election before making changes' }, { status: 409 });
    }

    if (action === 'open') {
      if (plebiscite.status !== 'draft') {
        return NextResponse.json(
          { error: 'Only draft elections can be opened' },
          { status: 400 }
        );
      }

      const opened = await openElectionNow(Number(id), { adminUserId: adminSession.adminUserId, source: 'manual' });
      if (!opened.opened) return NextResponse.json({ error: opened.error }, { status: 400 });

      return NextResponse.json({ success: true, status: 'open' });
    }

    if (action === 'close') {
      if (plebiscite.status !== 'open') {
        return NextResponse.json(
          { error: 'Only open elections can be closed' },
          { status: 400 }
        );
      }

      if (plebiscite.privacy_mode === 'encrypted') {
        return NextResponse.json(
          { error: 'Encrypted elections must be decrypted and shuffled in this browser before closing' },
          { status: 409 }
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
    const { title, description, info_url, open_date, close_date, opening_mode, access_mode, sms_enabled } = updateData;

    // Validation for regular updates
    if ((plebiscite as any).status !== 'draft') {
      return NextResponse.json(
        { error: 'Can only edit draft elections' },
        { status: 400 }
      );
    }
    if (plebiscite.configuration_published_at && [title, description, info_url, open_date, close_date, opening_mode, access_mode, sms_enabled].some(value => value !== undefined)) {
      return NextResponse.json(
        { error: 'Published election wording, questions, access method and voting dates are locked' },
        { status: 409 }
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
    if (access_mode !== undefined && !['voter_roll', 'anonymous_codes'].includes(access_mode)) {
      return NextResponse.json({ error: 'Invalid voter access mode' }, { status: 400 });
    }
    if (opening_mode !== undefined && !['immediate', 'scheduled'].includes(opening_mode)) {
      return NextResponse.json({ error: 'Invalid opening mode' }, { status: 400 });
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
    if (opening_mode !== undefined) {
      updateFields.push('opening_mode = ?');
      updateValues.push(opening_mode);
    }
    if (access_mode !== undefined) {
      updateFields.push('access_mode = ?');
      updateValues.push(access_mode);
    }
    if (sms_enabled !== undefined) {
      updateFields.push('sms_enabled = ?');
      updateValues.push(sms_enabled ? 1 : 0);
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

  try {
    const url = new URL(request.url);
    const id = url.searchParams.get('id') as any;

    if (!id) {
      return NextResponse.json(
        { error: 'Election ID is required' },
        { status: 400 }
      );
    }
    if (adminSession.role !== 'owner') {
      return NextResponse.json({ error: 'Only the Owner can permanently delete elections' }, { status: 403 });
    }
    if (!canManageElection(adminSession, Number(id))) {
      return NextResponse.json({ error: 'You do not have permission to manage this election' }, { status: 403 });
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
