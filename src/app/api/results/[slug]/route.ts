import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { getAdminSessionFromRequest } from '@/lib/auth';
import { tabulateIRV, exportIRVResultsCSV } from '@/lib/irv';
import { tabulateCondorcet, exportCondorcetResultsCSV } from '@/lib/condorcet';

export async function GET(
  request: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    const { slug } = params;
    const url = new URL(request.url);
    const format = url.searchParams.get('format');

    const plebiscite = db.prepare('SELECT * FROM plebiscites WHERE slug = ?').get(slug) as any;
    if (!plebiscite) {
      return NextResponse.json({ error: 'Election not found' }, { status: 404 });
    }

    if (plebiscite.status !== 'closed') {
      const now = new Date();
      const closeDate = new Date(plebiscite.close_date);
      if (now < closeDate) {
        return NextResponse.json({ error: 'Results not yet available. Voting is still active.' }, { status: 403 });
      }
    }

    // AUTH CHECK: admin or verified elector only
    const isAdmin = !!getAdminSessionFromRequest(request);

    let isElector = false;
    if (!isAdmin) {
      const cookieName = 'voter-session-' + slug;
      const voterSessionId = request.cookies.get(cookieName)?.value;
      if (voterSessionId) {
        const session = db.prepare('SELECT * FROM sessions WHERE id = ? AND is_admin = FALSE').get(voterSessionId) as any;
        if (session && new Date(session.expires_at) > new Date()) {
          isElector = true;
        }
      }

      // Also check for ballot token
      const token = url.searchParams.get('token');
      if (token) {
        const voterToken = db.prepare(
          'SELECT vt.*, vr.email, vr.phone FROM voter_tokens vt JOIN voter_roll vr ON vr.id = vt.voter_roll_id WHERE vt.token = ? AND vt.plebiscite_id = ?'
        ).get(token, plebiscite.id) as any;

        if (voterToken) {
          const participated = db.prepare(
            'SELECT 1 FROM participation WHERE plebiscite_id = ? AND voter_roll_id = ?'
          ).get(plebiscite.id, voterToken.voter_roll_id);
          if (participated) {
            isElector = true;
          }
        }
      }
    }

    if (!isAdmin && !isElector) {
      return NextResponse.json(
        { error: 'Results are only available to administrators and electors who participated in this election.' },
        { status: 403 }
      );
    }

    const questions = db.prepare('SELECT * FROM questions WHERE plebiscite_id = ? ORDER BY display_order').all(plebiscite.id) as any[];
    if (questions.length === 0) {
      return NextResponse.json({ error: 'No questions found for this election' }, { status: 404 });
    }

    const participationCount = db.prepare('SELECT COUNT(*) as count FROM participation WHERE plebiscite_id = ?').get(plebiscite.id) as { count: number };

    const results = [];
    let csvData = '';

    for (const question of questions) {
      const options = JSON.parse(question.options);
      const votes = db.prepare('SELECT vote_data FROM votes WHERE question_id = ?').all(question.id) as any[];

      const questionResult: any = {
        id: question.id,
        title: question.title,
        description: question.description,
        type: question.type,
        options,
        preferentialType: question.preferential_type,
        totalVotes: votes.length,
        results: {}
      };

      if (question.type === 'yes_no') {
        const counts: { [key: string]: number } = {};
        options.forEach((o: string) => counts[o] = 0);
        votes.forEach((v: any) => {
          const d = JSON.parse(v.vote_data);
          if (d.choice && counts.hasOwnProperty(d.choice)) counts[d.choice]++;
        });
        questionResult.results = counts;
        if (format === 'csv') {
          csvData += 'Question: ' + question.title + '\nType: Yes/No\n';
          Object.entries(counts).forEach(([opt, cnt]) => {
            const pct = votes.length > 0 ? ((cnt / votes.length) * 100).toFixed(1) : '0.0';
            csvData += '"' + opt + '",' + cnt + ',' + pct + '%\n';
          });
          csvData += '\n';
        }

      } else if (question.type === 'multiple_choice') {
        const counts: { [key: string]: number } = {};
        options.forEach((o: string) => counts[o] = 0);
        votes.forEach((v: any) => {
          const d = JSON.parse(v.vote_data);
          if (d.choices && Array.isArray(d.choices)) {
            d.choices.forEach((c: string) => { if (counts.hasOwnProperty(c)) counts[c]++; });
          }
        });
        questionResult.results = counts;
        if (format === 'csv') {
          csvData += 'Question: ' + question.title + '\nType: Multiple Choice\n';
          const total = Object.values(counts).reduce((s: number, c: any) => s + c, 0);
          Object.entries(counts).forEach(([opt, cnt]) => {
            const pct = total > 0 ? ((cnt / total) * 100).toFixed(1) : '0.0';
            csvData += '"' + opt + '",' + cnt + ',' + pct + '%\n';
          });
          csvData += '\n';
        }

      } else if (question.type === 'ranked_choice') {
        const irvVotes = votes.map((v: any) => ({ preferences: JSON.parse(v.vote_data).preferences || [] }));
        const irvResult = tabulateIRV(irvVotes, options);
        questionResult.results = { winner: irvResult.winner, rounds: irvResult.rounds, totalVotes: irvResult.totalVotes, exhaustedBallots: irvResult.exhaustedBallots };
        if (format === 'csv') {
          csvData += 'Question: ' + question.title + '\nType: Ranked Choice (IRV)\n';
          csvData += exportIRVResultsCSV(irvResult) + '\n';
        }

      } else if (question.type === 'condorcet') {
        const cVotes = votes.map((v: any) => ({ preferences: JSON.parse(v.vote_data).preferences || [] }));
        const cResult = tabulateCondorcet(cVotes, options);
        questionResult.results = { winner: cResult.winner, condorcetWinner: cResult.condorcetWinner, method: cResult.method, pairwiseMatrix: cResult.pairwiseMatrix, rounds: cResult.rounds, totalVotes: cResult.totalVotes, rankings: cResult.rankings };
        if (format === 'csv') {
          csvData += 'Question: ' + question.title + '\nType: Condorcet (' + cResult.method + ')\n';
          csvData += exportCondorcetResultsCSV(cResult) + '\n';
        }
      }

      results.push(questionResult);
    }

    if (format === 'csv') {
      const filename = slug + '-results-' + new Date().toISOString().split('T')[0] + '.csv';
      return new NextResponse(csvData, {
        headers: { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="' + filename + '"' }
      });
    }

    return NextResponse.json({
      plebiscite: { id: plebiscite.id, slug: plebiscite.slug, title: plebiscite.title, description: plebiscite.description, info_url: plebiscite.info_url, open_date: plebiscite.open_date, close_date: plebiscite.close_date, status: plebiscite.status },
      participation: { totalVotes: participationCount.count },
      questions: results
    });

  } catch (error) {
    console.error('Results API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
