import { NextRequest, NextResponse } from 'next/server';
import db, { generateReceiptCode } from '@/lib/db';
import { getVoterSessionFromRequest,
  validateCSRFRequest
} from '@/lib/auth';
import { votingClosedError } from '@/lib/election-window';
import { validateIRVVote } from '@/lib/irv';
import { validateCondorcetVote } from '@/lib/condorcet';
import { canonicalStringify, parseEncryptedPackage, sha256Base64Url } from '@/lib/encrypted-ballots';
import { encryptedBallotsEnabled } from '@/lib/encrypted-election-server';

class ElectionClosedDuringSubmissionError extends Error {}

function validatePreferentialLength(voteValue: unknown, options: string[], preferentialType: string | null | undefined, questionTitle: string): string | null {
  if (!Array.isArray(voteValue)) {
    return `Invalid ranking for question: ${questionTitle}`;
  }

  if (preferentialType === 'optional') {
    if (voteValue.length === 0) {
      return `Please rank at least one option for question: ${questionTitle}`;
    }
    if (voteValue.length > options.length) {
      return `Too many rankings for question: ${questionTitle}`;
    }
    return null;
  }

  if (voteValue.length !== options.length) {
    return `Must rank all options for question: ${questionTitle}`;
  }

  return null;
}

export async function POST(request: NextRequest) {
  if (!validateCSRFRequest(request)) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { plebisciteSlug, votes } = body;

    if (typeof plebisciteSlug !== 'string' || !plebisciteSlug || plebisciteSlug.length > 80) {
      return NextResponse.json(
        { error: 'Election link is required' },
        { status: 400 }
      );
    }

    // Get voter session
    const session = getVoterSessionFromRequest(request, plebisciteSlug);
    if (!session) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Get plebiscite
    const plebiscite = db.prepare('SELECT * FROM plebiscites WHERE slug = ? AND status = ?').get(plebisciteSlug, 'open') as any;
    if (!plebiscite) {
      return NextResponse.json(
        { error: 'Election not found or not currently open' },
        { status: 404 }
      );
    }

    // Verify session matches plebiscite
    if (session.plebisciteId !== plebiscite.id) {
      return NextResponse.json(
        { error: 'Invalid session for this election' },
        { status: 403 }
      );
    }

    const closedError = votingClosedError(plebiscite);
    if (closedError) {
      return NextResponse.json({ error: closedError }, { status: 403 });
    }

    const voter = session.voterRollId ? db.prepare(`
      SELECT * FROM voter_roll WHERE id = ? AND plebiscite_id = ? LIMIT 1
    `).get(session.voterRollId, plebiscite.id) as any : null;
    const anonymousCode = session.anonymousCodeId ? db.prepare(`
      SELECT id, used FROM anonymous_access_codes WHERE id = ? AND plebiscite_id = ? LIMIT 1
    `).get(session.anonymousCodeId, plebiscite.id) as { id: number; used: number } | undefined : null;
    if (plebiscite.access_mode === 'anonymous_codes' ? (!anonymousCode || anonymousCode.used) : !voter) {
      return NextResponse.json(
        { error: 'Voting credential is invalid or has already been used' },
        { status: 403 }
      );
    }

    // Check if user has already voted. Encrypted submissions can safely retry
    // the same submission ID if the acknowledgement was interrupted.
    const hasVoted = plebiscite.access_mode === 'anonymous_codes'
      ? db.prepare('SELECT * FROM participation WHERE plebiscite_id = ? AND anonymous_code_id = ?').get(plebiscite.id, anonymousCode!.id) as any
      : db.prepare('SELECT * FROM participation WHERE plebiscite_id = ? AND voter_roll_id = ?').get(plebiscite.id, voter.id) as any;

    if (hasVoted) {
      if (plebiscite.privacy_mode === 'encrypted' && typeof body.submissionId === 'string') {
        const accepted = db.prepare(`
          SELECT 1 FROM encrypted_ballots
          WHERE plebiscite_id = ? AND voter_roll_id = ? AND submission_id = ?
        `).get(plebiscite.id, voter.id, body.submissionId);
        if (accepted) return NextResponse.json({ success: true, message: 'Encrypted ballot already accepted' });
      }
      return NextResponse.json(
        { error: 'You have already voted in this election' },
        { status: 409 }
      );
    }

    // Get questions
    const questions = db.prepare('SELECT * FROM questions WHERE plebiscite_id = ? ORDER BY display_order')
      .all(plebiscite.id);

    if (questions.length === 0) {
      return NextResponse.json(
        { error: 'No questions found for this election' },
        { status: 400 }
      );
    }

    if (plebiscite.privacy_mode === 'encrypted') {
      if (plebiscite.access_mode === 'anonymous_codes') {
        return NextResponse.json({ error: 'Encrypted ballot mode does not yet support anonymous access codes' }, { status: 409 });
      }
      if (!encryptedBallotsEnabled) {
        return NextResponse.json({ error: 'Encrypted ballot support is unavailable' }, { status: 503 });
      }
      if (votes !== undefined) {
        return NextResponse.json({ error: 'This election accepts encrypted ballots only' }, { status: 400 });
      }
      const submissionId = body.submissionId;
      const encryptedPackage = parseEncryptedPackage(body.encryptedPackage, Number(plebiscite.envelope_plaintext_bytes));
      if (
        typeof submissionId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f-]{27}$/iu.test(submissionId) ||
        body.manifestHash !== plebiscite.manifest_hash || !encryptedPackage
      ) return NextResponse.json({ error: 'Invalid encrypted ballot envelope' }, { status: 400 });
      const commitment = await sha256Base64Url(canonicalStringify(encryptedPackage));
      if (body.commitment !== commitment) return NextResponse.json({ error: 'Encrypted ballot commitment mismatch' }, { status: 400 });

      const acceptEncryptedBallot = db.transaction(() => {
        const currentElection = db.prepare(
          'SELECT status, close_date, close_state FROM plebiscites WHERE id = ?'
        ).get(plebiscite.id) as any;
        if (!currentElection || currentElection.status !== 'open' || votingClosedError(currentElection)) {
          throw new ElectionClosedDuringSubmissionError('Voting has closed for this election');
        }
        db.prepare('INSERT INTO participation (plebiscite_id, voter_roll_id) VALUES (?, ?)')
          .run(plebiscite.id, voter.id);
        db.prepare(`
          INSERT INTO encrypted_ballots
            (submission_id, plebiscite_id, voter_roll_id, ciphertext_package, commitment)
          VALUES (?, ?, ?, ?, ?)
        `).run(submissionId, plebiscite.id, voter.id, canonicalStringify(encryptedPackage), commitment);
      });
      acceptEncryptedBallot.immediate();
      return NextResponse.json({ success: true, message: 'Encrypted ballot accepted', commitment });
    }

    if (!votes || typeof votes !== 'object' || Array.isArray(votes)) {
      return NextResponse.json({ error: 'Votes are required' }, { status: 400 });
    }

    // Validate votes
    const voteEntries = Object.entries(votes);
    if (voteEntries.length !== questions.length) {
      return NextResponse.json(
        { error: 'Must answer all questions' },
        { status: 400 }
      );
    }

    const validatedVotes = [];

    for (const question of questions as any[]) {
      const voteValue = votes[question.id];
      const options = JSON.parse(question.options);

      if (voteValue === undefined || voteValue === null) {
        return NextResponse.json(
          { error: `Answer required for question: ${question.title}` },
          { status: 400 }
        );
      }

      // Validate based on question type
      if (question.type === 'yes_no') {
        if (!options.includes(voteValue)) {
          return NextResponse.json(
            { error: `Invalid answer for question: ${question.title}` },
            { status: 400 }
          );
        }
        validatedVotes.push({
          questionId: question.id,
          voteData: { choice: voteValue }
        });

      } else if (question.type === 'multiple_choice') {
        if (!Array.isArray(voteValue) || voteValue.length === 0) {
          return NextResponse.json(
            { error: `At least one selection required for question: ${question.title}` },
            { status: 400 }
          );
        }

        if (new Set(voteValue).size !== voteValue.length) {
          return NextResponse.json(
            { error: `Duplicate selections are not allowed for question: ${question.title}` },
            { status: 400 }
          );
        }

        // Check all selected options are valid
        for (const choice of voteValue) {
          if (!options.includes(choice)) {
            return NextResponse.json(
              { error: `Invalid selection for question: ${question.title}` },
              { status: 400 }
            );
          }
        }

        validatedVotes.push({
          questionId: question.id,
          voteData: { choices: voteValue }
        });

      } else if (question.type === 'ranked_choice') {
        const lengthError = validatePreferentialLength(voteValue, options, question.preferential_type, question.title);
        if (lengthError) {
          return NextResponse.json(
            { error: lengthError },
            { status: 400 }
          );
        }

        // Validate IRV vote
        if (!validateIRVVote(voteValue as string[], options)) {
          return NextResponse.json(
            { error: `Invalid ranking for question: ${question.title}` },
            { status: 400 }
          );
        }

        validatedVotes.push({
          questionId: question.id,
          voteData: { preferences: voteValue }
        });

      } else if (question.type === 'condorcet') {
        const lengthError = validatePreferentialLength(voteValue, options, question.preferential_type, question.title);
        if (lengthError) {
          return NextResponse.json(
            { error: lengthError },
            { status: 400 }
          );
        }

        if (!validateCondorcetVote(voteValue as string[], options)) {
          return NextResponse.json(
            { error: `Invalid ranking for question: ${question.title}` },
            { status: 400 }
          );
        }

        validatedVotes.push({
          questionId: question.id,
          voteData: { preferences: voteValue }
        });
      } else {
        return NextResponse.json(
          { error: `Unsupported question type for question: ${question.title}` },
          { status: 400 }
        );
      }
    }

    // Submit votes in a transaction
    const submitVotes = db.transaction((validatedVotes, participationData) => {
      const receiptCodes = [];

      // Acquire the write lock before checking lifecycle state. This makes the
      // vote and close transactions serialize: either this ballot commits and
      // is included in close-time shuffling, or close wins and this submission
      // is rejected without writing a partial ballot.
      const currentElection = db.prepare(
        'SELECT status, close_date, close_state FROM plebiscites WHERE id = ?'
      ).get(participationData.plebisciteId) as { status: string; close_date: string } | undefined;
      if (!currentElection || currentElection.status !== 'open' || votingClosedError(currentElection)) {
        throw new ElectionClosedDuringSubmissionError('Voting has closed for this election');
      }

      // Record participation first. This enforces one vote per voter inside the
      // same transaction, without storing any receipt code or ballot linkage on
      // the voter identity record.
      if (participationData.anonymousCodeId) {
        const consumed = db.prepare(`UPDATE anonymous_access_codes SET used = TRUE WHERE id = ? AND plebiscite_id = ? AND used = FALSE`)
          .run(participationData.anonymousCodeId, participationData.plebisciteId);
        if (consumed.changes !== 1) throw new Error('Anonymous voting code has already been used');
        db.prepare(`INSERT INTO participation (plebiscite_id, anonymous_code_id) VALUES (?, ?)`)
          .run(participationData.plebisciteId, participationData.anonymousCodeId);
      } else {
        db.prepare(`INSERT INTO participation (plebiscite_id, voter_roll_id) VALUES (?, ?)`)
          .run(participationData.plebisciteId, participationData.voterRollId);
      }

      // Insert anonymous vote records. Receipt codes belong only to ballots and
      // are returned to the voter once; they are not retained against identity.
      const insertVote = db.prepare(`
        INSERT INTO votes (question_id, vote_data, receipt_code)
        VALUES (?, ?, ?)
      `);

      for (const vote of validatedVotes) {
        const receiptCode = generateReceiptCode();
        insertVote.run(
          vote.questionId,
          JSON.stringify(vote.voteData),
          receiptCode
        );
        receiptCodes.push(receiptCode);
      }

      return receiptCodes;
    });

    const receiptCodes = submitVotes.immediate(validatedVotes, {
      plebisciteId: plebiscite.id,
      voterRollId: voter?.id || null,
      anonymousCodeId: anonymousCode?.id || null
    });

    const sessionId = request.cookies.get(`voter-session-${plebisciteSlug}`)?.value;
    if (sessionId) {
      db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
    }

    // Clear voter session (they can only vote once)
    const response = NextResponse.json({
      success: true,
      message: 'Vote submitted successfully',
      receiptCodes: receiptCodes,
      plebisciteTitle: plebiscite.title
    });

    // Clear the session cookie
    response.cookies.delete(`voter-session-${plebisciteSlug}`);

    return response;

  } catch (error) {
    if (error instanceof ElectionClosedDuringSubmissionError) {
      return NextResponse.json(
        { error: error.message },
        { status: 403 }
      );
    }

    if ((error as any)?.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return NextResponse.json(
        { error: 'You have already voted in this election' },
        { status: 409 }
      );
    }

    console.error('Vote submission error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
