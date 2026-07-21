import crypto from 'node:crypto';
import db from '@/lib/db';
import { canonicalStringify } from '@/lib/encrypted-ballots';
import { tabulateCondorcet } from '@/lib/condorcet';
import { tabulateIRV, type IRVTieResolution } from '@/lib/irv';

export type ResultCountMethod = 'irv' | 'condorcet';

export interface ResultCountRun {
  id: number;
  plebisciteId: number;
  questionId: number;
  questionTitle: string;
  method: ResultCountMethod;
  status: 'complete' | 'pending_tie';
  result: any;
  settings: {
    primaryMethod: ResultCountMethod;
    algorithm: 'votekit-irv-v1' | 'votekit-condorcet-schulze-v1';
    preferentialType: 'compulsory' | 'optional';
    options: string[];
    tieResolutions: IRVTieResolution[];
  };
  sourceBallotHash: string;
  resultHash: string;
  createdByName: string | null;
  createdAt: string;
}

function sha256(value: unknown): string {
  return crypto.createHash('sha256').update(canonicalStringify(value), 'utf8').digest('hex');
}

function tieResolutionsFor(questionId: number): IRVTieResolution[] {
  return db.prepare(`
    SELECT round_number, resolution_type, tied_candidates, selected_candidate, method, note, resolved_at
    FROM irv_tie_resolutions WHERE question_id = ? ORDER BY round_number, id
  `).all(questionId).map((row: any): IRVTieResolution => ({
    round: Number(row.round_number),
    type: row.resolution_type,
    tiedCandidates: JSON.parse(row.tied_candidates),
    selectedCandidate: row.selected_candidate,
    method: row.method,
    note: row.note,
    resolvedAt: row.resolved_at
  }));
}

function rankedBallots(question: any): Array<{ receipt: string; preferences: string[] }> {
  if (question.privacy_mode === 'encrypted') {
    return (db.prepare(`
      SELECT receipt_code, ballot_data FROM published_ballots
      WHERE plebiscite_id = ? ORDER BY receipt_code
    `).all(question.plebiscite_id) as Array<{ receipt_code: string; ballot_data: string }>).map(row => {
      const answers = JSON.parse(row.ballot_data);
      return {
        receipt: row.receipt_code,
        preferences: Array.isArray(answers[question.public_id]) ? answers[question.public_id] : []
      };
    });
  }
  return (db.prepare(`
    SELECT receipt_code, vote_data FROM votes WHERE question_id = ? ORDER BY receipt_code
  `).all(question.id) as Array<{ receipt_code: string; vote_data: string }>).map(row => ({
    receipt: row.receipt_code,
    preferences: (() => {
      const ballot = JSON.parse(row.vote_data);
      return Array.isArray(ballot.preferences) ? ballot.preferences : [];
    })()
  }));
}

export function createResultCountRun(input: {
  questionId: number;
  method: ResultCountMethod;
  adminUserId: number;
}): ResultCountRun {
  const question = db.prepare(`
    SELECT q.*, p.id AS plebiscite_id, p.status AS election_status, p.privacy_mode
    FROM questions q JOIN plebiscites p ON p.id = q.plebiscite_id
    WHERE q.id = ?
  `).get(input.questionId) as any;
  if (!question || !['ranked_choice', 'condorcet'].includes(question.type)) throw new Error('Compatible ranked question not found');
  if (question.election_status !== 'closed') throw new Error('Alternative counts can only be created after voting closes');

  const ballots = rankedBallots(question);
  const options = JSON.parse(question.options) as string[];
  const resolutions = tieResolutionsFor(question.id);
  const sourceBallotHash = sha256({
    electionId: question.plebiscite_id,
    questionId: question.public_id,
    ballots
  });
  const result: any = input.method === 'irv'
    ? tabulateIRV(ballots.map(ballot => ({ preferences: ballot.preferences })), options, resolutions)
    : tabulateCondorcet(ballots.map(ballot => ({ preferences: ballot.preferences })), options);
  const settings = {
    primaryMethod: (question.type === 'ranked_choice' ? 'irv' : 'condorcet') as ResultCountMethod,
    algorithm: (input.method === 'irv' ? 'votekit-irv-v1' : 'votekit-condorcet-schulze-v1') as 'votekit-irv-v1' | 'votekit-condorcet-schulze-v1',
    preferentialType: (question.preferential_type || 'compulsory') as 'compulsory' | 'optional',
    options,
    tieResolutions: input.method === 'irv' ? resolutions : []
  };
  const status = input.method === 'irv' && result.pendingTie ? 'pending_tie' : 'complete';
  const resultHash = sha256({ method: input.method, sourceBallotHash, settings, result });

  const id = Number(db.prepare(`
    INSERT INTO result_count_runs
      (plebiscite_id, question_id, method, status, result_json, settings_json,
       source_ballot_hash, result_hash, created_by_admin_user_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    question.plebiscite_id, question.id, input.method, status,
    JSON.stringify(result), JSON.stringify(settings), sourceBallotHash, resultHash, input.adminUserId
  ).lastInsertRowid);
  return getResultCountRun(id)!;
}

export function getResultCountRun(id: number): ResultCountRun | null {
  const row = db.prepare(`
    SELECT r.*, q.title AS question_title, u.name AS creator_name, u.email AS creator_email
    FROM result_count_runs r
    JOIN questions q ON q.id = r.question_id
    LEFT JOIN admin_users u ON u.id = r.created_by_admin_user_id
    WHERE r.id = ?
  `).get(id) as any;
  return row ? publicRun(row) : null;
}

export function listResultCountRuns(plebisciteId: number): ResultCountRun[] {
  return (db.prepare(`
    SELECT r.*, q.title AS question_title, u.name AS creator_name, u.email AS creator_email
    FROM result_count_runs r
    JOIN questions q ON q.id = r.question_id
    LEFT JOIN admin_users u ON u.id = r.created_by_admin_user_id
    WHERE r.plebiscite_id = ? ORDER BY r.created_at, r.id
  `).all(plebisciteId) as any[]).map(publicRun);
}

function publicRun(row: any): ResultCountRun {
  return {
    id: Number(row.id),
    plebisciteId: Number(row.plebiscite_id),
    questionId: Number(row.question_id),
    questionTitle: row.question_title,
    method: row.method,
    status: row.status,
    result: JSON.parse(row.result_json),
    settings: JSON.parse(row.settings_json),
    sourceBallotHash: row.source_ballot_hash,
    resultHash: row.result_hash,
    createdByName: row.creator_name,
    createdAt: row.created_at
  };
}
