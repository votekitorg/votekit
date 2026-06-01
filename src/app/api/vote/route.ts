import { NextRequest, NextResponse } from 'next/server';
import db, { generateReceiptCode } from '@/lib/db';
import { getVoterSessionFromRequest } from '@/lib/auth';
import { validateIRVVote } from '@/lib/irv';
import { validateCondorcetVote } from '@/lib/condorcet';

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
  try {
    const body = await request.json();
    const { plebisciteSlug, votes } = body;

    if (!plebisciteSlug || !votes) {
      return NextResponse.json(
        { error: 'Plebiscite slug and votes are required' },
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
        { error: 'Plebiscite not found or not currently open' },
        { status: 404 }
      );
    }

    // Verify session matches plebiscite
    if (session.plebisciteId !== plebiscite.id) {
      return NextResponse.json(
        { error: 'Invalid session for this plebiscite' },
        { status: 403 }
      );
    }

    // Status check is sufficient - admin controls open/close manually

    // Get voter from roll
    const voter = db.prepare(`
      SELECT * FROM voter_roll
      WHERE email = ? AND (plebiscite_id = ? OR plebiscite_id IS NULL)
      ORDER BY CASE WHEN plebiscite_id = ? THEN 0 ELSE 1 END
      LIMIT 1
    `).get(session.email, plebiscite.id, plebiscite.id) as any;
    if (!voter) {
      return NextResponse.json(
        { error: 'Voter not found' },
        { status: 403 }
      );
    }

    // Check if user has already voted
    const hasVoted = db.prepare('SELECT * FROM participation WHERE plebiscite_id = ? AND voter_roll_id = ?')
      .get(plebiscite.id, voter.id) as any;
    
    if (hasVoted) {
      return NextResponse.json(
        { error: 'You have already voted in this plebiscite' },
        { status: 409 }
      );
    }

    // Get questions
    const questions = db.prepare('SELECT * FROM questions WHERE plebiscite_id = ? ORDER BY display_order')
      .all(plebiscite.id);

    if (questions.length === 0) {
      return NextResponse.json(
        { error: 'No questions found for this plebiscite' },
        { status: 400 }
      );
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

      // Record participation first. This enforces one vote per voter inside the
      // same transaction, without storing any receipt code or ballot linkage on
      // the voter identity record.
      const insertParticipation = db.prepare(`
        INSERT INTO participation (plebiscite_id, voter_roll_id)
        VALUES (?, ?)
      `);

      insertParticipation.run(
        participationData.plebisciteId,
        participationData.voterRollId
      );

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

    const receiptCodes = submitVotes(validatedVotes, {
      plebisciteId: plebiscite.id,
      voterRollId: voter.id
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
    if ((error as any)?.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return NextResponse.json(
        { error: 'You have already voted in this plebiscite' },
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
