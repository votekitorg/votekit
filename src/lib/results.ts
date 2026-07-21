import db from '@/lib/db';
import { tabulateIRV, exportIRVResultsCSV, type IRVTieResolution } from '@/lib/irv';
import { tabulateCondorcet, exportCondorcetResultsCSV } from '@/lib/condorcet';
import { buildEncryptedManifest } from '@/lib/encrypted-election-server';
import type { EncryptedElectionManifest } from '@/lib/encrypted-ballots';
import { listResultCountRuns, type ResultCountRun } from '@/lib/result-count-runs';

export interface PlebisciteResultsData {
  plebiscite: {
    id: number;
    slug: string;
    title: string;
    description: string;
    info_url?: string;
    open_date: string;
    close_date: string;
    status: string;
    accessMode: 'voter_roll' | 'anonymous_codes';
    privacyMode: 'legacy' | 'encrypted';
    privacyThreshold: number;
    ballotPublicationMode: 'threshold' | 'always';
  };
  participation: {
    totalVotes: number;
    eligibleCredentials: number;
    participationRate: number | null;
  };
  encryptedAudit?: {
    manifest: EncryptedElectionManifest;
    manifestHash: string;
    inputHash: string;
    outputHash: string;
  };
  countRuns: ResultCountRun[];
  questions: Array<{
    id: number;
    publicId: string;
    title: string;
    description?: string;
    type: 'yes_no' | 'multiple_choice' | 'ranked_choice' | 'condorcet';
    options: string[];
    preferentialType?: string;
    totalVotes: number;
    results: any;
    publicBallots: Array<{
      receiptCode: string;
      ballot: {
        choice?: string;
        choices?: string[];
        preferences?: string[];
      };
    }>;
  }>;
}

export class ResultsUnavailableError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ResultsUnavailableError';
    this.status = status;
  }
}

