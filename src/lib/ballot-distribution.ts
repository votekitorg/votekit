import db from '@/lib/db';

export interface BallotDistributionAdjustment {
  id: number;
  ballotsDistributed: number;
  previousBallotsDistributed: number;
  generatedCredentials: number;
  reason: string;
  adjustedByName: string | null;
  createdAt: string;
}

export interface BallotDistributionSummary {
  totalVotes: number;
  eligibleCredentials: number;
  ballotsDistributed: number;
  ballotsDistributedSource: 'generated_credentials' | 'administrator_reported';
  participationRate: number | null;
  distributionAdjustments: BallotDistributionAdjustment[];
}

export function countElectionCredentials(plebisciteId: number, accessMode: string): number {
  const table = accessMode === 'anonymous_codes' ? 'anonymous_access_codes' : 'voter_roll';
  return (db.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE plebiscite_id = ?`)
    .get(plebisciteId) as { count: number }).count;
}

export function listBallotDistributionAdjustments(plebisciteId: number): BallotDistributionAdjustment[] {
  return (db.prepare(`
    SELECT a.id, a.ballots_distributed, a.previous_ballots_distributed,
      a.generated_credentials, a.reason, a.created_at, u.name AS adjusted_by_name
    FROM ballot_distribution_adjustments a
    LEFT JOIN admin_users u ON u.id = a.adjusted_by_admin_user_id
    WHERE a.plebiscite_id = ?
    ORDER BY a.id ASC
  `).all(plebisciteId) as any[]).map(row => ({
    id: Number(row.id),
    ballotsDistributed: Number(row.ballots_distributed),
    previousBallotsDistributed: Number(row.previous_ballots_distributed),
    generatedCredentials: Number(row.generated_credentials),
    reason: row.reason,
    adjustedByName: row.adjusted_by_name || null,
    createdAt: row.created_at
  }));
}

export function getBallotDistributionSummary(plebisciteId: number, accessMode: string): BallotDistributionSummary {
  const totalVotes = (db.prepare('SELECT COUNT(*) AS count FROM participation WHERE plebiscite_id = ?')
    .get(plebisciteId) as { count: number }).count;
  const eligibleCredentials = countElectionCredentials(plebisciteId, accessMode);
  const distributionAdjustments = listBallotDistributionAdjustments(plebisciteId);
  const latest = distributionAdjustments.at(-1);
  const ballotsDistributed = latest?.ballotsDistributed ?? eligibleCredentials;

  return {
    totalVotes,
    eligibleCredentials,
    ballotsDistributed,
    ballotsDistributedSource: latest ? 'administrator_reported' : 'generated_credentials',
    participationRate: ballotsDistributed > 0 ? (totalVotes / ballotsDistributed) * 100 : null,
    distributionAdjustments
  };
}
