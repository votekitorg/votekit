import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { tabulateIRV, exportIRVResultsCSV } from '@/lib/irv';
import { tabulateCondorcet, exportCondorcetResultsCSV } from '@/lib/condorcet';

export async function GET(
  request: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    const { slug } = params;
    const url = new URL(request.url);
    const format = url.searchParams.get('format'); // 'csv' for CSV export

    // Get plebiscite
    const plebiscite = db.prepare('SELECT * FROM plebiscites WHERE slug = ?').get(slug) as any;
    if (!plebiscite) {
      return NextResponse.json(
        { error: 'Plebiscite not found' },
        { status: 404 }
      );
    }

    // Check if plebiscite is closed (results only visible after closing)
    if (plebiscite.status !== 'closed') {
      // Check if close date has passed
      const now = new Date();
      const closeDate = new Date(plebiscite.close_date);
      
      if (now < closeDate) {
        return NextResponse.json(
          { error: 'Results not yet available. Voting is still active.' },
          { status: 403 }
        );
      }
    }

    // Get questions
    const questions = db.prepare(`
      SELECT * FROM questions 
      WHERE plebiscite_id = ? 
      ORDER BY display_order
    `).all(plebiscite.id) as any[];

    if (questions.length === 0) {
      return NextResponse.json(
        { error: 'No questions found for this plebiscite' },
        { status: 404 }
      );
    }

    // Get participation count
    const participationCount = db.prepare(`
      SELECT COUNT(*) as count FROM participation WHERE plebiscite_id = ?
    `).get(plebiscite.id) as { count: number };

    // Process results for each question
    const results = [];
    let csvData = '';

    for (const question of questions as any[]) {
      const options = JSON.parse(question.options);
      
      // Get votes for this question
      const votes = db.prepare(`
        SELECT vote_data FROM votes WHERE question_id = ?
      `).all(question.id) as any[];

      const questionResult = {
        id: question.id,
        title: question.title,
        description: question.description,
        type: question.type,
        options: options,
        totalVotes: votes.length,
        results: {} as any
      };

      if (question.type === 'yes_no') {
        // Count Yes/No votes
        const counts: { [key: string]: number } = {};
        options.forEach((option: string) => counts[option] = 0);

        votes.forEach((vote: any) => {
          const voteData = JSON.parse(vote.vote_data);
          if (voteData.choice && counts.hasOwnProperty(voteData.choice)) {
            counts[voteData.choice]++;
          }
        });

        questionResult.results = counts;

        if (format === 'csv') {
          csvData += `Question: ${question.title}\n`;
          csvData += `Type: Yes/No\n`;
          Object.entries(counts).forEach(([option, count]) => {
            const percentage = votes.length > 0 ? ((count / votes.length) * 100).toFixed(1) : '0.0';
            csvData += `"${option}",${count},${percentage}%\n`;
          });
          csvData += '\n';
        }

      } else if (question.type === 'multiple_choice') {
        // Count multiple choice votes
        const counts: { [key: string]: number } = {};
        options.forEach((option: string) => counts[option] = 0);

        votes.forEach((vote: any) => {
          const voteData = JSON.parse(vote.vote_data);
          if (voteData.choices && Array.isArray(voteData.choices)) {
            voteData.choices.forEach((choice: string) => {
              if (counts.hasOwnProperty(choice)) {
                counts[choice]++;
              }
            });
          }
        });

        questionResult.results = counts;

        if (format === 'csv') {
          csvData += `Question: ${question.title}\n`;
          csvData += `Type: Multiple Choice\n`;
          const totalSelections = Object.values(counts).reduce((sum: number, count: any) => sum + count, 0);
          Object.entries(counts).forEach(([option, count]) => {
            const percentage = totalSelections > 0 ? ((count / totalSelections) * 100).toFixed(1) : '0.0';
            csvData += `"${option}",${count},${percentage}%\n`;
          });
          csvData += '\n';
        }

      } else if (question.type === 'ranked_choice') {
        // Process IRV votes
        const irvVotes = votes.map((vote: any) => {
          const voteData = JSON.parse(vote.vote_data);
          return { preferences: voteData.preferences || [] };
        });

        const irvResult = tabulateIRV(irvVotes, options);
        
        questionResult.results = {
          winner: irvResult.winner,
          rounds: irvResult.rounds,
          totalVotes: irvResult.totalVotes,
          exhaustedBallots: irvResult.exhaustedBallots
        };

        if (format === 'csv') {
          csvData += `Question: ${question.title}\n`;
          csvData += `Type: Ranked Choice (IRV)\n`;
          csvData += exportIRVResultsCSV(irvResult);
          csvData += '\n';
        }
      } else if (question.type === 'condorcet') {
        // Process Condorcet votes
        const condorcetVotes = votes.map((vote: any) => {
          const voteData = JSON.parse(vote.vote_data);
          return { preferences: voteData.preferences || [] };
        });

        const condorcetResult = tabulateCondorcet(condorcetVotes, options);
        
        questionResult.results = {
          winner: condorcetResult.winner,
          condorcetWinner: condorcetResult.condorcetWinner,
          method: condorcetResult.method,
          pairwiseMatrix: condorcetResult.pairwiseMatrix,
          rounds: condorcetResult.rounds,
          totalVotes: condorcetResult.totalVotes,
          rankings: condorcetResult.rankings
        };

        if (format === 'csv') {
          csvData += `Question: ${question.title}\n`;
          csvData += `Type: Condorcet (${condorcetResult.method})\n`;
          csvData += exportCondorcetResultsCSV(condorcetResult);
          csvData += '\n';
        }
      }

      results.push(questionResult);
    }

    // Return CSV if requested
    if (format === 'csv') {
      const filename = `${slug}-results-${new Date().toISOString().split('T')[0]}.csv`;
      
      return new NextResponse(csvData, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="${filename}"`
        }
      });
    }

    // Return JSON results
    return NextResponse.json({
      plebiscite: {
        id: plebiscite.id,
        slug: plebiscite.slug,
        title: plebiscite.title,
        description: plebiscite.description,
        info_url: plebiscite.info_url,
        open_date: plebiscite.open_date,
        close_date: plebiscite.close_date,
        status: plebiscite.status
      },
      participation: {
        totalVotes: participationCount.count,
        // Calculate participation rate if we knew total eligible voters
        // This would require additional data about total voter roll size at time of plebiscite
      },
      questions: results
    });

  } catch (error) {
    console.error('Results API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}