export function getPlebisciteResults(slug: string): PlebisciteResultsData {
  const plebiscite = db.prepare('SELECT * FROM plebiscites WHERE slug = ?').get(slug) as any;
  if (!plebiscite) {
    throw new ResultsUnavailableError('Election not found', 404);
  }

  // Results and anonymous ballot receipts are only public after an admin closes the election.
  if (plebiscite.status !== 'closed') {
    throw new ResultsUnavailableError('Results not yet available. Voting is still active.', 403);
  }

  const questions = db.prepare(`
    SELECT * FROM questions
    WHERE plebiscite_id = ?
    ORDER BY display_order
  `).all(plebiscite.id) as any[];

  if (questions.length === 0) {
    throw new ResultsUnavailableError('No questions found for this election', 404);
  }

  const participationCount = db.prepare(`
    SELECT COUNT(*) as count FROM participation WHERE plebiscite_id = ?
  `).get(plebiscite.id) as { count: number };
  const eligibleCredentials = plebiscite.access_mode === 'anonymous_codes'
    ? (db.prepare('SELECT COUNT(*) AS count FROM anonymous_access_codes WHERE plebiscite_id = ?').get(plebiscite.id) as { count: number }).count
    : (db.prepare('SELECT COUNT(*) AS count FROM voter_roll WHERE plebiscite_id = ?').get(plebiscite.id) as { count: number }).count;

  const encryptedPublishedBallots = plebiscite.privacy_mode === 'encrypted'
    ? db.prepare(`
        SELECT receipt_code, ballot_data FROM published_ballots
        WHERE plebiscite_id = ? ORDER BY display_order
      `).all(plebiscite.id) as Array<{ receipt_code: string; ballot_data: string }>
    : [];

  const results = questions.map((question) => {
    const options = JSON.parse(question.options);

    // Receipt codes are deliberately selected from the anonymous ballot table only,
    // not from participation/voter data.
    const votes = plebiscite.privacy_mode === 'encrypted'
      ? encryptedPublishedBallots.map(ballot => ({
          receipt_code: ballot.receipt_code,
          vote_data: JSON.stringify((() => {
            const answer = JSON.parse(ballot.ballot_data)[question.public_id];
            if (question.type === 'yes_no') return { choice: answer };
            if (question.type === 'multiple_choice') return { choices: answer };
            return { preferences: answer };
          })())
        }))
      : db.prepare(`
          SELECT receipt_code, vote_data FROM votes WHERE question_id = ? ORDER BY receipt_code
        `).all(question.id) as any[];

    const publicBallots = (plebiscite.ballot_publication_mode === 'always' ||
      participationCount.count >= Number(plebiscite.privacy_threshold || 20))
      ? votes.map((vote: any) => ({
          receiptCode: vote.receipt_code,
          ballot: JSON.parse(vote.vote_data)
        }))
      : [];

    const questionResult = {
      id: question.id,
      publicId: question.public_id,
      title: question.title,
      description: question.description,
      type: question.type,
      options,
      preferentialType: question.preferential_type,
      totalVotes: votes.length,
      results: {} as any,
      publicBallots
    };

    if (question.type === 'yes_no') {
      const counts: { [key: string]: number } = {};
      options.forEach((option: string) => counts[option] = 0);

      votes.forEach((vote: any) => {
        const voteData = JSON.parse(vote.vote_data);
        if (voteData.choice && Object.prototype.hasOwnProperty.call(counts, voteData.choice)) {
          counts[voteData.choice]++;
        }
      });

      questionResult.results = counts;
    } else if (question.type === 'multiple_choice') {
      const counts: { [key: string]: number } = {};
      options.forEach((option: string) => counts[option] = 0);

      votes.forEach((vote: any) => {
        const voteData = JSON.parse(vote.vote_data);
        if (voteData.choices && Array.isArray(voteData.choices)) {
          // Ballots stored before duplicate rejection may contain repeats.
          new Set<string>(voteData.choices).forEach((choice: string) => {
            if (Object.prototype.hasOwnProperty.call(counts, choice)) {
              counts[choice]++;
            }
          });
        }
      });

      questionResult.results = counts;
    } else if (question.type === 'ranked_choice') {
      const irvVotes = votes.map((vote: any) => {
        const voteData = JSON.parse(vote.vote_data);
        return { preferences: voteData.preferences || [] };
      });

      const tieResolutions = db.prepare(`
        SELECT round_number, resolution_type, tied_candidates, selected_candidate, method, note, resolved_at
        FROM irv_tie_resolutions WHERE question_id = ? ORDER BY round_number, id
      `).all(question.id).map((row: any): IRVTieResolution => ({
        round: Number(row.round_number),
        type: row.resolution_type,
        tiedCandidates: JSON.parse(row.tied_candidates),
        selectedCandidate: row.selected_candidate,
        method: row.method,
        note: row.note,
        resolvedAt: row.resolved_at
      }));
      const irvResult = tabulateIRV(irvVotes, options, tieResolutions);
      questionResult.results = {
        winner: irvResult.winner,
        rounds: irvResult.rounds,
        totalVotes: irvResult.totalVotes,
        exhaustedBallots: irvResult.exhaustedBallots,
        pendingTie: irvResult.pendingTie
      };
    } else if (question.type === 'condorcet') {
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
        rankings: condorcetResult.rankings,
        tiedCandidates: condorcetResult.tiedCandidates
      };
    }

    return questionResult;
  });

  const encryptedArtifact = plebiscite.privacy_mode === 'encrypted'
    ? db.prepare(`
        SELECT input_hash, output_hash FROM encrypted_close_artifacts WHERE plebiscite_id = ?
      `).get(plebiscite.id) as { input_hash: string; output_hash: string } | undefined
    : undefined;

  return {
    plebiscite: {
      id: plebiscite.id,
      slug: plebiscite.slug,
      title: plebiscite.title,
      description: plebiscite.description,
      info_url: plebiscite.info_url,
      open_date: plebiscite.open_date,
      close_date: plebiscite.close_date,
      status: plebiscite.status,
      accessMode: plebiscite.access_mode || 'voter_roll',
      privacyMode: plebiscite.privacy_mode || 'legacy',
      privacyThreshold: Number(plebiscite.privacy_threshold || 20),
      ballotPublicationMode: plebiscite.ballot_publication_mode || 'threshold'
    },
    participation: {
      totalVotes: participationCount.count,
      eligibleCredentials,
      participationRate: eligibleCredentials > 0 ? (participationCount.count / eligibleCredentials) * 100 : null
    },
    ...(encryptedArtifact ? {
      encryptedAudit: {
        manifest: buildEncryptedManifest(plebiscite),
        manifestHash: plebiscite.manifest_hash,
        inputHash: encryptedArtifact.input_hash,
        outputHash: encryptedArtifact.output_hash
      }
    } : {}),
    countRuns: listResultCountRuns(plebiscite.id),
    questions: results
  };
}

