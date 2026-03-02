import { NextRequest, NextResponse } from 'next/server';
import db, { generateReceiptCode, normalizePhoneNumber } from '@/lib/db';
import { getVoterSessionFromRequest } from '@/lib/auth';
import { validateIRVVote } from '@/lib/irv';
import { validateCondorcetVote } from '@/lib/condorcet';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { plebisciteSlug, votes, verificationMethod } = body;

    if (!plebisciteSlug || !votes) {
      return NextResponse.json(
        { error: 'Plebiscite slug and votes are required' },
        { status: 400 }
      );
    }

    const session = getVoterSessionFromRequest(request, plebisciteSlug);
    if (!session) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const plebiscite = db.prepare('SELECT * FROM plebiscites WHERE slug = ? AND status = ?').get(plebisciteSlug, 'open') as any;
    if (!plebiscite) {
      return NextResponse.json(
        { error: 'Plebiscite not found or not currently open' },
        { status: 404 }
      );
    }

    if (session.plebisciteId !== plebiscite.id) {
      return NextResponse.json(
        { error: 'Invalid session for this plebiscite' },
        { status: 403 }
      );
    }

    let voter: any = null;
    const identifierType = session.identifierType || 'email';
    
    if (identifierType === 'phone') {
      const normalizedPhone = normalizePhoneNumber(session.email);
      voter = db.prepare('SELECT * FROM voter_roll WHERE phone = ? AND plebiscite_id = ?').get(normalizedPhone, plebiscite.id);
      if (!voter) {
        voter = db.prepare('SELECT * FROM voter_roll WHERE phone = ? AND plebiscite_id = ?').get(session.email, plebiscite.id);
      }
    } else {
      voter = db.prepare('SELECT * FROM voter_roll WHERE email = ? AND plebiscite_id = ?').get(session.email, plebiscite.id);
    }
    
    if (!voter) {
      return NextResponse.json(
        { error: 'Voter not found' },
        { status: 403 }
      );
    }

    const hasVoted = db.prepare('SELECT * FROM participation WHERE plebiscite_id = ? AND voter_roll_id = ?')
      .get(plebiscite.id, voter.id) as any;
    
    if (hasVoted) {
      return NextResponse.json(
        { error: 'You have already voted in this plebiscite' },
        { status: 409 }
      );
    }

    const questions = db.prepare('SELECT * FROM questions WHERE plebiscite_id = ? ORDER BY display_order')
      .all(plebiscite.id);

    if (questions.length === 0) {
      return NextResponse.json(
        { error: 'No questions found for this plebiscite' },
        { status: 400 }
      );
    }

    const voteEntries = Object.entries(votes);
    if (voteEntries.length !== questions.length) {
      return NextResponse.json(
        { error: 'Must answer all questions' },
        { status: 400 }
      );
    }

    const validatedVotes: Array<{questionId: number; voteData: any}> = [];

    for (const question of questions as any[]) {
      const voteValue = votes[question.id];
      const options = JSON.parse(question.options);

      if (voteValue === undefined || voteValue === null) {
        return NextResponse.json(
          { error: 'Answer required for question: ' + question.title },
          { status: 400 }
        );
      }

      if (question.type === 'yes_no') {
        if (!options.includes(voteValue)) {
          return NextResponse.json(
            { error: 'Invalid answer for question: ' + question.title },
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
            { error: 'At least one selection required for question: ' + question.title },
            { status: 400 }
          );
        }

        for (const choice of voteValue) {
          if (!options.includes(choice)) {
            return NextResponse.json(
              { error: 'Invalid selection for question: ' + question.title },
              { status: 400 }
            );
          }
        }

        validatedVotes.push({
          questionId: question.id,
          voteData: { choices: voteValue }
        });

      } else if (question.type === 'ranked_choice') {
        if (!Array.isArray(voteValue) || voteValue.length !== options.length) {
          return NextResponse.json(
            { error: 'Must rank all options for question: ' + question.title },
            { status: 400 }
          );
        }

        if (!validateIRVVote(voteValue, options)) {
          return NextResponse.json(
            { error: 'Invalid ranking for question: ' + question.title },
            { status: 400 }
          );
        }

        validatedVotes.push({
          questionId: question.id,
          voteData: { preferences: voteValue }
        });

      } else if (question.type === 'condorcet') {
        if (!Array.isArray(voteValue) || voteValue.length !== options.length) {
          return NextResponse.json(
            { error: 'Must rank all options for question: ' + question.title },
            { status: 400 }
          );
        }

        if (!validateCondorcetVote(voteValue, options)) {
          return NextResponse.json(
            { error: 'Invalid ranking for question: ' + question.title },
            { status: 400 }
          );
        }

        validatedVotes.push({
          questionId: question.id,
          voteData: { preferences: voteValue }
        });
      }
    }

    const finalVerificationMethod = verificationMethod || (identifierType === 'phone' ? 'sms' : 'email');

    const submitVotes = db.transaction((validatedVotes: any[], participationData: any) => {
      const receiptCodes: string[] = [];

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

      const insertParticipation = db.prepare(`
        INSERT INTO participation (plebiscite_id, voter_roll_id, receipt_codes, verification_method)
        VALUES (?, ?, ?, ?)
      `);

      insertParticipation.run(
        participationData.plebisciteId,
        participationData.voterRollId,
        JSON.stringify(receiptCodes),
        participationData.verificationMethod
      );

      return receiptCodes;
    });

    const receiptCodes = submitVotes(validatedVotes, {
      plebisciteId: plebiscite.id,
      voterRollId: voter.id,
      verificationMethod: finalVerificationMethod
    });

    const response = NextResponse.json({
      success: true,
      message: 'Vote submitted successfully',
      receiptCodes: receiptCodes,
      plebisciteTitle: plebiscite.title
    });

    response.cookies.delete('voter-session-' + plebisciteSlug);

    return response;

  } catch (error) {
    console.error('Vote submission error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