export function buildResultsCsv(slug: string, data: PlebisciteResultsData): string {
  let csvData = '';

  const csvCell = (value: unknown): string => {
    let text = String(value ?? '');
    // Spreadsheet applications may execute formula-looking cells even when
    // quoted. Prefix untrusted election text so downloads remain inert.
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  };

  if (data.encryptedAudit) {
    csvData += `${csvCell('Encrypted ballot protocol')},${csvCell(data.encryptedAudit.manifest.protocol)}\n`;
    csvData += `${csvCell('Manifest hash')},${csvCell(data.encryptedAudit.manifestHash)}\n`;
    csvData += `${csvCell('Frozen input hash')},${csvCell(data.encryptedAudit.inputHash)}\n`;
    csvData += `${csvCell('Published output hash')},${csvCell(data.encryptedAudit.outputHash)}\n\n`;
  }

  for (const question of data.questions) {
    if (question.type === 'yes_no') {
      csvData += `${csvCell(`Question: ${question.title}`)}\n`;
      csvData += `Type: Yes/No\n`;
      Object.entries(question.results).forEach(([option, count]) => {
        const percentage = question.totalVotes > 0 ? ((Number(count) / question.totalVotes) * 100).toFixed(1) : '0.0';
        csvData += `${csvCell(option)},${count},${percentage}%\n`;
      });
      csvData += 'Anonymous Ballots\n';
      csvData += 'Receipt Code,Choice\n';
      question.publicBallots.forEach(({ receiptCode, ballot }) => {
        csvData += `${csvCell(receiptCode)},${csvCell(ballot.choice || '')}\n`;
      });
      csvData += '\n';
    } else if (question.type === 'multiple_choice') {
      csvData += `${csvCell(`Question: ${question.title}`)}\n`;
      csvData += `Type: Multiple Choice\n`;
      const totalSelections = Object.values(question.results).reduce((sum: number, count: any) => sum + count, 0);
      Object.entries(question.results).forEach(([option, count]) => {
        const percentage = totalSelections > 0 ? ((Number(count) / totalSelections) * 100).toFixed(1) : '0.0';
        csvData += `${csvCell(option)},${count},${percentage}%\n`;
      });
      csvData += 'Anonymous Ballots\n';
      csvData += 'Receipt Code,Choices\n';
      question.publicBallots.forEach(({ receiptCode, ballot }) => {
        csvData += `${csvCell(receiptCode)},${csvCell((ballot.choices || []).join(' | '))}\n`;
      });
      csvData += '\n';
    } else if (question.type === 'ranked_choice') {
      csvData += `${csvCell(`Question: ${question.title}`)}\n`;
      csvData += `Type: Ranked Choice (IRV)\n`;
      csvData += exportIRVResultsCSV(question.results);
      csvData += 'Anonymous Ballots\n';
      csvData += 'Receipt Code,Preferences\n';
      question.publicBallots.forEach(({ receiptCode, ballot }) => {
        csvData += `${csvCell(receiptCode)},${csvCell((ballot.preferences || []).join(' > '))}\n`;
      });
      csvData += '\n';
    } else if (question.type === 'condorcet') {
      csvData += `${csvCell(`Question: ${question.title}`)}\n`;
      csvData += `Type: Condorcet (${question.results.method})\n`;
      csvData += exportCondorcetResultsCSV(question.results);
      csvData += 'Anonymous Ballots\n';
      csvData += 'Receipt Code,Preferences\n';
      question.publicBallots.forEach(({ receiptCode, ballot }) => {
        csvData += `${csvCell(receiptCode)},${csvCell((ballot.preferences || []).join(' > '))}\n`;
      });
      csvData += '\n';
    }
  }

  if (data.countRuns.length > 0) {
    csvData += `${csvCell('Alternative Count Runs')}\n`;
    for (const run of data.countRuns) {
      csvData += `${csvCell(`Count run #${run.id}: ${run.questionTitle}`)}\n`;
      csvData += `${csvCell('Method')},${csvCell(run.method.toUpperCase())}\n`;
      csvData += `${csvCell('Status')},${csvCell(run.status)}\n`;
      csvData += `${csvCell('Created')},${csvCell(run.createdAt)}\n`;
      csvData += `${csvCell('Created by')},${csvCell(run.createdByName || 'Election official')}\n`;
      csvData += `${csvCell('Algorithm')},${csvCell(run.settings.algorithm)}\n`;
      csvData += `${csvCell('Source ballot fingerprint')},${csvCell(run.sourceBallotHash)}\n`;
      csvData += `${csvCell('Result fingerprint')},${csvCell(run.resultHash)}\n`;
      csvData += run.method === 'irv' ? exportIRVResultsCSV(run.result) : exportCondorcetResultsCSV(run.result);
      csvData += '\n';
    }
  }

  return csvData;
}

export function resultsCsvFilename(slug: string, now: Date = new Date()): string {
  return `${slug}-results-${now.toISOString().split('T')[0]}.csv`;
}
